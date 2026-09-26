import { BasePaymentProvider } from "../base";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VirtualAccountResponse,
  QrisResponse,
  EWalletResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
  PaymentMethod,
  UpdateVaParams,
  UpdateVaResult,
  DeleteVaParams,
  DeleteVaResult,
  ValidateBankAccountParams,
  ValidateBankAccountResult,
  DisburseParams,
  DisburseResult,
} from "../../types";
import { toDokuPaymentMethod } from "../../core/canonical";
import { CANONICAL_TO_DOKU } from "../../core/canonical";
import { generateDokuHeaders, verifyDokuWebhookSignature } from "./signature";
import { signedPayload, resolveRawBody, RAW_BODY_REQUIRED_MESSAGE } from "../../utils/rawBody";
import { sha256 } from "../../utils/crypto";
import { SnapClient } from "../../clients/snap";
import { DokuClient } from "../../clients/doku";
import { verifySnapWebhookSignature, snapTimestamp, snapExternalId, generateSnapSymmetricSignature, sha256Hex } from "./snap";
import {
  buildDokuMcpMethods,
  callDokuMcpTool,
  createDokuMcpVirtualAccount,
  DOKU_MCP_DELETE_VA_TOOL,
  DOKU_MCP_ONLY_VA_CHANNELS,
  DOKU_MCP_UPDATE_VA_TOOL,
  fetchDokuMerchantPaymentMethods,
  resolveDokuMcpCredentials,
} from "./mcp";
import { httpFetch } from "../../utils/http";

/** D-16: resolusi kanonikal VA mcpOnly dari input bank (mis. "btn" → "btn_va"). */
function resolveMcpOnlyVaMethod(bank?: string): string | undefined {
  const b = String(bank || "").toLowerCase().replace(/\s+/g, "_");
  if (!b) return undefined;
  const candidate = b.endsWith("_va") ? b : `${b}_va`;
  return CANONICAL_TO_DOKU[candidate]?.mcpOnly ? candidate : undefined;
}

/**
 * DOKU mengirim beberapa tanggal dalam format ringkas `yyyyMMddHHmmss` (zona WIB/UTC+7).
 * Helper ini mengubahnya menjadi `Date` yang benar-benar merepresentasikan instan WIB.
 */
function parseDokuCompactDate(compact: string): Date | undefined {
  if (!/^\d{14}$/.test(compact)) return undefined;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6)) - 1;
  const day = Number(compact.slice(6, 8));
  const hour = Number(compact.slice(8, 10));
  const minute = Number(compact.slice(10, 12));
  const second = Number(compact.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour - 7, minute, second));
}

export class DokuProvider extends BasePaymentProvider {
  readonly name = "doku";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api-sandbox.doku.com"
      : "https://api.doku.com";
  }

  /**
   * DETEKSI mode integrasi DOKU:
   * - SNAP  : kredensial baru (Client ID `doku_...` + Secret Key `SK-...`) + opsional RSA privateKey
   *           untuk Get Token B2B. Diaktifkan via extra.snap / extra.dokuMode="snap" / doku_ prefix.
   * - Legacy: Jokul v2 (Client-Id + Signature HMAC-SHA256), default jika bukan SNAP.
   */
  private isSnap(config: ProviderConfig): boolean {
    if (config.extra?.snap === true || config.extra?.snap === "true") return true;
    if (config.extra?.dokuMode === "snap") return true;
    const clientId = String(config.merchantCode || config.merchantId || config.clientKey || "").trim().toLowerCase();
    return /^doku[_:-]/.test(clientId);
  }

  private buildSnap(config: ProviderConfig): SnapClient {
    const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
    const clientSecret = config.apiKey || config.serverKey || config.secretKey || "";
    return new SnapClient({
      clientId,
      clientSecret,
      privateKey: config.privateKey,
      sandbox: !!config.sandbox,
      merchantId: config.extra?.merchantId || config.projectId || "",
      terminalId: config.extra?.terminalId || "",
      partnerServiceId: config.extra?.partnerServiceId || "",
      channelId: config.extra?.channelId || "H2H",
    });
  }

  /** Helper: jumlah integer → format SNAP 2-desimal (".00"). */
  private snapAmount(amount: number, currency = "IDR") {
    return { value: amount.toFixed(2), currency };
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, customer, returnUrl } = params;
    const productDetails = params.productDetails || params.description || "Payment";
    const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const dokuMethod = toDokuPaymentMethod(params.paymentMethod);
    const isDirect = !!dokuMethod;

    // DANA & ShopeePay tidak punya endpoint non-SNAP di DOKU — hanya lewat SNAP.
    if (dokuMethod?.snapOnly && !this.isSnap(config)) {
      const requested =
        typeof params.paymentMethod === "string"
          ? params.paymentMethod
          : (params.paymentMethod as any)?.raw || "";
      return {
        success: false,
        provider: "doku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error:
          `Metode '${requested}' pada DOKU hanya tersedia lewat jalur SNAP ` +
          "(DOKU tidak menyediakan endpoint non-SNAP untuk kanal ini — QRIS, DANA, dan " +
          "ShopeePay hanya via SNAP). Aktifkan dengan config.extra.snap = true + " +
          "Client ID `doku_...` dan Secret Key `SK-...`.",
      };
    }

    const baseUrl = this.getBaseUrl(sandbox);

    try {
      if (this.isSnap(config)) {
        return await this.createSnapInvoice(params, config, baseUrl);
      }
      // D-16: kanal VA tanpa endpoint REST non-SNAP (BTN, BJB, BPD Bali, Sinarmas,
      // OCBC, BNC, BSS) diterbitkan via layanan VA terpadu DOKU — tool MCP
      // `create_virtual_account_payment` (respons BI-SNAP VA, BIN aggregator merchant).
      // Butuh kredensial MCP (DOKU_MCP_API_KEY / DOKU_API_KEY → extra.mcpApiKey).
      if (dokuMethod?.mcpOnly) {
        return await this.createMcpVaInvoice(params, config, dokuMethod);
      }
      if (isDirect) {
        // Direct Payment API (Jokul v2)
        const endpoint = dokuMethod.endpoint;
        const url = `${baseUrl}${endpoint}`;

        let payload: any;
        if (dokuMethod.type === "va") {
          const trimmedInfo =
            productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails;
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            virtual_account_info: {
              expired_time: 1440,
              reusable_status: false,
              // Permata menolak field `info1` (payload → "Invalid JSON Format"); kanal itu
              // memakai `ref_info` untuk info tambahan (diverifikasi live).
              ...(dokuMethod.bank === "permata"
                ? { ref_info: [{ ref_name: "Info", ref_value: trimmedInfo }] }
                : { info1: trimmedInfo }),
              // BNI mewajibkan `merchant_unique_reference` (alfanumerik, maks 13, UNIK per
              // request). Sebelumnya diturunkan dari digit orderId sehingga sering kolaps
              // jadi 1 karakter dan bentrok ("different request data"). Diambil dari
              // orderId yang disanitasi (alfanumerik, 13 karakter terakhir).
              ...(dokuMethod.bank === "bni"
                ? {
                    merchant_unique_reference:
                      orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-13) || `REF${String(Date.now()).slice(-10)}`,
                  }
                : {}),
            },
            customer: {
              name: customer.name,
              email: customer.email,
            },
            ...params.providerParams,
          };
        } else if (dokuMethod.type === "qris") {
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            qris_info: {
              expired_time: 1440,
            },
            ...params.providerParams,
          };
        } else if (dokuMethod.type === "cstore") {
          // Nama field resmi DOKU non-SNAP adalah `online_to_offline_info` (bukan `online_info`).
          // `reusable_status` bersifat Mandatory.
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            online_to_offline_info: {
              expired_time: 1440,
              reusable_status: false,
              info: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
            },
            customer: {
              name: customer.name,
              email: customer.email,
            },
            ...params.providerParams,
          };
        } else {
          // E-Wallet non-SNAP: DOKU hanya menyediakan OVO Push Payment di jalur ini.
          // Endpoint resmi: POST /ovo-emoney/v1/payment
          // Payload: client.id + order + ovo_info.ovo_id + security.check_sum
          // check_sum = sha256(order.amount + client.id + order.invoice_number + ovo_id + secretKey)
          if (!customer.phone) {
            return {
              success: false,
              provider: "doku",
              orderId,
              amount: integerAmount,
              rawResponse: null,
              error:
                "DOKU OVO Push Payment membutuhkan customer.phone (ovo_info.ovo_id). DANA & ShopeePay hanya tersedia via SNAP (config.extra.snap).",
            };
          }
          const checkSum = sha256(`${integerAmount}${clientId}${orderId}${customer.phone}${secretKey}`);
          payload = {
            client: { id: clientId },
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            ovo_info: {
              ovo_id: customer.phone,
            },
            security: {
              check_sum: checkSum,
            },
            ...params.providerParams,
          };
        }

        const headers = generateDokuHeaders(clientId, secretKey, endpoint, payload);

        const response = await httpFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok || !data) {
          return {
            success: false,
            provider: "doku",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.error?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        const res: InvoiceResponse = {
          success: true,
          provider: "doku",
          orderId: data.order?.invoice_number || orderId,
          amount: data.order?.amount || integerAmount,
          reference: data.virtual_account_info?.virtual_account_number || data.order?.invoice_number || orderId,
          rawResponse: data,
        };

        if (data.virtual_account_info) {
          res.vaNumber = data.virtual_account_info.virtual_account_number;
          res.vaBank = dokuMethod.bank;
          res.paymentUrl = data.virtual_account_info.how_to_pay_page;
          // Sebagian bank mengembalikan `expired_date` format compact `yyyyMMddHHmmss`
          // (bukan ISO) → `new Date()` langsung menghasilkan Invalid Date. Utamakan
          // `expired_date_utc` (ISO) bila ada, lalu parse compact dengan helper.
          const vaExp = data.virtual_account_info.expired_date_utc || data.virtual_account_info.expired_date;
          if (vaExp) {
            res.expiresAt = String(vaExp).length === 14 ? parseDokuCompactDate(String(vaExp)) : new Date(vaExp);
          }
        } else if (data.qris_info) {
          res.qrString = data.qris_info.qr_content;
          res.qrCodeUrl = data.qris_info.qr_image_url;
        } else if (data.online_to_offline_info) {
          res.paymentCode = data.online_to_offline_info.payment_code;
          res.paymentUrl = data.online_to_offline_info.how_to_pay_page;
          const exp = data.online_to_offline_info.expired_date || data.online_to_offline_info.expired_date_utc;
          if (exp) res.expiresAt = exp.length === 14 ? parseDokuCompactDate(exp) : new Date(exp);
        } else if (data.ovo_payment) {
          // OVO Push Payment: sukses bila `ovo_payment.status === "SUCCESS"`.
          res.mode = "ewallet";
          if (String(data.ovo_payment.status || "").toUpperCase() === "SUCCESS") {
            res.reference = String(data.ovo_payment.reference_number || data.order?.invoice_number || orderId);
          }
        } else if (data.payment_instruction) {
          res.deeplink = data.payment_instruction.url || data.payment_instruction.deeplink;
          res.paymentUrl = res.deeplink;
        }

        return res;
      } else {
        // Semi Integrasi (Jokul Checkout v1)
        const endpoint = "/checkout/v1/payment";
        const url = `${baseUrl}${endpoint}`;

        const payload = {
          order: {
            invoice_number: orderId,
            amount: integerAmount,
            callback_url: returnUrl || config.returnUrl || "",
            line_items: [
              {
                name: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
                price: integerAmount,
                quantity: 1,
              },
            ],
          },
          payment: {
            payment_due_date: 60,
          },
          customer: {
            name: customer.name,
            email: customer.email,
            ...(customer.phone ? { phone: customer.phone } : {}),
          },
          ...params.providerParams,
        };

        const headers = generateDokuHeaders(clientId, secretKey, endpoint, payload);

        const response = await httpFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok || !data) {
          return {
            success: false,
            provider: "doku",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.error?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        const checkoutUrl = data.response?.payment?.url || data.payment?.url || data.url;

        return {
          success: true,
          provider: "doku",
          orderId: data.response?.order?.invoice_number || orderId,
          amount: data.response?.order?.amount || integerAmount,
          reference: data.response?.order?.invoice_number || orderId,
          paymentUrl: checkoutUrl,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to DOKU API",
      };
    }
  }

  /**
   * D-16: buat transaksi VA untuk kanal **mcpOnly** (BTN, BJB, BPD Bali, Sinarmas, OCBC,
   * BNC, BSS) lewat tool MCP `create_virtual_account_payment`. Respons berbentuk BI-SNAP
   * VA (`virtualAccountData`) — dinormalkan ke `InvoiceResponse`.
   */
  private async createMcpVaInvoice(
    params: CreateInvoiceParams,
    config: ProviderConfig,
    dokuMethod: { endpoint: string; type: "va" | "qris" | "cstore" | "ewallet"; bank?: string; snapOnly?: boolean; mcpOnly?: boolean }
  ): Promise<InvoiceResponse> {
    const { orderId, amount, customer } = params;
    const integerAmount = Math.round(amount);
    const creds = resolveDokuMcpCredentials(config);
    const bank = String(dokuMethod.bank || "").replace(/\s+/g, "_");
    const method = `${bank}_va`;
    const channel = DOKU_MCP_ONLY_VA_CHANNELS[method];

    if (!creds || !channel) {
      return {
        success: false,
        provider: "doku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error:
          `Kanal '${method}' tidak punya endpoint REST non-SNAP di DOKU. Terbitkan via ` +
          "DOKU MCP Server: isi DOKU_MCP_API_KEY (API Key General, bukan Secret Key SK-...) " +
          "di config.extra.mcpApiKey, atau aktifkan jalur SNAP (config.extra.snap = true).",
      };
    }

    try {
      const data = await createDokuMcpVirtualAccount(creds, {
        channel,
        amount: integerAmount,
        trxId: orderId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
      });
      const va = data?.virtualAccountData;
      if (!va) {
        return {
          success: false,
          provider: "doku",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error:
            data?.responseMessage || data?.error?.message || "DOKU MCP VA gagal dibuat (tanpa virtualAccountData)",
        };
      }
      return {
        success: true,
        provider: "doku",
        mode: "va",
        orderId: va.trxId || orderId,
        amount: Number(va.totalAmount?.value || integerAmount) || integerAmount,
        reference: va.virtualAccountNo || orderId,
        vaNumber: String(va.virtualAccountNo || "").trim(),
        vaBank: bank.replace(/_/g, " "),
        paymentUrl: va.additionalInfo?.howToPayPage,
        expiresAt: va.expiredDate ? new Date(va.expiredDate) : undefined,
        rawResponse: data,
      } as VirtualAccountResponse;
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e?.message || "Failed to create DOKU MCP Virtual Account",
      };
    }
  }

  /**
   * DOKU SNAP: buat transaksi (Create VA / Generate QRIS / e-Wallet Payment).
   * Autentikasi via B2B token + symmetric HMAC-SHA512 signature.
   */
  private async createSnapInvoice(
    params: CreateInvoiceParams,
    config: ProviderConfig,
    baseUrl: string
  ): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const snap = this.buildSnap(config);
    const integerAmount = Math.round(amount);
    const method = String(params.paymentMethod || "").toLowerCase();

    const bankMap: Record<string, string> = {
      bca: "VIRTUAL_ACCOUNT_BCA",
      mandiri: "VIRTUAL_ACCOUNT_BANK_MANDIRI",
      bri: "VIRTUAL_ACCOUNT_BRI",
      bni: "VIRTUAL_ACCOUNT_BNI",
      permata: "VIRTUAL_ACCOUNT_BANK_PERMATA",
      cimb: "VIRTUAL_ACCOUNT_BANK_CIMB",
      danamon: "VIRTUAL_ACCOUNT_BANK_DANAMON",
      bsi: "VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI",
      sinarmas: "VIRTUAL_ACCOUNT_SINARMAS",
      bjb: "VIRTUAL_ACCOUNT_BANK_BJB",
      btn: "VIRTUAL_ACCOUNT_BTN",
      bnc: "VIRTUAL_ACCOUNT_BNC",
    };

    const isVa = method.includes("_va");
    const isQris = method === "qris" || method.includes("qris");

    try {
      if (isVa) {
        return await this.snapCreateVA(params, config, snap, baseUrl, bankMap);
      }
      if (isQris) {
        return await this.snapGenerateQRIS(params, config, snap, baseUrl);
      }
      // e-Wallet (DANA / OVO / ShopeePay)
      return await this.snapEWalletPayment(params, config, snap, baseUrl);

    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId,
        amount: integerAmount,
        rawResponse: e?.raw ?? e?.rawResponse ?? null,
        error: e?.message || "Failed to make SNAP request to DOKU API",
      };
    }
  }

  /** Create Virtual Account (SNAP) — DOKU Generate Payment Code. */
  private async snapCreateVA(
    params: CreateInvoiceParams,
    config: ProviderConfig,
    snap: SnapClient,
    baseUrl: string,
    bankMap: Record<string, string>
  ): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer } = params;
    const method = String(params.paymentMethod || "").toLowerCase();
    const bankKey = method.replace(/_va$/, "");
    const channel = config.extra?.vaChannel || bankMap[bankKey] || `VIRTUAL_ACCOUNT_${bankKey.toUpperCase()}`;
    // SNAP Create VA requires partnerServiceId as exactly 8-char left-padded
    // string (the merchant BIN / company code). Normalize digits then pad.
    const rawPartnerServiceId = (config.extra?.partnerServiceId || "").replace(/\s/g, "");
    const partnerServiceId = rawPartnerServiceId.padStart(8, " ").slice(0, 8);
    const customerNo = (config.extra?.customerNo || "").replace(/\s/g, "").slice(0, 20) || String(Date.now()).slice(-12);
    // DOKU example: "partnerServiceId (8 left-padded) + customerNo"
    const virtualAccountNo = (partnerServiceId + customerNo).slice(0, 28);
    const reusable = config.extra?.reusableStatus === true;
    const currency = params.currency || "IDR";

    const body: any = {
      partnerServiceId,
      customerNo,
      virtualAccountNo,
      virtualAccountName: customer.name || "Customer",
      virtualAccountEmail: customer.email,
      virtualAccountPhone: customer.phone,
      trxId: orderId,
      totalAmount: this.snapAmount(amount, currency),
      virtualAccountTrxType: "C",
      additionalInfo: {
        channel,
        virtualAccountConfig: { reusableStatus: reusable },
      },
    };
    if (params.providerParams) {
      Object.assign(body.additionalInfo.virtualAccountConfig, params.providerParams);
    }
    if (config.extra?.expiredDate) body.expiredDate = config.extra.expiredDate;

    const endpoint = "/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va";
    const data = await snap.request("POST", endpoint, body);
    const vaData = data.virtualAccountData || {};

    return {
      success: true,
      provider: "doku",
      mode: "va",
      orderId: vaData.trxId || orderId,
      amount: Number(vaData.totalAmount?.value || amount) || Math.round(amount),
      reference: vaData.virtualAccountNo || orderId,
      vaNumber: vaData.virtualAccountNo,
      vaBank: bankKey.toUpperCase(),
      paymentUrl: vaData.additionalInfo?.howToPayPage,
      expiresAt: vaData.expiredDate ? new Date(vaData.expiredDate) : undefined,
      rawResponse: data,
    } as VirtualAccountResponse;
  }

  /** Generate QRIS (SNAP) — dynamic QRIS MPM. */
  private async snapGenerateQRIS(
    params: CreateInvoiceParams,
    config: ProviderConfig,
    snap: SnapClient,
    baseUrl: string
  ): Promise<InvoiceResponse> {
    const { orderId, amount } = params;
    const currency = params.currency || "IDR";
    const merchantId = config.extra?.merchantId || config.projectId || "";
    const terminalId = config.extra?.terminalId || "0001";
    const body: any = {
      partnerReferenceNo: orderId,
      amount: this.snapAmount(amount, currency),
      merchantId,
      terminalId,
      validityPeriod: config.extra?.validityPeriod || new Date(Date.now() + 3600 * 1000).toISOString(),
      additionalInfo: {
        postalCode: config.extra?.postalCode || "10110",
        // Contoh resmi SNAP memakai string, bukan number.
        feeType: "1",
      },
    };
    if (params.providerParams) {
      Object.assign(body.additionalInfo, params.providerParams);
    }

    const endpoint = "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate";
    const data = await snap.request("POST", endpoint, body);

    return {
      success: true,
      provider: "doku",
      mode: "qris",
      orderId: data.partnerReferenceNo || orderId,
      amount: Number(data.amount?.value || amount) || Math.round(amount),
      reference: data.referenceNo || orderId,
      qrString: data.qrContent,
      rawResponse: data,
    } as QrisResponse;
  }

  /** e-Wallet payment (SNAP) — DANA / OVO / ShopeePay via payment-host-to-host. */
  private async snapEWalletPayment(
    params: CreateInvoiceParams,
    config: ProviderConfig,
    snap: SnapClient,
    baseUrl: string
  ): Promise<InvoiceResponse> {
    const { orderId, amount } = params;
    const method = String(params.paymentMethod || "").toLowerCase();
    const currency = params.currency || "IDR";
    const returnUrl = params.returnUrl || config.returnUrl || "";
    const channelMap: Record<string, string> = {
      dana: "EMONEY_DANA_SNAP",
      ovo: "EMONEY_OVO_SNAP",
      shopeepay: "EMONEY_SHOPEEPAY_SNAP",
    };
    const channel = config.extra?.ewalletChannel || channelMap[method] || `EMONEY_${method.toUpperCase()}_SNAP`;

    const body: any = {
      partnerReferenceNo: orderId,
      amount: this.snapAmount(amount, currency),
      pointOfInitiation: "pc",
      urlParam: {
        url: returnUrl || "https://example.com/return",
        type: "PAY_RETURN",
        isDeepLink: "N",
      },
      additionalInfo: {
        channel,
        orderTitle: params.productDetails || `Pembayaran ${orderId}`,
        supportDeepLinkCheckoutUrl: "false",
      },
    };
    if (params.providerParams) {
      Object.assign(body.additionalInfo, params.providerParams);
    }

    const endpoint = "/direct-debit/core/v1/debit/payment-host-to-host";
    const data = await snap.request("POST", endpoint, body, {
      deviceId: config.extra?.deviceId,
      ipAddress: config.extra?.ipAddress,
    });

    return {
      success: true,
      provider: "doku",
      mode: "ewallet" as const,
      orderId: data.partnerReferenceNo || orderId,
      amount: Number(data.amount?.value || amount) || Math.round(amount),
      reference: data.partnerReferenceNo || orderId,
      paymentUrl: data.webRedirectUrl || data.paymentUrl,
      checkoutUrl: data.webRedirectUrl || data.paymentUrl,
      rawResponse: data,
    } as EWalletResponse;
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const headers = config.extra?.headers || {};

    if (this.isSnap(config)) {
      return this.verifySnapCallback(body, config, headers);
    }

    const secretKey = config.secretKey || config.apiKey || "";
    const signature = headers["signature"] || headers["Signature"] || config.extra?.dokuSignature || config.extra?.signatureHeader;
    const clientId = config.merchantCode || config.clientKey || "";

    // DOKU menandatangani Digest atas byte yang benar-benar dikirim. Kalau kita
    // re-serialize dengan JSON.stringify, urutan key/spasi/escape bisa berbeda dari
    // byte aslinya — dan penyerang yang menyusun payload-nya sendiri bisa membuatnya
    // cocok kembali. Jadi raw body WAJIB ada; tidak ada → tolak, jangan diterka.
    const rawBody = resolveRawBody(config, body);

    // SECURITY: default false — tanpa signature/header, webhook ditolak.
    let isValid = false;
    if (rawBody !== undefined && (signature || (headers && (headers["request-id"] || headers["Request-Id"])))) {
      isValid = verifyDokuWebhookSignature(headers, rawBody, clientId, secretKey, undefined, rawBody);
    }

    // Data bisnis WAJIB diturunkan dari byte yang ditandatangani. Kalau tidak,
    // penyerang bisa mengirim rawBody asli (signature cocok) sambil menyodorkan
    // `body` lain berisi orderId/amount/status pilihan mereka sendiri.
    const parsed = signedPayload(body, config);

    const rawStatus = (parsed.transaction?.status || parsed.status || "").toUpperCase();

    const isPaid = isValid && (rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED");
    const isPending = isValid && rawStatus === "PENDING";
    const isExpired = isValid && rawStatus === "EXPIRED";
    const isFailed = !isValid || rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const orderId = parsed.order?.invoice_number || parsed.invoice_number || parsed.order_id || "";
    const amount = parsed.order?.amount || parsed.amount || 0;

    const status: "paid" | "pending" | "failed" | "expired" = !isValid
      ? "failed"
      : isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

    return {
      isValid,
      provider: "doku",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: rawStatus,
      rawPayload: parsed,
      error: isValid
        ? undefined
        : rawBody === undefined
          ? RAW_BODY_REQUIRED_MESSAGE
          : "Invalid or missing DOKU webhook signature.",
    };
  }

  /**
   * Verifikasi webhook / notifikasi DOKU SNAP.
   * Signature dibangun dengan symmetric HMAC-SHA512 (AccessToken kosong).
   */
  private verifySnapCallback(
    body: any,
    config: ProviderConfig,
    headers: Record<string, string | string[] | undefined>
  ): VerifyCallbackResult {
    const clientSecret = config.apiKey || config.serverKey || config.secretKey || "";
    const endpointUrl = (
      config.extra?.notificationPath ||
      (headers["x-path"] as string) ||
      config.extra?.headers?.["request-target"] ||
      "/api/payment/webhook"
    ) as string;

    // SNAP menandatangani SHA-256 dari body JSON yang sudah di-minify. Rekonstruksi
    // dari objek hasil parse tidak selalu identik dengan byte yang dikirim (escape
    // Unicode, format angka, urutan key numerik), jadi raw body WAJIB ada.
    const rawBody = resolveRawBody(config, body);

    // SECURITY: default false — tanpa signature/secret, webhook ditolak.
    let isValid = false;
    const incomingSig = (
      headers["x-signature"] || headers["X-SIGNATURE"] || headers["signature"] || headers["Signature"] || ""
    ) as string;
    if (rawBody !== undefined && incomingSig && clientSecret) {
      isValid = verifySnapWebhookSignature(headers, rawBody, clientSecret, endpointUrl);
    }

    // Data bisnis diturunkan dari byte yang sama dengan yang ditandatangani.
    const parsed = signedPayload(body, config);

    // Status: payment notification diterima → PAID. field status eksplisit bila ada.
    const explicitStatus = String(parsed.transactionStatus || parsed.status || parsed.latestTransactionStatus || "").toUpperCase();
    const isPaid =
      isValid && (
        explicitStatus === "SUCCESS" || explicitStatus === "PAID" || explicitStatus === "SETTLED" || explicitStatus === "00" ||
        (!explicitStatus && Boolean(parsed.paidAmount?.value ?? parsed.totalAmount?.value))
      );
    const isPending = isValid && (explicitStatus === "PENDING" || explicitStatus === "11" || explicitStatus === "ONGOING");
    const isExpired = isValid && explicitStatus === "EXPIRED";
    const isFailed = !isValid || explicitStatus === "FAILED" || explicitStatus === "DECLINED" ||
      (Boolean(explicitStatus) && !isPaid && !isPending && explicitStatus !== "00");

    const orderId =
      parsed.trxId || parsed.partnerReferenceNo || parsed.originalPartnerReferenceNo ||
      parsed.order?.invoice_number || parsed.invoice_number || parsed.order_id || "";

    const paidValue = parsed.paidAmount?.value ?? parsed.totalAmount?.value ?? parsed.amount?.value ?? parsed.amount ?? 0;

    const status: "paid" | "pending" | "failed" | "expired" = !isValid
      ? "failed"
      : isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

    return {
      isValid,
      provider: "doku",
      orderId: String(orderId),
      amount: Number(paidValue) || 0,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: explicitStatus || "SUCCESS",
      rawPayload: parsed,
      error: isValid
        ? undefined
        : rawBody === undefined
          ? RAW_BODY_REQUIRED_MESSAGE
          : "Invalid or missing DOKU SNAP webhook signature.",
    };
  }


  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    // 1. LIVE: DOKU MCP Server `get_merchant_payment_methods` — channel yang benar-benar
    //    terdaftar/aktif untuk akun merchant ini. Aktif bila kredensial MCP tersedia
    //    (`DOKU_MCP_API_KEY`/`DOKU_API_KEY` → `extra.mcpApiKey`).
    const mcpCreds = resolveDokuMcpCredentials(config);
    if (mcpCreds) {
      const payload = await fetchDokuMerchantPaymentMethods(mcpCreds);
      const mcpMethods = payload ? buildDokuMcpMethods(payload) : [];
      if (mcpMethods.length > 0) {
        const mcpCategories: Record<string, PaymentMethod[]> = {};
        for (const item of mcpMethods) {
          (mcpCategories[item.category] ||= []).push(item);
        }
        return {
          success: true,
          provider: "doku",
          methods: mcpMethods,
          categories: mcpCategories,
          // `source: "mcp"` menandai bahwa daftar ini LIVE (dibaca dari MCP),
          // bukan katalog statis SDK.
          rawResponse: { source: "mcp", url: mcpCreds.url, ...payload },
        };
      }
    }

    // 2. Fallback: katalog statis SDK.
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bca.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/mandiri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bni.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/permata.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/cimb.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "danamon_va",
        paymentName: "Danamon Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/danamon.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bsi.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (GoPay, ShopeePay, DANA, OVO, LinkAja)",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart / Alfa Group",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (Visa, Mastercard, JCB)",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "kredivo",
        code: "kredivo",
        paymentName: "Kredivo Paylater",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/kredivo.png",
        totalFee: "2.3%",
        category: "Paylater / Cicilan",
      },
      {
        paymentMethod: "akulaku",
        code: "akulaku",
        paymentName: "Akulaku Paylater",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/akulaku.png",
        totalFee: "1.7%",
        category: "Paylater / Cicilan",
      },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of staticMethods) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    return {
      success: true,
      provider: "doku",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{
    success: boolean;
    enabled: string[];
    source?: "live" | "static";
    error?: string;
  }> {
    // LIVE bila daftar berasal dari DOKU MCP (`rawResponse.source === "mcp"`);
    // `"static"` bila jatuh ke katalog SDK (tanpa kredensial MCP / MCP gagal).
    try {
      const res = await this.getPaymentMethods({ amount: 10000 }, config);
      const raw: any = res.rawResponse;
      const live = !!raw && !Array.isArray(raw) && raw.source === "mcp";
      return {
        success: res.success,
        enabled: res.success ? res.methods.map((m) => m.paymentMethod) : [],
        source: live ? "live" : "static",
        ...(res.error ? { error: res.error } : {}),
      };
    } catch (e: any) {
      return {
        success: false,
        enabled: [],
        source: "static",
        error: e?.message || "Failed to probe DOKU payment methods",
      };
    }
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    if (this.isSnap(config)) {
      return this.snapCheckTransaction(params, config, clientId);
    }

    const endpoint = `/orders/v1/status/${merchantOrderId}`;
    const url = `${this.getBaseUrl(sandbox)}${endpoint}`;
    const headers = generateDokuHeaders(clientId, secretKey, endpoint);

    try {
      const response = await httpFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false,
          provider: "doku",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.error?.message || `HTTP error! Status: ${response.status}`,
          error: data?.error?.message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const txStatus = (data.transaction?.status || data.status || "").toUpperCase();
      const isPaid = txStatus === "SUCCESS" || txStatus === "PAID" || txStatus === "SETTLED";
      const isPending = txStatus === "PENDING";
      const isExpired = txStatus === "EXPIRED";
      const isFailed = txStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "doku",
        orderId: data.order?.invoice_number || merchantOrderId,
        reference: data.transaction?.id || data.order?.invoice_number || "",
        amount: data.order?.amount ? Number(data.order.amount) : 0,
        statusCode: txStatus,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.transaction?.status || "",
        paymentType: data.service?.id,
        transactionTime: data.transaction?.date ? new Date(data.transaction.date) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in DOKU",
        error: e.message || "Failed to check transaction status in DOKU",
        rawResponse: null,
      };
    }
  }

  /** Cek status transaksi SNAP (menggunakan Query QRIS bila ref berasal dari QRIS). */
  private async snapCheckTransaction(
    params: CheckTransactionParams,
    config: ProviderConfig,
    clientId: string
  ): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const snap = this.buildSnap(config);
    // Query QRIS dan Query VA memakai endpoint + service code berbeda. Pilih lewat
    // `config.extra.snapQueryType` ("qr" default, "va" untuk Virtual Account).
    const queryType = String(config.extra?.snapQueryType || "qr").toLowerCase();
    try {
      let data: any;
      let paymentType: string;

      if (queryType === "va") {
        // SNAP VA — inquiry/status. Wajib menyertakan partnerServiceId + customerNo
        // (dari dashboard DOKU) agar bisa ditelusuri oleh issuer.
        const body: any = {
          partnerServiceId: String(config.extra?.partnerServiceId || "").padStart(8, " ").slice(0, 8),
          customerNo: String(config.extra?.customerNo || "").slice(0, 20),
          virtualAccountNo: config.extra?.virtualAccountNo || merchantOrderId,
          trxId: merchantOrderId,
          additionalInfo: {},
        };
        data = await snap.request("POST", "/virtual-accounts/bi-snap-va/v1.1/transfer-va/status", body);
        paymentType = "VIRTUAL_ACCOUNT";
      } else {
        const body: any = {
          // Field ini wajib pada Query QRIS SNAP.
          originalReferenceNo: config.extra?.originalReferenceNo || merchantOrderId,
          originalPartnerReferenceNo: merchantOrderId,
          serviceCode: "47",
          merchantId: config.extra?.merchantId || config.projectId || "",
        };
        data = await snap.request("POST", "/snap-adapter/b2b/v1.0/qr/qr-mpm-query", body);
        paymentType = "QRIS";
      }

      const vaStatus = data.virtualAccountData?.paymentFlagStatus ?? data.paymentFlagStatus;
      const txStatus = String(data.latestTransactionStatus ?? vaStatus ?? "").toUpperCase();
      const isPaid =
        txStatus === "SUCCESS" || txStatus === "00" || txStatus === "PAID" || txStatus === "SETTLED" || txStatus === "PAID";
      const isPending = txStatus === "PENDING" || txStatus === "ONGOING" || txStatus === "11" || txStatus === "03";
      const isExpired = txStatus === "EXPIRED" || txStatus === "04";
      const isFailed = txStatus === "FAILED" || txStatus === "DECLINED" || (Boolean(txStatus) && !isPaid && !isPending && !isExpired);

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      const va = data.virtualAccountData || {};
      return {
        success: true,
        provider: "doku",
        orderId: data.originalPartnerReferenceNo || va.trxId || merchantOrderId,
        reference: data.originalReferenceNo || va.virtualAccountNo || "",
        amount: Number(data.amount?.value ?? va.totalAmount?.value ?? 0),
        statusCode: txStatus || String(data.responseCode || ""),
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: txStatus || data.responseMessage || "",
        paymentType,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check SNAP transaction status",
        error: e.message || "Failed to check SNAP transaction status",
        rawResponse: null,
      };
    }
  }

  /** D-16: update VA kanal mcpOnly via tool MCP `update_virtual_account_payment`. */
  private async updateMcpVirtualAccount(
    params: UpdateVaParams,
    config: ProviderConfig,
    method: string
  ): Promise<UpdateVaResult> {
    const creds = resolveDokuMcpCredentials(config);
    const channel = DOKU_MCP_ONLY_VA_CHANNELS[method];
    if (!creds || !channel || !params.vaNumber) {
      return {
        success: false,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        rawResponse: null,
        error: !creds
          ? "Kanal ini tidak punya endpoint REST non-SNAP; update VA via DOKU MCP butuh DOKU_MCP_API_KEY (extra.mcpApiKey)."
          : "vaNumber wajib diisi untuk update VA via DOKU MCP.",
      };
    }
    try {
      const toolRequest: Record<string, any> = {
        channel,
        trxId: params.orderId,
        virtualAccountNo: params.vaNumber,
        virtualAccountName: params.providerParams?.virtualAccountName || "Customer",
      };
      if (params.amount !== undefined) toolRequest.totalAmount = String(Math.round(params.amount));
      const data = await callDokuMcpTool(creds, DOKU_MCP_UPDATE_VA_TOOL, { toolRequest });
      const va = data?.virtualAccountData;
      if (!va) {
        return {
          success: false,
          provider: "doku",
          orderId: params.orderId,
          vaNumber: params.vaNumber,
          rawResponse: data,
          error: data?.responseMessage || "Update VA DOKU MCP gagal (tanpa virtualAccountData)",
        };
      }
      return {
        success: true,
        provider: "doku",
        orderId: va.trxId || params.orderId,
        vaNumber: String(va.virtualAccountNo || params.vaNumber).trim(),
        amount: params.amount,
        expiresAt: va.expiredDate ? new Date(va.expiredDate) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        rawResponse: null,
        error: e?.message || "Failed to update DOKU MCP Virtual Account",
      };
    }
  }

  /** D-16: hapus VA kanal mcpOnly via tool MCP `delete_virtual_account_payment`. */
  private async deleteMcpVirtualAccount(
    params: DeleteVaParams,
    config: ProviderConfig,
    method: string
  ): Promise<DeleteVaResult> {
    const creds = resolveDokuMcpCredentials(config);
    const channel = DOKU_MCP_ONLY_VA_CHANNELS[method];
    if (!creds || !channel || !params.vaNumber) {
      return {
        success: false,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        rawResponse: null,
        error: !creds
          ? "Kanal ini tidak punya endpoint REST non-SNAP; delete VA via DOKU MCP butuh DOKU_MCP_API_KEY (extra.mcpApiKey)."
          : "vaNumber wajib diisi untuk delete VA via DOKU MCP.",
      };
    }
    try {
      const data = await callDokuMcpTool(creds, DOKU_MCP_DELETE_VA_TOOL, {
        toolRequest: {
          channel,
          trxId: params.orderId,
          virtualAccountNo: params.vaNumber,
        },
      });
      if (!data) {
        return {
          success: false,
          provider: "doku",
          orderId: params.orderId,
          vaNumber: params.vaNumber,
          rawResponse: null,
          error: "Delete VA DOKU MCP gagal (tanpa respons)",
        };
      }
      return {
        success: true,
        provider: "doku",
        orderId: data.trxId || params.orderId,
        vaNumber: String(data.virtualAccountNo || params.vaNumber).trim(),
        status: data.responseMessage || data.status || "DELETED",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        rawResponse: null,
        error: e?.message || "Failed to delete DOKU MCP Virtual Account",
      };
    }
  }

  /**
   * Update Virtual Account (Jokul v2 atau BI-SNAP)
   */
  async updateVirtualAccount(params: UpdateVaParams, config: ProviderConfig): Promise<UpdateVaResult> {
    // D-16: kanal mcpOnly (BTN, BJB, ...) tidak punya endpoint REST — pakai MCP tool.
    const mcpMethod = resolveMcpOnlyVaMethod(params.bank);
    if (mcpMethod) {
      return this.updateMcpVirtualAccount(params, config, mcpMethod);
    }
    try {
      const client = new DokuClient(config);
      const data = await client.updateVirtualAccount(params);
      const vaData = data.virtualAccountData || data.virtual_account_info || {};
      return {
        success: true,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: vaData.virtual_account_number || vaData.virtualAccountNo || params.vaNumber,
        amount: params.amount,
        expiresAt: vaData.expired_date || vaData.expiredDate ? new Date(vaData.expired_date || vaData.expiredDate) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        rawResponse: null,
        error: e.message || "Failed to update DOKU Virtual Account",
      };
    }
  }

  /**
   * Delete / Cancel Virtual Account (Jokul v2 atau BI-SNAP)
   */
  async deleteVirtualAccount(params: DeleteVaParams, config: ProviderConfig): Promise<DeleteVaResult> {
    // D-16: kanal mcpOnly (BTN, BJB, ...) tidak punya endpoint REST — pakai MCP tool.
    const mcpMethod = resolveMcpOnlyVaMethod(params.bank);
    if (mcpMethod) {
      return this.deleteMcpVirtualAccount(params, config, mcpMethod);
    }
    try {
      const client = new DokuClient(config);
      const data = await client.deleteVirtualAccount(params);
      return {
        success: true,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        status: data.status || "DELETED",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: params.orderId,
        vaNumber: params.vaNumber,
        rawResponse: null,
        error: e.message || "Failed to delete DOKU Virtual Account",
      };
    }
  }

  /**
   * Validasi Rekening Bank / E-Wallet tujuan transfer (Kirim DOKU)
   */
  async validateBankAccount(params: ValidateBankAccountParams, config: ProviderConfig): Promise<ValidateBankAccountResult> {
    try {
      const client = new DokuClient(config);
      // DokuClient sudah fail-closed: melempar bila field wajib kurang atau
      // DOKU tidak mengembalikan `sessionId`. Jadi `success: true` di bawah
      // hanya tercapai bila benar-benar ada sessionId.
      //
      // Versi sebelumnya memakai `success: true` tanpa syarat apa pun, jadi
      // respons 404 "No static resource" pun terbaca sebagai validasi berhasil
      // — merchant menganggap nama pemilik rekening sudah terkonfirmasi padahal
      // tidak ada yang diverifikasi.
      const hasil = await client.validateBankAccount(params);
      return {
        success: true,
        provider: "doku",
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        accountHolderName: hasil.accountHolderName,
        sessionId: hasil.sessionId,
        rawResponse: hasil.rawResponse,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        rawResponse: null,
        error: e.message || "Gagal memvalidasi rekening bank di DOKU",
      };
    }
  }

  /**
   * Payout / Transfer Dana (Kirim DOKU Domestic Payouts)
   */
  async disburse(params: DisburseParams, config: ProviderConfig): Promise<DisburseResult> {
    try {
      const client = new DokuClient(config);
      const data = await client.disburse(params);

      // Kirim DOKU (Transfer Bank) tidak punya field `status` maupun `error` di
      // respons — hanya `responseCode` + `responseMessage`. Karena itu respons sukses
      // harus dibaca dari responseCode, bukan dari ketiadaan field error.
      //
      // Whitelist resmi (developers.doku.com → Response Code → Kirim DOKU →
      // Transfer Bank):
      //   2004300 = Successful, "Treat transactions with this status as success."
      //   2024300 = Transaction still on process
      // Selain itu DOKU menolak: 400/401/403/404/409/429/5xx — termasuk
      // 4034314 (Insufficient Funds) dan 4044311 (rekening penerima tidak valid).
      const responseCode = String(data?.responseCode ?? data?.response_code ?? "");
      const rawStatus = String(data?.status || "").toUpperCase();

      // `success` di sini berarti "permintaan diterima DOKU" — BUKAN "uang sudah
      // sampai". 2024300 tetap dianggap success supaya pemanggil tidak mengulang
      // payout yang sedang berjalan (risiko pengiriman ganda); yang menandai
      // masih proses adalah `status`.
      const isAccepted =
        responseCode === "2004300" || responseCode === "2024300" || rawStatus === "SUCCESS";
      const isPending = responseCode === "2024300" || rawStatus === "PENDING";

      return {
        success: isAccepted,
        supported: true,
        provider: "doku",
        reference: data?.referenceNo || data?.reference_no || data?.partnerReferenceNo || data?.partner_reference_no || params.externalId,
        status: isPending ? "PENDING" : rawStatus || (responseCode === "2004300" ? "SUCCESS" : "FAILED"),
        error: isAccepted
          ? undefined
          : data?.responseMessage || data?.response_message || `DOKU menolak payout (responseCode ${responseCode || "tidak ada"}).`,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        supported: true,
        provider: "doku",
        status: "FAILED",
        rawResponse: e?.raw ?? null,
        error: e.message || "DOKU disbursement failed",
      };
    }
  }
}
