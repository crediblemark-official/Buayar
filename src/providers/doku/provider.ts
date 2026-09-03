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
} from "../../types";
import { toDokuPaymentMethod } from "../../core/canonical";
import { generateDokuHeaders, verifyDokuWebhookSignature } from "./signature";
import { SnapClient } from "../../clients/snap";
import { verifySnapWebhookSignature, snapTimestamp, snapExternalId, generateSnapSymmetricSignature, sha256Hex } from "./snap";

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
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const dokuMethod = toDokuPaymentMethod(params.paymentMethod);
    const isDirect = !!dokuMethod;

    const baseUrl = this.getBaseUrl(sandbox);

    try {
      if (this.isSnap(config)) {
        return await this.createSnapInvoice(params, config, baseUrl);
      }
      if (isDirect) {
        // Direct Payment API (Jokul v2)
        const endpoint = dokuMethod.endpoint;
        const url = `${baseUrl}${endpoint}`;

        let payload: any;
        if (dokuMethod.type === "va") {
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            virtual_account_info: {
              expired_time: 1440,
              reusable_status: false,
              info1: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
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
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            online_info: {
              expired_time: 1440,
              reusable_status: false,
              info1: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
            },
            customer: {
              name: customer.name,
              email: customer.email,
            },
            ...params.providerParams,
          };
        } else {
          // E-Wallet
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            customer: {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            },
            ...params.providerParams,
          };
        }

        const headers = generateDokuHeaders(clientId, secretKey, endpoint, payload);

        const response = await fetch(url, {
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
          if (data.virtual_account_info.expired_date) {
            res.expiresAt = new Date(data.virtual_account_info.expired_date);
          }
        } else if (data.qris_info) {
          res.qrString = data.qris_info.qr_content;
          res.qrCodeUrl = data.qris_info.qr_image_url;
        } else if (data.online_info) {
          res.paymentCode = data.online_info.payment_code;
          res.paymentUrl = data.online_info.how_to_pay_page;
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
            phone: customer.phone || "",
          },
          ...params.providerParams,
        };

        const headers = generateDokuHeaders(clientId, secretKey, endpoint, payload);

        const response = await fetch(url, {
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
        feeType: 1,
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

    const rawStatus = (body.transaction?.status || body.status || "").toUpperCase();

    const isPaid = rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED";
    const isPending = rawStatus === "PENDING";
    const isExpired = rawStatus === "EXPIRED";
    const isFailed = rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const orderId = body.order?.invoice_number || body.invoice_number || body.order_id || "";
    const amount = body.order?.amount || body.amount || 0;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";

    const secretKey = config.secretKey || config.apiKey || "";
    const signature = headers["signature"] || headers["Signature"] || config.extra?.dokuSignature || config.extra?.signatureHeader;
    const clientId = config.merchantCode || config.clientKey || "";

    let isValid = true;
    if (signature || (headers && (headers["request-id"] || headers["Request-Id"]))) {
      isValid = verifyDokuWebhookSignature(headers, body, clientId, secretKey);
    }

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
      rawPayload: body,
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

    let isValid = true;
    const incomingSig = (
      headers["x-signature"] || headers["X-SIGNATURE"] || headers["signature"] || headers["Signature"] || ""
    ) as string;
    if (incomingSig && clientSecret) {
      isValid = verifySnapWebhookSignature(headers, body, clientSecret, endpointUrl);
    }

    // Status: payment notification diterima → PAID. field status eksplisit bila ada.
    const explicitStatus = String(body.transactionStatus || body.status || body.latestTransactionStatus || "").toUpperCase();
    const isPaid =
      explicitStatus === "SUCCESS" || explicitStatus === "PAID" || explicitStatus === "SETTLED" || explicitStatus === "00" ||
      (!explicitStatus && Boolean(body.paidAmount?.value ?? body.totalAmount?.value));
    const isPending = explicitStatus === "PENDING" || explicitStatus === "11" || explicitStatus === "ONGOING";
    const isFailed = explicitStatus === "FAILED" || explicitStatus === "DECLINED" ||
      (Boolean(explicitStatus) && !isPaid && !isPending && explicitStatus !== "00");
    const isExpired = explicitStatus === "EXPIRED";

    const orderId =
      body.trxId || body.partnerReferenceNo || body.originalPartnerReferenceNo ||
      body.order?.invoice_number || body.invoice_number || body.order_id || "";

    const paidValue = body.paidAmount?.value ?? body.totalAmount?.value ?? body.amount?.value ?? body.amount ?? 0;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
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
      rawPayload: body,
    };
  }


  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
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
      const response = await fetch(url, {
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
    try {
      const body: any = {
        originalPartnerReferenceNo: merchantOrderId,
        serviceCode: "47",
        merchantId: config.extra?.merchantId || config.projectId || "",
      };
      const data = await snap.request("POST", "/snap-adapter/b2b/v1.0/qr/qr-mpm-query", body);

      const txStatus = String(data.latestTransactionStatus || "").toUpperCase();
      const isPaid = txStatus === "SUCCESS" || txStatus === "00" || txStatus === "PAID" || txStatus === "SETTLED";
      const isPending = txStatus === "PENDING" || txStatus === "ONGOING" || txStatus === "11";
      const isExpired = txStatus === "EXPIRED";
      const isFailed = txStatus === "FAILED" || txStatus === "DECLINED" || (Boolean(txStatus) && !isPaid && !isPending && !isExpired);

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
        orderId: data.originalPartnerReferenceNo || merchantOrderId,
        reference: data.originalReferenceNo || "",
        amount: Number(data.amount?.value || 0),
        statusCode: txStatus || String(data.responseCode || ""),
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: txStatus || data.responseMessage || "",
        paymentType: "QRIS",
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
}
