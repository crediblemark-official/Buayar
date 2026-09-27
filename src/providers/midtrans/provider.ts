import { BasePaymentProvider } from "../base";
import { MidtransClient } from "../../clients/midtrans";
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
  resolvePaymentMethodCode,
} from "../../types";
import { toCanonicalPaymentMethod } from "../../core/canonical";
import { sha512, safeCompare } from "../../utils/crypto";
import {
  CORE_API_METHODS,
  buildCoreChargePayload,
  parseCoreChargeResponse,
  toMidtransSnapEnabledPayment,
} from "./charge";
import {
  MIDTRANS_STATIC_METHODS,
  MIDTRANS_PROBE_PAYLOADS,
  hintMidtransProbeError,
} from "./methods";
import {
  MidtransSnapClient,
  buildMidtransSnapQrisBody,
  buildMidtransSnapQrisQueryBody,
  buildMidtransSnapVaBody,
  buildMidtransSnapVaStatusBody,
  describeMidtransSnapFailure,
  extractMidtransSnapNotificationOrderId,
  isMidtransSnapEnabled,
  isMidtransSnapSuccess,
  mapMidtransSnapStatus,
  midtransSnapExternalId,
  parseMidtransSnapQrisResponse,
  parseMidtransSnapVaResponse,
  resolveMidtransSnapCredentials,
  toMidtransSnapMethod,
  toMidtransSnapReferenceNo,
  verifyMidtransSnapNotificationSignature,
  type MidtransSnapMethod,
} from "./snap";

/** Hasil probe satu channel Midtrans beserta diagnosanya. */
export interface MidtransProbeChannelResult {
  method: string;
  enabled: boolean;
  statusCode?: string;
  error?: string;
  /** Petunjuk aksi bila kegagalan berasal dari channel yang belum diaktifkan. */
  hint?: string;
}

export class MidtransProvider extends BasePaymentProvider {
  readonly name = "midtrans";

  private getSnapBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://app.sandbox.midtrans.com/snap/v1/transactions"
      : "https://app.midtrans.com/snap/v1/transactions";
  }

  private getApiBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api.sandbox.midtrans.com/v2"
      : "https://api.midtrans.com/v2";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, customer, returnUrl } = params;
    const productDetails = params.productDetails || params.description || "Payment";
    const sandbox = !!config.sandbox;
    const integerAmount = Math.round(amount);
    const methodCode = resolvePaymentMethodCode(params.paymentMethod);
    const rawMethod = methodCode?.toLowerCase().trim() || "";
    const canonicalMethod = toCanonicalPaymentMethod("midtrans", rawMethod);
    const method = canonicalMethod || rawMethod;
    // `enabled_payments` Snap memakai kosakata berbeda dari kode kanonikal
    // (mis. qris → other_qris, mandiri_va → echannel). Lihat CANONICAL_TO_MIDTRANS_SNAP.
    const snapEnabledPayment = toMidtransSnapEnabledPayment(method) || methodCode;

    // 0. BI-SNAP Core API (opt-in) — jalur resmi bagi merchant yang sudah dimigrasikan
    // Midtrans. Hanya menangani kanal yang memang tersedia di SNAP (VA bank + QRIS MPM);
    // kanal lain tetap memakai Core API legacy / Snap agar tidak ada perubahan perilaku.
    if (isMidtransSnapEnabled(config)) {
      const snapMethod = toMidtransSnapMethod(method);
      if (snapMethod) {
        return this.createInvoiceViaSnap(snapMethod, params, config, integerAmount);
      }
    }

    // 1. Core API (Direct Charge / Custom Native UI)
    if (method && CORE_API_METHODS.includes(method)) {
      const { payload, error } = buildCoreChargePayload(method, params, config, integerAmount);
      if (error || !payload) {
        return {
          success: false,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          rawResponse: null,
          error: error || "Failed to build charge payload",
        };
      }

      try {
        const client = new MidtransClient(config);
        const data = await client.request("POST", "/charge", payload);

        if (data.status_code === "201" || data.status_code === "200") {
          return parseCoreChargeResponse(method, data, orderId, integerAmount);
        } else {
          return {
            success: false,
            provider: "midtrans",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data.status_message || `Midtrans Core Error: ${data.status_code}`,
          };
        }
      } catch (e: any) {
        return {
          success: false,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          rawResponse: null,
          error: e.message || "Failed to make request to Midtrans Core API",
        };
      }
    }

    // 2. Snap API (Semi Integration / Redirect Checkout)
    const url = this.getSnapBaseUrl(sandbox);
    const payload = {
      transaction_details: { order_id: orderId, gross_amount: integerAmount },
      customer_details: {
        first_name: customer.name,
        email: customer.email,
        ...(customer.phone ? { phone: customer.phone } : {}),
      },
      item_details: [
        {
          id: orderId,
          price: integerAmount,
          quantity: 1,
          name: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
        },
      ],
      callbacks: { finish: returnUrl || config.returnUrl || "" },
      ...(snapEnabledPayment ? { enabled_payments: [snapEnabledPayment] } : {}),
      ...params.providerParams,
    };

    try {
      const client = new MidtransClient(config);
      const data = await client.request("POST", url, payload);

      if (data.token) {
        return {
          success: true,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          paymentUrl: data.redirect_url,
          reference: data.token,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.error_messages?.[0] || "Failed to create Midtrans Snap transaction",
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "midtrans",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Midtrans Snap API",
      };
    }
  }

  /** Respons kegagalan seragam untuk jalur BI-SNAP. */
  private snapError(orderId: string, amount: number, error: string, raw: any = null): InvoiceResponse {
    return { success: false, provider: "midtrans", orderId, amount, rawResponse: raw, error };
  }

  /**
   * Charge lewat **BI-SNAP Core API** Midtrans (VA bank & QRIS MPM).
   * Kontrak API-nya didokumentasikan di `src/providers/midtrans/snap.ts`.
   */
  private async createInvoiceViaSnap(
    snapMethod: MidtransSnapMethod,
    params: CreateInvoiceParams,
    config: ProviderConfig,
    integerAmount: number
  ): Promise<InvoiceResponse> {
    const { orderId, customer } = params;
    const extra = (config.extra || {}) as Record<string, any>;
    const { credentials, missing } = resolveMidtransSnapCredentials(config);

    if (missing.length) {
      return this.snapError(
        orderId,
        integerAmount,
        `Midtrans BI-SNAP aktif tetapi kredensial belum lengkap: ${missing.join(", ")}`
      );
    }

    const client = new MidtransSnapClient(config);

    try {
      if (snapMethod.kind === "qris") {
        const body = buildMidtransSnapQrisBody({
          orderId,
          amount: integerAmount,
          currency: params.currency,
          acquirer: snapMethod.acquirer,
          merchantId: credentials.merchantId || undefined,
          validityPeriod: extra.snapValidityPeriod,
          customer: { name: customer.name, email: customer.email, phone: customer.phone },
          items: extra.snapItems,
        });

        // Pada MPM, X-EXTERNAL-ID wajib sama dengan body.partnerReferenceNo.
        const data = await client.createQris(body, body.partnerReferenceNo);
        if (!isMidtransSnapSuccess(data)) {
          return this.snapError(orderId, integerAmount, describeMidtransSnapFailure(data), data);
        }

        const res = parseMidtransSnapQrisResponse(data, orderId, integerAmount);
        if (!res.qrString && !res.qrCodeUrl) {
          return this.snapError(
            orderId,
            integerAmount,
            `Midtrans BI-SNAP tidak mengembalikan qrContent/qrUrl (responseCode: ${data?.responseCode ?? "-"})`,
            data
          );
        }
        return res;
      }

      // Create VA memerlukan partnerServiceId (8 karakter) & customerNo milik akun merchant.
      const partnerServiceId = typeof extra.snapPartnerServiceId === "string" ? extra.snapPartnerServiceId.trim() : "";
      const customerNo = typeof extra.snapCustomerNo === "string" ? extra.snapCustomerNo.trim() : "";
      if (!partnerServiceId || !customerNo) {
        return this.snapError(
          orderId,
          integerAmount,
          "Midtrans BI-SNAP VA membutuhkan config.extra.snapPartnerServiceId (8 karakter) & config.extra.snapCustomerNo yang diberikan Midtrans."
        );
      }

      const body = buildMidtransSnapVaBody({
        orderId,
        amount: integerAmount,
        currency: params.currency,
        bank: snapMethod.bank,
        partnerServiceId,
        customerNo,
        virtualAccountName: customer.name,
        virtualAccountEmail: customer.email,
        virtualAccountPhone: customer.phone,
        expiredDate: extra.snapExpiredDate,
        merchantId: credentials.merchantId || undefined,
        customer: { name: customer.name, email: customer.email, phone: customer.phone },
        items: extra.snapItems,
        randomizeVaNumber: extra.snapRandomizeVaNumber,
      });

      const data = await client.createVa(body, midtransSnapExternalId());
      if (!isMidtransSnapSuccess(data)) {
        return this.snapError(orderId, integerAmount, describeMidtransSnapFailure(data), data);
      }

      const res = parseMidtransSnapVaResponse(data, orderId, integerAmount, snapMethod.bank);
      if (!res.vaNumber) {
        return this.snapError(
          orderId,
          integerAmount,
          `Midtrans BI-SNAP tidak mengembalikan virtualAccountNo (responseCode: ${data?.responseCode ?? "-"})`,
          data
        );
      }
      return res;
    } catch (e: any) {
      return this.snapError(
        orderId,
        integerAmount,
        e?.message || "Gagal memanggil Midtrans BI-SNAP Core API"
      );
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    // Notifikasi BI-SNAP (MPM QRIS & Direct Debit) memakai signature asimetris dan
    // status numerik; Virtual Account tetap memakai notifikasi legacy di bawah.
    if (body && typeof body === "object" && body.latestTransactionStatus !== undefined) {
      return this.verifySnapNotification(body, config);
    }
    const serverKey = config.serverKey || config.apiKey || "";
    const orderId = body.order_id || "";
    const statusCode = body.status_code || "";
    const grossAmount = body.gross_amount || "";
    const signatureKey = body.signature_key || "";

    const rawSignature = orderId + statusCode + grossAmount + serverKey;
    const computedSignature = sha512(rawSignature);
    const isValid = safeCompare(signatureKey, computedSignature);

    const transactionStatus = body.transaction_status || "";
    const fraudStatus = body.fraud_status || "";

    let isPaid = false;
    let isPending = false;
    let isFailed = false;
    let isExpired = false;
    let status: "paid" | "pending" | "failed" | "expired" = "pending";

    if (transactionStatus === "capture" || transactionStatus === "settlement") {
      if (fraudStatus === "accept" || !fraudStatus) {
        status = "paid";
        isPaid = true;
      } else if (fraudStatus === "challenge") {
        status = "pending";
        isPending = true;
      } else {
        status = "failed";
        isFailed = true;
      }
    } else if (transactionStatus === "pending") {
      status = "pending";
      isPending = true;
    } else if (transactionStatus === "expire") {
      status = "expired";
      isExpired = true;
      isFailed = true;
    } else if (["deny", "cancel"].includes(transactionStatus)) {
      status = "failed";
      isFailed = true;
    }

    return {
      isValid,
      provider: "midtrans",
      orderId,
      amount: grossAmount ? Number(grossAmount) : 0,
      status: isValid ? status : "failed",
      isPaid: isValid && isPaid,
      isPending: isValid && isPending,
      isFailed: !isValid || isFailed,
      isExpired: isValid && isExpired,
      statusCode,
      transactionTime: body.transaction_time ? new Date(body.transaction_time) : undefined,
      rawPayload: body,
    };
  }

  private verifySnapNotification(body: any, config: ProviderConfig): VerifyCallbackResult {
    const extra = (config.extra || {}) as Record<string, any>;
    const meta = extra.snapNotification || {};
    const publicKey = meta.publicKey || extra.snapMidtransPublicKey || "";
    const urlPath = meta.urlPath || extra.snapNotificationPath || "";
    const timeStamp = meta.timeStamp || extra.snapTimestamp || "";
    const signature = meta.signature || extra.snapSignature || "";

    const isValid = verifyMidtransSnapNotificationSignature({
      body,
      urlPath,
      timeStamp,
      signature,
      publicKey,
      httpMethod: meta.httpMethod,
    });

    const code = String(body.latestTransactionStatus ?? "");
    const status = mapMidtransSnapStatus(code);
    const orderId = extractMidtransSnapNotificationOrderId(body);
    const amount = Number(body?.amount?.value ?? body?.totalAmount?.value ?? 0);

    return {
      isValid,
      provider: "midtrans",
      orderId: String(orderId || ""),
      amount: Number.isFinite(amount) ? amount : 0,
      status: isValid ? status : "failed",
      isPaid: isValid && status === "paid",
      isPending: isValid && status === "pending",
      isFailed: !isValid || status === "failed",
      isExpired: isValid && status === "expired",
      statusCode: code,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of MIDTRANS_STATIC_METHODS) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    return {
      success: true,
      provider: "midtrans",
      methods: MIDTRANS_STATIC_METHODS,
      categories,
      rawResponse: MIDTRANS_STATIC_METHODS,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    // `merchantOrderId` opsional di tipe publik; PaymentManager sudah menjamin
    // salah satu identifier terisi sebelum sampai ke provider.
    const merchantOrderId = params.merchantOrderId || params.transactionId || "";

    // Jalur BI-SNAP: status diambil dari Status API SNAP, bukan `/v2/{order}/status`.
    if (isMidtransSnapEnabled(config)) {
      const snapResult = await this.checkTransactionViaSnap(merchantOrderId, config);
      if (snapResult) return snapResult;
    }

    try {
      const client = new MidtransClient(config);
      const data = await client.request("GET", `/${merchantOrderId}/status`, null);

      const transactionStatus = data.transaction_status || "";
      const fraudStatus = data.fraud_status || "";

      let isPaid = false;
      let isPending = false;
      let isFailed = false;
      let isExpired = false;
      let status: "paid" | "pending" | "failed" | "expired" = "pending";

      if (transactionStatus === "capture" || transactionStatus === "settlement") {
        if (fraudStatus === "accept" || !fraudStatus) {
          status = "paid";
          isPaid = true;
        } else if (fraudStatus === "challenge") {
          status = "pending";
          isPending = true;
        } else {
          status = "failed";
          isFailed = true;
        }
      } else if (transactionStatus === "pending") {
        status = "pending";
        isPending = true;
      } else if (transactionStatus === "expire") {
        status = "expired";
        isExpired = true;
        isFailed = true;
      } else if (["deny", "cancel"].includes(transactionStatus)) {
        status = "failed";
        isFailed = true;
      }

      return {
        success: true,
        provider: "midtrans",
        orderId: data.order_id || merchantOrderId,
        reference: data.transaction_id || "",
        amount: data.gross_amount ? Number(data.gross_amount) : 0,
        statusCode: data.status_code || "",
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.status_message || "",
        paymentType: data.payment_type,
        transactionTime: data.transaction_time ? new Date(data.transaction_time) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "midtrans",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: "Network error",
        error: e.message || "Failed to check transaction status with Midtrans",
        rawResponse: null,
      };
    }
  }

  /**
   * Status transaksi lewat BI-SNAP. Mengembalikan `null` bila konfigurasi belum
   * lengkap, sehingga pemanggil bisa jatuh kembali ke jalur legacy.
   */
  private async checkTransactionViaSnap(
    merchantOrderId: string,
    config: ProviderConfig
  ): Promise<CheckTransactionResult | null> {
    const extra = (config.extra || {}) as Record<string, any>;
    const { credentials, missing } = resolveMidtransSnapCredentials(config);
    if (missing.length) return null;

    const queryType = String(extra.snapQueryType || "qris").toLowerCase();
    const client = new MidtransSnapClient(config);

    try {
      let data: any;

      if (queryType === "va") {
        const partnerServiceId = typeof extra.snapPartnerServiceId === "string" ? extra.snapPartnerServiceId.trim() : "";
        const customerNo = typeof extra.snapCustomerNo === "string" ? extra.snapCustomerNo.trim() : "";
        if (!partnerServiceId || !customerNo) return null;
        data = await client.queryVa(
          buildMidtransSnapVaStatusBody({
            partnerServiceId,
            customerNo,
            trxId: toMidtransSnapReferenceNo(merchantOrderId),
          })
        );
      } else {
        data = await client.queryQris(
          buildMidtransSnapQrisQueryBody({
            originalReferenceNo: extra.snapOriginalReferenceNo,
            originalPartnerReferenceNo: toMidtransSnapReferenceNo(merchantOrderId),
            merchantId: credentials.merchantId || undefined,
          })
        );
      }

      // Status numerik dapat berada di root maupun di dalam objek data transaksi.
      const code = String(
        data?.latestTransactionStatus ??
          data?.virtualAccountData?.latestTransactionStatus ??
          data?.transactionStatus ??
          data?.additionalInfo?.latestTransactionStatus ??
          ""
      );
      const status = mapMidtransSnapStatus(code);
      const amount = Number(data?.amount?.value ?? data?.virtualAccountData?.totalAmount?.value ?? 0);

      return {
        success: true,
        provider: "midtrans",
        orderId: String(extractMidtransSnapNotificationOrderId(data) || merchantOrderId),
        reference: data?.referenceNo || data?.virtualAccountData?.trxId || "",
        amount: Number.isFinite(amount) ? amount : 0,
        statusCode: code,
        status,
        isPaid: status === "paid",
        isPending: status === "pending",
        isFailed: status === "failed",
        isExpired: status === "expired",
        statusMessage:
          data?.latestTransactionStatusDesc || data?.responseMessage || "",
        paymentType: queryType === "va" ? "va" : "qris",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "midtrans",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: "Network error",
        error: e?.message || "Gagal mengecek status transaksi Midtrans BI-SNAP",
        rawResponse: null,
      };
    }
  }

  getClient(config: ProviderConfig): MidtransClient {
    return new MidtransClient(config);
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{
    success: boolean;
    enabled: string[];
    source?: "live" | "static";
    error?: string;
  }> {
    const detailed = await this.probePaymentMethodsDetailed(config);
    return { success: detailed.success, enabled: detailed.enabled, source: "live" };
  }

  /**
   * Probe channel Midtrans **beserta alasan kegagalannya**.
   *
   * `probePaymentMethods()` hanya mengembalikan daftar channel yang aktif; kegagalan
   * di-swallow sehingga sulit membedakan "channel tidak diaktifkan di akun" dari
   * "payload salah" atau "kredensial kurang". Versi ini mengembalikan hasil per-channel
   * (status_code / pesan error) agar bisa didiagnosa.
   */
  async probePaymentMethodsDetailed(config: ProviderConfig): Promise<{
    success: boolean;
    enabled: string[];
    results: MidtransProbeChannelResult[];
    source: "live";
  }> {
    const results: MidtransProbeChannelResult[] = [];
    const client = new MidtransClient(config);

    for (const [methodId, specificPayload] of Object.entries(MIDTRANS_PROBE_PAYLOADS)) {
      const probeOrderId = `PROBE-${methodId}-${Date.now()}`;
      const probeBody = {
        ...specificPayload,
        transaction_details: { order_id: probeOrderId, gross_amount: 15000 },
        item_details: [{ id: probeOrderId, name: "Probe", price: 15000, quantity: 1 }],
        customer_details: { first_name: "Probe", email: "probe@test.com" },
      };

      try {
        const result = await client.request("POST", "/charge", probeBody);
        const ok = !!result && ["200", "201", "202"].includes(result.status_code);
        const statusCode = result?.status_code;
        const error = ok
          ? undefined
          : result?.status_message || `status_code ${statusCode ?? "-"}`;

        results.push({
          method: methodId,
          enabled: ok,
          statusCode,
          error,
          hint: ok ? undefined : hintMidtransProbeError(methodId, error, statusCode),
        });

        if (ok) {
          // Bersihkan transaksi probe agar tidak menumpuk di dashboard sandbox.
          try {
            await client.cancelTransaction(probeOrderId);
          } catch (e) {}
        }
      } catch (e: any) {
        const message = e?.message || "probe request gagal";
        // `MidtransClient` melempar `HTTP error! Status: 401 - {...}` untuk HTTP non-2xx.
        const statusCode = /Status:\s*(\d+)/.exec(message)?.[1];
        results.push({
          method: methodId,
          enabled: false,
          statusCode,
          error: message,
          hint: hintMidtransProbeError(methodId, message, statusCode),
        });
      }
    }

    // LIVE: tiap channel diprobe dengan `/charge` asli lalu langsung di-cancel,
    // sehingga hasilnya membuktikan channel benar-benar aktif di akun merchant.
    return {
      success: true,
      enabled: results.filter((r) => r.enabled).map((r) => r.method),
      results,
      source: "live",
    };
  }
}
