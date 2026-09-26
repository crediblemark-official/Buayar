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
import { toIpaymuPaymentMethod } from "../../core/canonical";
import { generateIpaymuSignature, verifyIpaymuCallback, verifyIpaymuCallbackSignature } from "./signature";
import { httpFetch } from "../../utils/http";

export class IpaymuProvider extends BasePaymentProvider {
  readonly name = "ipaymu";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://sandbox.ipaymu.com/api/v2"
      : "https://my.ipaymu.com/api/v2";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const va = config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const ipaymuMethod = toIpaymuPaymentMethod(params.paymentMethod);
    const isDirect = !!ipaymuMethod;

    const baseUrl = this.getBaseUrl(sandbox);
    const endpoint = isDirect ? "/payment/direct" : "/payment";
    const url = `${baseUrl}${endpoint}`;

    const notifyUrl = callbackUrl || config.callbackUrl || "https://localhost/callback";
    const redirectUrl = returnUrl || config.returnUrl || "https://localhost/return";
    const feeDirection = params.feeDirection || params.extra?.feeDirection || config.extra?.feeDirection;
    const escrow = params.escrow !== undefined ? params.escrow : (params.extra?.escrow !== undefined ? params.extra?.escrow : config.extra?.escrow);
    const subAccount = params.subAccountId || params.extra?.subAccountId || params.extra?.account || params.extra?.childAccount || (params as any).account || config.extra?.account;

    // Batas kadaluarsa (jam) per channel sesuai dokumentasi resmi iPaymu Direct Payment:
    // BSI VA maks 3 jam, BRI VA maks 2 jam; BCA VA, Alfamart, dan QRIS tidak bisa dikustom
    // (default vendor: BCA 12 jam, Alfamart 24 jam, QRIS 5 menit). Mengirim `expired`
    // di luar batas dapat ditolak gateway, jadi nilai di-clamp dan di-omit bila dilarang.
    const channel = (ipaymuMethod?.paymentChannel || "").toLowerCase();
    const expiryLocked =
      ipaymuMethod?.paymentMethod === "qris" || channel === "bca" || channel === "alfamart";
    const EXPIRY_CAP_HOURS: Record<string, number> = { bri: 2, bsi: 3 };
    const requestedExpiry =
      params.extra?.expiredHours ??
      params.providerParams?.expired ??
      config.extra?.expiredHours ??
      config.extra?.expired;
    const capHours = EXPIRY_CAP_HOURS[channel];
    const resolvedExpiry =
      typeof requestedExpiry === "number" && Number.isFinite(requestedExpiry)
        ? capHours
          ? Math.max(1, Math.min(requestedExpiry, capHours))
          : Math.max(1, Math.min(requestedExpiry, 24))
        : capHours;

    // Rincian item (product/qty/price). Dokumentasi resmi iPaymu mencantumkan
    // ketiganya sebagai parameter Direct Payment (WAJIB untuk COD — gateway
    // menolak dengan "product wajib diisi." bila kosong) dan opsional untuk
    // channel lain. Dikirim selalu agar payload patuh dokumen di semua channel.
    const hasItems = params.items && params.items.length > 0;
    const product = hasItems ? params.items!.map(i => i.name) : [productDetails];
    const qty = hasItems ? params.items!.map(i => i.quantity) : [1];
    const price = hasItems ? params.items!.map(i => Math.round(i.price)) : [integerAmount];
    // Dimensi per item (kg/cm). Dikirim sebagai array paralel hanya bila SEMUA
    // item mendefinisikannya, karena iPaymu mencocokkan indeks array. Wajib untuk
    // COD (gateway menolak dengan "weight wajib diisi."), opsional untuk channel lain.
    const dims: Record<string, number[]> = {};
    for (const key of ["weight", "width", "length", "height"] as const) {
      if (hasItems && params.items!.every(i => i[key] !== undefined)) {
        dims[key] = params.items!.map(i => i[key] as number);
      }
    }

    let payload: any;
    if (isDirect) {
      const needsRedirectUrls =
        ipaymuMethod.paymentMethod === "cc" || ipaymuMethod.paymentMethod === "paylater";
      payload = {
        name: customer.name,
        email: customer.email,
        ...(customer.phone ? { phone: customer.phone } : {}),
        amount: integerAmount,
        notifyUrl,
        // `expired` hanya dikirim bila channel mengizinkannya (lihat clamp di atas).
        ...(expiryLocked || resolvedExpiry === undefined
          ? {}
          : { expired: resolvedExpiry, expiredType: "hours" }),
        comments: productDetails,
        referenceId: orderId,
        product,
        qty,
        price,
        ...dims,
        paymentMethod: ipaymuMethod.paymentMethod,
        ...(ipaymuMethod.paymentChannel ? { paymentChannel: ipaymuMethod.paymentChannel } : {}),
        ...(needsRedirectUrls ? { successUrl: redirectUrl, cancelUrl: redirectUrl } : {}),
        ...(feeDirection ? { feeDirection } : {}),
        ...(escrow !== undefined ? { escrow } : {}),
        ...(subAccount ? { account: subAccount } : {}),
        ...params.providerParams,
      };
    } else {
      // Halaman hosted iPaymu membatasi panjang nama produk (50 karakter),
      // jadi nama dipotong untuk mode Semi-Integrasi.
      const hostedProduct = hasItems
        ? params.items!.map(i => i.name)
        : [productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails];
      const description = hasItems ? params.items!.map(i => i.description || i.name) : [productDetails];

      payload = {
        product: hostedProduct,
        qty,
        price,
        description,
        returnUrl: redirectUrl,
        notifyUrl,
        cancelUrl: redirectUrl,
        referenceId: orderId,
        buyerName: customer.name,
        buyerEmail: customer.email,
        ...(customer.phone ? { buyerPhone: customer.phone } : {}),
        ...(feeDirection ? { feeDirection } : {}),
        ...(escrow !== undefined ? { escrow } : {}),
        ...(subAccount ? { account: subAccount } : {}),
        ...params.providerParams,
      };
    }

    const { signature, timestamp } = generateIpaymuSignature("POST", va, apiKey, payload);

    try {
      const response = await httpFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "va": va,
          "signature": signature,
          "timestamp": timestamp,
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
          provider: "ipaymu",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.Message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.Status === 200 || data.status === 200 || data.Status === "200") {
        const resData = data.Data || {};
        const res: InvoiceResponse = {
          success: true,
          provider: "ipaymu",
          orderId,
          amount: integerAmount,
          reference: resData.TransactionId ? String(resData.TransactionId) : String(resData.SessionId || resData.SessionID || ""),
          paymentUrl: resData.Url || resData.url,
          rawResponse: data,
        };

        if (resData.PaymentNo) {
          if (ipaymuMethod?.paymentMethod === "va") {
            res.vaNumber = resData.PaymentNo;
            res.vaBank = ipaymuMethod.paymentChannel;
            res.mode = "va";
          } else if (ipaymuMethod?.paymentMethod === "cstore") {
            res.paymentCode = resData.PaymentNo;
            res.mode = "retail";
          }
        }

        if (resData.QrString || resData.QrImage) {
          res.qrString = resData.QrString;
          res.qrCodeUrl = resData.QrImage || resData.QrTemplate;
          res.mode = "qris";
        }

        if (ipaymuMethod?.paymentMethod === "ewallet") {
          res.mode = "ewallet";
          if (resData.Url) {
            res.deeplink = resData.Url;
            res.paymentUrl = resData.Url;
          }
        }

        if (resData.Expired) {
          res.expiresAt = new Date(resData.Expired);
        }

        return res;
      } else {
        return {
          success: false,
          provider: "ipaymu",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.Message || data.message || `iPaymu Error status: ${data.Status}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "ipaymu",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to iPaymu API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const { isPaid, isPending, isFailed } = verifyIpaymuCallback(body);
    const orderId = body.reference_id || body.referenceId || body.trx_id || "";
    const amount = body.amount || body.total || 0;

    // Secret key verifikasi callback iPaymu = Merchant VA (bukan API Key)
    const secretKey = config.merchantCode || config.merchantId || "";

    const headers = (config.extra?.headers as Record<string, string | string[] | undefined> | undefined) || {};
    const rawSig = headers["x-signature"] ?? headers["X-Signature"] ?? "";
    const xSignature = Array.isArray(rawSig) ? rawSig[0] : rawSig;

    // SECURITY: tanpa header X-Signature yang sah → callback TIDAK pernah valid.
    const isValid = verifyIpaymuCallbackSignature(body, secretKey, xSignature);

    return {
      isValid,
      provider: "ipaymu",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status: isPaid ? "paid" : isPending ? "pending" : "failed",
      isPaid: isValid && isPaid,
      isPending: isValid && isPending,
      isFailed: !isValid || isFailed,
      isExpired: (body.status || "").toLowerCase() === "expired",
      statusCode: String(body.status_code || body.status || ""),
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const va = config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    if (!va || !apiKey) {
      return {
        success: false,
        provider: "ipaymu",
        methods: [],
        categories: {},
        error: "Missing iPaymu credentials (BUAYAR_MERCHANT_CODE/VA or BUAYAR_API_KEY)",
        rawResponse: null,
      };
    }

    try {
      // Endpoint resmi iPaymu v2: GET /api/v2/payment-channels
      const url = `${this.getBaseUrl(sandbox)}/payment-channels`;
      const { signature, timestamp } = generateIpaymuSignature("GET", va, apiKey);

      const response = await httpFetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "va": va,
          "signature": signature,
          "timestamp": timestamp,
        },
      });

      const data: any = await response.json().catch(() => null);
      if (response.ok && data?.Data && Array.isArray(data.Data)) {
        const methods: PaymentMethod[] = [];
        const categories: Record<string, PaymentMethod[]> = {};

        for (const group of data.Data) {
          const groupCode = (group.Code || "").toLowerCase();
          const groupName = group.Name || group.Description || "Lainnya";
          const channels = group.Channels || [];

          let category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya" = "Lainnya";
          if (groupCode === "va") category = "Virtual Account";
          else if (groupCode === "cstore") category = "Retail / Gerai";
          else if (groupCode === "qris") category = "QRIS";
          else if (groupCode === "cc" || groupCode === "debitonline") category = "Kartu Kredit";
          else if (groupCode === "paylater") category = "Paylater / Cicilan";
          else if (groupCode === "ewallet" || groupCode === "ewallet-asia") category = "E-Wallet";
          else category = "Lainnya";

          for (const ch of channels) {
            const chCode = (ch.Code || "").toLowerCase();
            let canonicalCode = chCode;
            if (groupCode === "va") {
              canonicalCode = chCode === "bag" ? "bag_va" : chCode === "bmi" ? "muamalat_va" : `${chCode}_va`;
            } else if (groupCode === "cc") {
              canonicalCode = "credit_card";
            } else if (groupCode === "qris") {
              canonicalCode = "qris";
            }

            let totalFee = "-";
            if (ch.TransactionFee) {
              if (ch.TransactionFee.ActualFeeType === "PERCENT") {
                totalFee = `${ch.TransactionFee.ActualFee}%`;
              } else if (ch.TransactionFee.ActualFee !== undefined) {
                totalFee = `IDR ${Number(ch.TransactionFee.ActualFee).toLocaleString()}`;
              }
            }

            const pm: PaymentMethod = {
              paymentMethod: canonicalCode,
              code: canonicalCode,
              paymentName: ch.Name || ch.Description || canonicalCode,
              paymentImage: ch.Logo || `https://my.ipaymu.com/images/banks/${chCode}.png`,
              totalFee,
              category,
              extra: {
                healthStatus: ch.HealthStatus,
                featureStatus: ch.FeatureStatus,
                instructionsDoc: ch.PaymentInstructionsDoc,
                feeDetail: ch.TransactionFee,
              },
            };

            // Availability check: iPaymu mengembalikan FeatureStatus ("active")
            // dan HealthStatus ("online") per channel. Saluran yang dilaporkan
            // secara eksplisit tidak aktif / tidak sehat TIDAK boleh tampil di
            // daftar (jika field tidak ada, saluran dianggap tersedia).
            const health = String(ch.HealthStatus || "").toLowerCase();
            const feature = String(ch.FeatureStatus || "").toLowerCase();
            const explicitlyUnavailable =
              (feature !== "" && feature !== "active") || (health !== "" && health !== "online");
            if (explicitlyUnavailable) continue;

            methods.push(pm);
            if (!categories[category]) categories[category] = [];
            categories[category].push(pm);
          }
        }

        return {
          success: true,
          provider: "ipaymu",
          methods,
          categories,
          rawResponse: data,
        };
      }

      return {
        success: false,
        provider: "ipaymu",
        methods: [],
        categories: {},
        error: data?.Message || data?.message || `Failed to fetch payment channels (HTTP ${response.status})`,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: "ipaymu",
        methods: [],
        categories: {},
        error: err.message || "Failed to fetch iPaymu payment channels",
        rawResponse: null,
      };
    }
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{
    success: boolean;
    enabled: string[];
    source?: "live" | "static";
    error?: string;
  }> {
    // LIVE: iPaymu menyediakan `GET /api/v2/payment-channels`, jadi hasil ini
    // benar-benar mencerminkan channel yang aktif di akun merchant.
    try {
      const res = await this.getPaymentMethods({ amount: 10000 }, config);
      if (res.success && res.methods) {
        return {
          success: true,
          enabled: res.methods.map((m) => m.paymentMethod),
          source: "live",
        };
      }
      return {
        success: false,
        enabled: [],
        source: "live",
        error: res.error || "Failed to probe iPaymu payment methods",
      };
    } catch (e: any) {
      return {
        success: false,
        enabled: [],
        source: "live",
        error: e.message || "Failed to probe iPaymu payment methods",
      };
    }
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const va = config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const url = `${this.getBaseUrl(sandbox)}/transaction`;
    // PENTING: iPaymu /transaction HANYA menerima TransactionId numerik (ID dari iPaymu),
    // bukan referenceId/orderId merchant. Pastikan consumer mengirim `invoice.reference`
    // (TransactionId dari response createInvoice), bukan order_number.
    const payload = { transactionId: merchantOrderId };
    const { signature, timestamp } = generateIpaymuSignature("POST", va, apiKey, payload);

    try {
      const response = await httpFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "va": va,
          "signature": signature,
          "timestamp": timestamp,
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
          provider: "ipaymu",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.Message || `HTTP error! Status: ${response.status}`,
          error: data?.Message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const txData = data.Data || {};
      const rawStatus = txData.Status !== undefined ? txData.Status : txData.status;
      const statusDesc = (txData.StatusDesc || "").toString().toLowerCase();
      const paidStatus = (txData.PaidStatus || "").toString().toLowerCase();
      const statusCode = txData.StatusCode !== undefined ? Number(txData.StatusCode) : (rawStatus !== undefined ? Number(rawStatus) : undefined);

      const isPaid = statusCode === 1 || paidStatus === "paid" || statusDesc.includes("berhasil") || statusDesc.includes("success");
      const isPending = statusCode === 0 || paidStatus === "unpaid" || statusDesc.includes("menunggu") || statusDesc.includes("pending");
      const isExpired = statusCode === 2 || statusDesc.includes("expired") || statusDesc.includes("kadaluarsa");
      const isFailed = !isPaid && !isPending && !isExpired;

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "ipaymu",
        orderId: txData.ReferenceId || merchantOrderId,
        reference: String(txData.TransactionId || ""),
        amount: Number(txData.Amount || txData.Total) || 0,
        statusCode: String(txData.StatusCode || txData.Status || ""),
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: txData.StatusDesc || txData.Status || "",
        paymentType: txData.PaymentMethod || txData.Via,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "ipaymu",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in iPaymu",
        error: e.message || "Failed to check transaction status in iPaymu",
        rawResponse: null,
      };
    }
  }
}
