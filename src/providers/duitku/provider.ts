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
  DisburseParams,
  DisburseResult,
  CheckBalanceResult,
} from "../../types";
import { getPaymentMethodCategory } from "../../utils/category";
import { toDuitkuPaymentMethod, toCanonicalPaymentMethod } from "../../core/canonical";
import {
  getDuitkuInquirySignatures,
  getDuitkuPopSignature,
  verifyDuitkuCallbackSignature,
  getDuitkuPaymentMethodsSignature,
  getDuitkuStatusSignatures,
} from "./signature";
import { executeDuitkuDisburse, executeDuitkuCheckBalance } from "./disbursement";
import { httpFetch } from "../../utils/http";

export class DuitkuProvider extends BasePaymentProvider {
  readonly name = "duitku";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api-sandbox.duitku.com"
      : "https://api-prod.duitku.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, customer, returnUrl, callbackUrl } = params;
    const productDetails = params.productDetails || params.description || "Payment";
    const merchantCode = config.merchantCode || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const duitkuMethod = toDuitkuPaymentMethod(params.paymentMethod);
    const isDirectInquiry = !!duitkuMethod;

    const url = isDirectInquiry
      ? (sandbox
        ? "https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry"
        : "https://passport.duitku.com/webapi/api/merchant/v2/inquiry")
      : `${this.getBaseUrl(sandbox)}/api/merchant/createInvoice`;

    const integerAmount = Math.round(amount);
    // Jalur legacy webapi (direct inquiry) memakai signature MD5 di body.
    // Jalur Duitku POP (createInvoice) memakai signature HMAC-SHA256 di HEADER.
    const { payloadSignature } = getDuitkuInquirySignatures(merchantCode, orderId, integerAmount, apiKey);
    const popSignature = isDirectInquiry ? undefined : getDuitkuPopSignature(merchantCode, apiKey);

    // Dokumentasi resmi Duitku menandai `customerVaName` sebagai parameter
    // **wajib** pada Request Transaction, dan sejumlah kanal (mis. Indodana
    // Paylater/DN) menolak permintaan dengan HTTP 400 tanpa `customerDetail`.
    // Sebelumnya kedua field ini tidak pernah dikirim, sehingga kanal seperti
    // DN gagal dengan body kosong yang tidak informatif.
    //   - `customerVaName` dibatasi 20 karakter sesuai tabel parameter Duitku.
    //   - `customerDetail` diisi dari data pelanggan yang tersedia; field lain
    //     bersifat opsional.
    const customerVaName = (customer.name || "").trim().slice(0, 20);
    const customerDetail = {
      firstName: customer.name || "",
      lastName: "",
      email: customer.email || "",
      phoneNumber: customer.phone || "",
      // Dokumentasi Duitku menandai alamat sebagai opsional, tetapi metode
      // credit (mis. Indodana Paylater/DN) menolak permintaan dengan HTTP 400
      // berbadan kosong jika objek `billingAddress` tidak ada (diverifikasi
      // live: `billingAddress: {}` sudah cukup). Isinya opsional, jadi diisi
      // dari data pelanggan yang tersedia; merchant bisa menimpanya lewat
      // `providerParams.customerDetail`.
      billingAddress: {
        firstName: customer.name || "",
        lastName: "",
        phone: customer.phone || "",
      },
    };
    // `itemDetails` hanya dikirim bila merchant memang menyediakannya, agar
    // jumlahnya selalu konsisten dengan `paymentAmount` (Duitku membalas 409
    // "Payment amount must be equal to all item price" jika tidak).
    const itemDetails = Array.isArray(params.items) && params.items.length
      ? params.items.map((it) => ({
          name: it.name,
          price: Math.round(it.price),
          quantity: it.quantity,
        }))
      : undefined;

    const payload = {
      ...(isDirectInquiry ? { merchantCode } : {}),
      paymentAmount: integerAmount,
      merchantOrderId: orderId,
      productDetails,
      email: customer.email,
      phoneNumber: customer.phone || "",
      customerVaName,
      customerDetail,
      ...(itemDetails ? { itemDetails } : {}),
      ...(isDirectInquiry ? { signature: payloadSignature } : {}),
      callbackUrl: callbackUrl || config.callbackUrl || "",
      returnUrl: returnUrl || config.returnUrl || "",
      expiryPeriod: 1440,
      ...(duitkuMethod ? { paymentMethod: duitkuMethod } : {}),
      ...params.providerParams,
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      if (popSignature) {
        headers["x-duitku-signature"] = popSignature.signature;
        headers["x-duitku-timestamp"] = popSignature.timestamp;
        headers["x-duitku-merchantcode"] = merchantCode;
      }

      const response = await httpFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok) {
        return {
          success: false,
          provider: "duitku",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.Message || data?.statusMessage || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.statusCode === "00") {
        return {
          success: true,
          provider: "duitku",
          orderId,
          amount: integerAmount,
          paymentUrl: data.paymentUrl,
          reference: data.reference,
          vaNumber: data.vaNumber,
          vaBank: duitkuMethod ? toCanonicalPaymentMethod("duitku", duitkuMethod).replace("_va", "") : undefined,
          qrString: data.qrString,
          qrCodeUrl: data.qrCodeUrl,
          paymentCode: data.paymentCode,
          expiresAt: new Date(Date.now() + 1440 * 60 * 1000),
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          provider: "duitku",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.statusMessage || `Duitku Error: ${data.statusCode}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "duitku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make inquiry request to Duitku",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const apiKey = config.apiKey || "";
    const merchantOrderId = body.merchantOrderId || "";
    const amount = body.amount || "";

    const isValid = verifyDuitkuCallbackSignature(body, apiKey);
    const resultCode = typeof body.resultCode === "string" ? body.resultCode : undefined;

    // Signature tidak sah -> tidak ada satu pun field yang bisa dipercaya.
    if (!isValid) {
      return {
        isValid: false,
        provider: "duitku",
        orderId: merchantOrderId,
        amount: amount ? Number(amount) : 0,
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusCode: resultCode,
        rawPayload: body,
        error: "Signature callback Duitku tidak cocok.",
      };
    }

    // Signature SAH, tapi itu hanya membuktikan tiga field: merchantCode, amount,
    // merchantOrderId. `resultCode` — satu-satunya penentu status — TIDAK ikut
    // ditandatangani (rumus resmi Duitku: MD5(merchantCode + amount +
    // merchantOrderId + apiKey)). Artinya penyerang cukup mengambil satu callback
    // bertanda tangan sah untuk order miliknya sendiri, lalu mengubah
    // `resultCode` menjadi "00" untuk menandai order yang tidak dibayar sebagai
    // lunas. Ditunjukkan live terhadap invoice sandbox sungguhan.
    //
    // Jadi signature yang sah TIDAK boleh diterjemahkan jadi "paid". Status
    // defaultnya "pending", dan hanya bisa dinaikkan ke "paid" lewat jawaban
    // server-to-server dari Duitku.
    const dasar: VerifyCallbackResult = {
      isValid: true,
      provider: "duitku",
      orderId: merchantOrderId,
      amount: amount ? Number(amount) : 0,
      status: "pending",
      isPaid: false,
      isPending: true,
      isFailed: false,
      // Duitku memakai "02" untuk Failed DAN Expired sekaligus, jadi dari
      // callback tidak bisa dibedakan mana yang mana. Menandai keduanya
      // `isExpired: true` adalah tebakan.
      isExpired: false,
      statusCode: resultCode,
      paymentUnconfirmed: true,
      rawPayload: body,
      unconfirmedReason:
        "Signature Duitku hanya mencakup merchantCode + amount + merchantOrderId, " +
        "tidak mencakup resultCode. Status jadi belum bisa dibuktikan dari callback ini.",
    };

    if (config.extra?.confirmDuitkuCallback !== true) {
      return dasar;
    }

    // Opt-in: tanya Duitku langsung. Ini persis yang disarankan dokumentasi
    // resmi Duitku sendiri — "insert a transaction check when you receive a
    // callback so that the payment status is guaranteed."
    const konfirmasi = await this.checkTransaction({ merchantOrderId }, config);

    // Konfirmasi yang GAGAL (jaringan, timeout, order tidak ada di endpoint)
    // tidak boleh mengubah status jadi "failed": kita jadi tidak tahu apa pun,
    // dan "failed" adalah keputusan yang berakibat samping mahal. Tetap pending.
    if (!konfirmasi.success) {
      return {
        ...dasar,
        unconfirmedReason: `${dasar.unconfirmedReason} Konfirmasi ke Duitku juga gagal: ${
          konfirmasi.statusMessage || konfirmasi.error || "alasan tidak diketahui"
        }`,
      };
    }

    return {
      ...dasar,
      status: konfirmasi.status,
      isPaid: konfirmasi.isPaid,
      isPending: konfirmasi.isPending,
      isFailed: konfirmasi.isFailed,
      isExpired: konfirmasi.isExpired,
      amount: konfirmasi.amount || dasar.amount,
      statusCode: konfirmasi.statusCode || resultCode,
      paymentUnconfirmed: false,
      unconfirmedReason: undefined,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const amount = params?.amount ? Math.round(params.amount) : 10000;
    const merchantCode = config.merchantCode || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const url = sandbox
      ? "https://sandbox.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod"
      : "https://passport.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod";

    const datetime = new Date().toISOString().replace("T", " ").slice(0, 19);
    const signature = getDuitkuPaymentMethodsSignature(merchantCode, amount, datetime, apiKey);

    try {
      const response = await httpFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantcode: merchantCode,
          amount,
          datetime,
          signature,
        }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false,
          provider: "duitku",
          methods: [],
          rawResponse: data,
          error: data?.responseMessage || `HTTP error! Status: ${response.status}`,
        };
      }

      if (data.responseCode === "00") {
        const rawMethods = data.paymentFee || [];
        const categories: Record<string, PaymentMethod[]> = {};

        const methods: PaymentMethod[] = rawMethods.map((m: any) => {
          const category = getPaymentMethodCategory(m.paymentMethod, m.paymentName);
          const canonicalCode = toCanonicalPaymentMethod("duitku", m.paymentMethod);
          const item: PaymentMethod = {
            paymentMethod: m.paymentMethod,
            paymentName: m.paymentName,
            paymentImage: m.paymentImage,
            totalFee: m.totalFee,
            category,
            code: canonicalCode,
            feeDetail: {
              flat: Number(m.totalFee) || 0,
              percent: 0,
              totalFee: Number(m.totalFee) || 0,
            },
          };

          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push(item);

          return item;
        });

        return {
          success: true,
          provider: "duitku",
          methods,
          categories,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          provider: "duitku",
          methods: [],
          rawResponse: data,
          error: data.responseMessage || `Duitku Error: ${data.responseCode}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "duitku",
        methods: [],
        rawResponse: null,
        error: e.message || "Failed to get payment methods from Duitku",
      };
    }
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const merchantCode = config.merchantCode || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const url = sandbox
      ? "https://api-sandbox.duitku.com/api/merchant/transactionStatus"
      : "https://api-prod.duitku.com/api/merchant/transactionStatus";

    const { timestamp, headerSignature, bodySignature } = getDuitkuStatusSignatures(merchantCode, merchantOrderId, apiKey);

    try {
      const response = await httpFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-duitku-signature": headerSignature,
          "x-duitku-timestamp": timestamp,
          "x-duitku-merchantcode": merchantCode,
        },
        body: JSON.stringify({
          merchantCode,
          merchantOrderId,
          signature: bodySignature,
        }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        // "Tidak ditemukan" sama sekali berbeda dari "pembayaran gagal".
        // Duitku menjawab "Transaction not found" untuk order POP
        // (createInvoice) yang memang tidak pernah tercatat di endpoint ini —
        // dibuktikan live: order POP sah tapi statusnya selalu not found,
        // sedangkan order Direct Inquiry di endpoint yang sama jalan normal.
        // Menandai `isFailed` di sini membuat merchant membatalkan order yang
        // sebenarnya masih bisa dibayar.
        const pesan = data?.Message || text || `HTTP error! Status: ${response.status}`;
        const tidakDitemukan = /(transaction|order)\s+not found/i.test(String(pesan));

        return {
          success: false,
          provider: "duitku",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          // Status TIDAK pernah "failed" dari jalur ini. Kegagalan saat
          // menanyakan status bukan bukti bahwa pembayaran gagal, dan
          // "failed" punya akibat samping: merchant membatalkan order.
          status: "pending",
          isPaid: false,
          isPending: true,
          isFailed: false,
          isExpired: false,
          orderNotFound: tidakDitemukan,
          statusMessage: tidakDitemukan
            ? `Duitku tidak punya catatan untuk order ini (${pesan}). Order yang dibuat lewat ` +
              "POP (createInvoice) memang tidak tercatat di endpoint transactionStatus — " +
              "status order POP tidak bisa dikonfirmasi lewat API."
            : `Pengecekan status gagal: ${pesan}`,
          error: tidakDitemukan ? `Order tidak ditemukan di Duitku: ${pesan}` : pesan,
          rawResponse: data,
        };
      }

      const isPaid = data.statusCode === "00";
      const isPending = data.statusCode === "01";
      const isFailed = data.statusCode !== "00" && data.statusCode !== "01";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : "failed";

      return {
        success: true,
        provider: "duitku",
        orderId: data.merchantOrderId || merchantOrderId,
        reference: data.reference || "",
        amount: data.amount ? Number(data.amount) : 0,
        statusCode: data.statusCode || "",
        status,
        isPaid,
        isPending,
        isFailed,
        // "02" berarti Failed/Expired sekaligus menurut dokumentasi resmi
        // Duitku. Keduanya tidak bisa dibedakan dari kode status, jadi
        // `isExpired` dibiarkan false: Kabar "belum berhasil" sudah
        // tertangani `isFailed`, sedangkan menebak "expired"
        // akan menampilkan layar kedaluwarsa untuk pembayaran yang ditolak.
        isExpired: false,
        statusMessage: data.statusMessage || "",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "duitku",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Duitku",
        error: e.message || "Failed to check transaction status in Duitku",
        rawResponse: null,
      };
    }
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{ success: boolean; enabled: string[]; error?: string }> {
    try {
      const res = await this.getPaymentMethods({ amount: 10000 }, config);
      if (res.success && res.methods) {
        return {
          success: true,
          enabled: res.methods.map(m => m.paymentMethod),
        };
      }
      return {
        success: false,
        enabled: [],
        error: res.error || "Failed to probe Duitku payment methods",
      };
    } catch (e: any) {
      return {
        success: false,
        enabled: [],
        error: e.message,
      };
    }
  }

  /**
   * Payout / Transfer Dana (Duitku Transfer Online)
   */
  async disburse(params: DisburseParams, config: ProviderConfig): Promise<DisburseResult> {
    return executeDuitkuDisburse(params, config);
  }

  /**
   * Cek saldo merchant (Duitku Disbursement Check Balance)
   */
  async checkBalance(config: ProviderConfig): Promise<CheckBalanceResult> {
    return executeDuitkuCheckBalance(config);
  }
}
