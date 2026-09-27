import { BasePaymentProvider } from "../base";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
  PaymentMethod,
} from "../../types";
import { toFinpayPaymentMethod } from "../../core/canonical";
import { verifyFinpaySignature } from "./signature";
import { httpFetch } from "../../utils/http";

/**
 * Finpay Payment Gateway — implementasi berdasarkan dokumentasi resmi:
 *   https://docs.finpay.id/api-reference/finpay-pg/
 *
 * Kontrak kunci (semua diverifikasi ke docs, bukan asumsi):
 *   • Auth         : header `Authorization: Basic base64(merchantId:merchantKey)`
 *                    (Authorization & Headers)
 *   • Endpoint     : POST {base}/pg/payment/card/initiate  (Hosted Payment, QRIS, VA)
 *                    GET  {base}/pg/payment/card/check/{orderId}  (Status Check)
 *   • Base URL     : sandbox  → https://devo.finnet.co.id
 *                    produksi → https://live.finnet.co.id
 *   • Body         : object bersarang { order, customer, url, sourceOfFunds? }
 *   • Sukses       : `responseCode === "2000000"`
 *   • Callback     : HMAC-SHA512(json_encode(body tanpa `signature`), Merchant Key)
 *   • Status bayar : order.result.payment.status (PAID / CAPTURED / PENDING / …)
 */

/** Kode sukses Finpay (Response Code List, HTTP 200 / SVC 00 / RC 00). */
const FINPAY_SUCCESS_CODE = "2000000";

/**
 * Placeholder nomor telepon yang format-nya sah (E.164 Indonesia).
 *
 * Gateway Finpay MENOLAK request tanpa `customer.mobilePhone`
 * ("Invalid Mandatory Field customer.mobile phone"), padahal kontrak
 * `CreateInvoiceParams` membuat `phone` opsional. Untuk kanal yang tidak butuh
 * kontak pelanggan (VA/QRIS/retail), nomor placeholder dipakai agar transaksi
 * tetap bisa dibuat; merchant tetap disarankan mengisi `customer.phone` asli.
 */
const FINPAY_FALLBACK_PHONE = "+6280000000000";

/**
 * Normalisasi nomor telepon Indonesia ke E.164 (`+62...`).
 *
 * Finpay memvalidasi ketat: `081234567890` dianggap "Invalid Field Format",
 * sedangkan `+6281234567890` (contoh di dokumen resmi) diterima.
 * Mengembalikan `undefined` bila tidak ada digit.
 */
export function normalizeFinpayPhone(raw?: string | null): string | undefined {
  const digits = (raw || "").replace(/[^\d+]/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("62")) return `+${digits}`;
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `+62${digits}`;
  return `+${digits}`;
}

/** Hasil Cancel Order / Void Finpay. */
export interface FinpayCancelResult {
  success: boolean;
  statusCode: string;
  message?: string;
  error?: string;
  rawResponse: any;
}

/** Konfigurasi kanal: mode keluaran + apakah `paymentCode` adalah nomor VA. */
interface FinpayChannelMeta {
  mode: "checkout" | "va" | "qris" | "ewallet" | "retail" | "other";
  isVa?: boolean;
  bank?: string;
}

function channelMetaFor(sof: string | undefined): FinpayChannelMeta {
  if (!sof) return { mode: "checkout" };
  const type = sof.toLowerCase();
  if (type.startsWith("va")) {
    return { mode: "va", isVa: true, bank: type.slice(2) };
  }
  if (type === "qris") return { mode: "qris" };
  if (["ovo", "dana", "shopeepay", "linkaja", "jeniuspay", "linkajawco"].includes(type)) {
    return { mode: "ewallet" };
  }
  if (["alfamart", "idm", "pospay", "finpaycode"].includes(type)) return { mode: "retail" };
  if (type === "cc") return { mode: "other" };
  return { mode: "other" };
}

/**
 * Peta status pembayaran Finpay → status kanonik.
 *
 * Nilai status Finpay yang terdokumentasi antara lain: PAID, CAPTURED,
 * PENDING, FAILED, EXPIRED (Result Object + sample callback/status check).
 */
export function mapFinpayStatus(raw: string | undefined | null): {
  status: "paid" | "pending" | "failed" | "expired";
  isPaid: boolean;
  isPending: boolean;
  isFailed: boolean;
  isExpired: boolean;
} {
  const code = (raw || "").toUpperCase();
  const isPaid = ["PAID", "CAPTURED", "SETTLED", "SETTLEMENT", "SUCCESS"].includes(code);
  // "REQUEST_INITIATED" adalah status awal status-check Finpay (diverifikasi live
  // dari sandbox) — itu PENDING, bukan gagal.
  const isPending = [
    "PENDING",
    "PROCESSING",
    "IN PROGRESS",
    "IN_PROGRESS",
    "REQUEST IN PROGRESS",
    "REQUEST_IN_PROGRESS",
    "REQUEST_INITIATED",
    "INITIATED",
    "AUTHORIZED",
  ].includes(code);
  const isExpired = code === "EXPIRED";
  const isFailed = !isPaid && !isPending && !isExpired;
  const status = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";
  return { status, isPaid, isPending, isFailed, isExpired };
}

export class FinpayProvider extends BasePaymentProvider {
  readonly name = "finpay";

  private getBaseUrl(sandbox: boolean): string {
    // Docs: Development = devo.finnet.co.id, Production = live.finnet.co.id.
    return sandbox ? "https://devo.finnet.co.id" : "https://live.finnet.co.id";
  }

  private authorizationHeader(merchantId: string, merchantKey: string): string {
    // Docs: Basic base64(merchantId:merchantKey) — Merchant ID = username, Merchant Key = password.
    return `Basic ${Buffer.from(`${merchantId}:${merchantKey}`).toString("base64")}`;
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    if (!merchantId || !merchantKey) {
      return {
        success: false,
        provider: "finpay",
        orderId,
        amount,
        rawResponse: null,
        error: "Finpay requires merchantId/merchantCode and merchantKey/apiKey.",
      };
    }
    if (!orderId || !Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        provider: "finpay",
        orderId,
        amount,
        rawResponse: null,
        error: "Finpay requires a non-empty orderId and a positive amount.",
      };
    }

    const integerAmount = Math.round(amount);
    const finpaySof = toFinpayPaymentMethod(params.paymentMethod);
    const meta = channelMetaFor(finpaySof);

    const baseUrl = this.getBaseUrl(sandbox);
    const url = `${baseUrl}/pg/payment/card/initiate`;

    const nameParts = (customer?.name || "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || firstName;
    const description = productDetails || params.description || "Payment";

    // Sebagian kanal (DANA, LinkAja) ME wajibkan `order.item` — diverifikasi live.
    // Bila merchant tidak mengirim rincian item, kirim satu item yang menjumlah
    // persis ke amount supaya kontrak tetap sah di semua kanal.
    // `category` & `description` bersifat kondisional dan WAJIB untuk DANA
    // ("Invalid Mandatory Field order.item.0.category" — diverifikasi live).
    const items =
      params.items && params.items.length
        ? params.items.map((i) => ({
            name: i.name,
            description: i.description || i.name,
            category: "General",
            quantity: String(i.quantity),
            unitPrice: String(Math.round(i.price)),
            ...(i.id ? { sku: i.id } : {}),
          }))
        : [
            {
              name: description,
              description,
              category: "General",
              quantity: "1",
              unitPrice: String(integerAmount),
            },
          ];

    const normalizedPhone = normalizeFinpayPhone(customer?.phone) || FINPAY_FALLBACK_PHONE;
    // OVO memakai format lokal (contoh dokumen resmi: "082232565453"), bukan E.164.
    const ovoAccountId = normalizedPhone.startsWith("+62")
      ? `0${normalizedPhone.slice(3)}`
      : normalizedPhone.replace(/^\+/, "");

    const payload: Record<string, any> = {
      order: {
        id: orderId,
        amount: String(integerAmount),
        description,
        item: items,
      },
      customer: {
        id: customer?.email || orderId,
        email: customer?.email || "",
        firstName,
        lastName,
        // Wajib & harus E.164 — lihat normalizeFinpayPhone().
        mobilePhone: normalizedPhone,
      },
      url: {
        callbackUrl: callbackUrl || config.callbackUrl || "",
        successUrl: returnUrl || config.returnUrl || "",
        backUrl: returnUrl || config.returnUrl || "",
      },
      // OVO mewajibkan `sourceOfFunds.accountId` (diverifikasi live) dengan
      // format lokal `0…` sesuai contoh dokumen resmi OVO.
      ...(finpaySof
        ? {
            sourceOfFunds: {
              type: finpaySof,
              ...(finpaySof === "ovo" ? { accountId: ovoAccountId } : {}),
            },
          }
        : {}),
      ...params.providerParams,
    };

    try {
      const response = await httpFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: this.authorizationHeader(merchantId, merchantKey),
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
          provider: "finpay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error:
            data?.responseMessage ||
            data?.response_desc ||
            data?.message ||
            `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      const responseCode = String(data.responseCode ?? data.response_code ?? "").trim();
      if (responseCode === FINPAY_SUCCESS_CODE) {
        const res: InvoiceResponse = {
          success: true,
          provider: "finpay",
          orderId: data.order?.id || orderId,
          amount: data.order?.amount ? Number(data.order.amount) : integerAmount,
          reference: data.reference || data.referenceNo || orderId,
          paymentUrl: data.redirecturl || data.redirectUrl || data.appurl || undefined,
          mode: meta.mode,
          rawResponse: data,
        };

        const paymentCode = data.paymentCode || data.payment_code;
        if (paymentCode) {
          if (meta.isVa) {
            res.vaNumber = String(paymentCode);
            res.vaBank = meta.bank;
          } else {
            res.paymentCode = String(paymentCode);
          }
        }

        if (data.stringQr || data.stringQR || data.qrContent) {
          res.qrString = data.stringQr || data.stringQR || data.qrContent;
        }
        if (data.imageurl || data.imageUrl) {
          res.qrCodeUrl = data.imageurl || data.imageUrl;
        }

        const expiry = data.expiryLink || data.expiry_link;
        if (expiry) {
          const parsed = new Date(String(expiry).replace(" ", "T"));
          res.expiresAt = isNaN(parsed.getTime()) ? String(expiry) : parsed;
        }

        return res;
      }

      return {
        success: false,
        provider: "finpay",
        orderId,
        amount: integerAmount,
        rawResponse: data,
        error: data.responseMessage || data.message || `Finpay Error: ${responseCode || "UNKNOWN"}`,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "finpay",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Finpay API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";

    // Callback resmi Finpay berbentuk bersarang. Field datar lama tetap dibaca
    // sebagai fallback agar tidak mematahkan integrasi yang sudah ada.
    const orderId = body?.order?.id || body?.order_id || body?.orderId || "";
    const amount = body?.order?.amount ?? body?.amount ?? body?.total_amount ?? 0;
    const rawStatus = body?.result?.payment?.status || body?.status || body?.payment_status || "";
    const signature = body?.signature || "";

    const isValid = verifyFinpaySignature(body, merchantKey, signature);
    const mapped = mapFinpayStatus(rawStatus);

    return {
      isValid,
      provider: "finpay",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      // Status apa pun tidak dipercaya bila signature tidak sah (fail-closed).
      status: isValid ? mapped.status : "failed",
      isPaid: isValid && mapped.isPaid,
      isPending: isValid && mapped.isPending,
      isFailed: !isValid || mapped.isFailed,
      isExpired: isValid && mapped.isExpired,
      statusCode: String(rawStatus),
      rawPayload: body,
    };
  }

  /**
   * Cancel Order — batalkan transaksi yang BELUM dibayar.
   * Docs: GET {base}/pg/payment/card/cancel/{orderId}
   * https://docs.finpay.id/api-reference/finpay-pg/after-payment/cancel-order.md
   */
  async cancelTransaction(orderId: string, config: ProviderConfig): Promise<FinpayCancelResult> {
    return this.cancelOrVoid("cancel", orderId, config);
  }

  /**
   * Void — batalkan transaksi yang sudah diotorisasi/dibayar (sebelum settlement).
   * Docs: GET {base}/pg/payment/card/void/{orderId}
   * https://docs.finpay.id/api-reference/finpay-pg/after-payment/void.md
   */
  async voidTransaction(orderId: string, config: ProviderConfig): Promise<FinpayCancelResult> {
    return this.cancelOrVoid("void", orderId, config);
  }

  private async cancelOrVoid(
    action: "cancel" | "void",
    orderId: string,
    config: ProviderConfig,
  ): Promise<FinpayCancelResult> {
    const merchantId = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";

    if (!merchantId || !merchantKey) {
      return {
        success: false,
        statusCode: "",
        error: "Finpay requires merchantId/merchantCode and merchantKey/apiKey.",
        rawResponse: null,
      };
    }
    if (!orderId) {
      return { success: false, statusCode: "", error: "Finpay requires a non-empty orderId.", rawResponse: null };
    }

    const url = `${this.getBaseUrl(!!config.sandbox)}/pg/payment/card/${action}/${encodeURIComponent(orderId)}`;

    try {
      const response = await httpFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: this.authorizationHeader(merchantId, merchantKey),
        },
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      const statusCode = String(data?.responseCode ?? "");
      const success = response.ok && statusCode === FINPAY_SUCCESS_CODE;
      return {
        success,
        statusCode,
        message: data?.responseMessage,
        ...(success
          ? {}
          : { error: data?.responseMessage || `HTTP error! Status: ${response.status} - ${text}` }),
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        statusCode: "ERROR",
        error: e?.message || `Failed to ${action} Finpay transaction`,
        rawResponse: null,
      };
    }
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    // Daftar kanal mengikuti Source Of Funds List resmi Finpay
    // (https://docs.finpay.id/api-reference/appendix/enumeration/source-of-funds-list.md).
    const staticMethods: PaymentMethod[] = [
      { paymentMethod: "bca_va", code: "vabca", paymentName: "BCA Virtual Account", paymentImage: "https://finpay.id/assets/bca.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "mandiri_va", code: "vamandiri", paymentName: "Mandiri Virtual Account", paymentImage: "https://finpay.id/assets/mandiri.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "bni_va", code: "vabni", paymentName: "BNI Virtual Account", paymentImage: "https://finpay.id/assets/bni.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "bri_va", code: "vabri", paymentName: "BRI Virtual Account", paymentImage: "https://finpay.id/assets/bri.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "permata_va", code: "vapermata", paymentName: "Permata Virtual Account", paymentImage: "https://finpay.id/assets/permata.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "cimb_va", code: "vacimb", paymentName: "CIMB Niaga Virtual Account", paymentImage: "https://finpay.id/assets/cimb.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "bsi_va", code: "vabsi", paymentName: "BSI Virtual Account", paymentImage: "https://finpay.id/assets/bsi.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "btn_va", code: "vabtn", paymentName: "BTN Virtual Account", paymentImage: "https://finpay.id/assets/btn.png", totalFee: "IDR 4,000", category: "Virtual Account" },
      { paymentMethod: "qris", code: "qris", paymentName: "QRIS", paymentImage: "https://finpay.id/assets/qris.png", totalFee: "0.7%", category: "QRIS" },
      { paymentMethod: "alfamart", code: "alfamart", paymentName: "Alfamart", paymentImage: "https://finpay.id/assets/alfamart.png", totalFee: "IDR 5,000", category: "Retail / Gerai" },
      { paymentMethod: "indomaret", code: "idm", paymentName: "Indomaret", paymentImage: "https://finpay.id/assets/indomaret.png", totalFee: "IDR 5,000", category: "Retail / Gerai" },
      { paymentMethod: "pos", code: "pospay", paymentName: "Pospay (Kantor Pos)", paymentImage: "https://finpay.id/assets/pos.png", totalFee: "IDR 5,000", category: "Retail / Gerai" },
      { paymentMethod: "ovo", code: "ovo", paymentName: "OVO", paymentImage: "https://finpay.id/assets/ovo.png", totalFee: "1.5%", category: "E-Wallet" },
      { paymentMethod: "dana", code: "dana", paymentName: "DANA", paymentImage: "https://finpay.id/assets/dana.png", totalFee: "1.5%", category: "E-Wallet" },
      { paymentMethod: "shopeepay", code: "shopeepay", paymentName: "ShopeePay", paymentImage: "https://finpay.id/assets/shopeepay.png", totalFee: "2.0%", category: "E-Wallet" },
      { paymentMethod: "linkaja", code: "linkaja", paymentName: "LinkAja", paymentImage: "https://finpay.id/assets/linkaja.png", totalFee: "1.5%", category: "E-Wallet" },
      { paymentMethod: "credit_card", code: "cc", paymentName: "Credit / Debit Card (Visa, Mastercard)", paymentImage: "https://finpay.id/assets/cc.png", totalFee: "2.9% + IDR 2,000", category: "Kartu Kredit" },
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
      provider: "finpay",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    // Docs: Status Check Payment Gateway → GET /pg/payment/card/check/{orderId}
    const url = `${this.getBaseUrl(sandbox)}/pg/payment/card/check/${encodeURIComponent(merchantOrderId)}`;

    try {
      const response = await httpFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: this.authorizationHeader(merchantId, merchantKey),
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
          provider: "finpay",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.responseMessage || `HTTP error! Status: ${response.status}`,
          error: data?.responseMessage || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const detail = data.data || data;
      const payment = detail?.result?.payment || {};
      const mapped = mapFinpayStatus(payment.status);
      const ok = String(data.responseCode ?? "") === FINPAY_SUCCESS_CODE;

      return {
        success: ok,
        provider: "finpay",
        orderId: detail?.order?.id || merchantOrderId,
        reference: detail?.order?.reference || payment.reference || "",
        amount: detail?.order?.amount ? Number(detail.order.amount) : payment.amount ? Number(payment.amount) : 0,
        statusCode: String(payment.status ?? data.responseCode ?? ""),
        status: ok ? mapped.status : "failed",
        isPaid: ok && mapped.isPaid,
        isPending: ok && mapped.isPending,
        isFailed: !ok || mapped.isFailed,
        isExpired: ok && mapped.isExpired,
        statusMessage: payment.statusDesc || data.responseMessage || "",
        paymentType: payment.channel,
        transactionTime: payment.datetime ? new Date(String(payment.datetime).replace(" ", "T")) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "finpay",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Finpay",
        error: e.message || "Failed to check transaction status in Finpay",
        rawResponse: null,
      };
    }
  }
}
