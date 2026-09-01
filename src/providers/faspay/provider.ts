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
import { toFaspayPaymentMethod } from "../../core/canonical";
import { generateFaspaySignature, verifyFaspaySignature } from "./signature";

export class FaspayProvider extends BasePaymentProvider {
  readonly name = "faspay";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://sandbox.faspay.co.id"
      : "https://web.faspay.co.id";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const userId = config.clientKey || config.extra?.userId || merchantId;
    const password = config.apiKey || config.serverKey || config.secretKey || "";
    const merchantName = config.extra?.merchantName || "Merchant";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const faspayChannel = toFaspayPaymentMethod(params.paymentMethod);
    const isDirect = !!faspayChannel;

    const baseUrl = this.getBaseUrl(sandbox);
    const endpoint = "/cvr/100001/10";
    const url = `${baseUrl}${endpoint}`;

    const now = new Date();
    const billDate = now.toISOString().replace("T", " ").substring(0, 19);
    const expDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19);

    const signature = generateFaspaySignature(userId, password, orderId);

    const payload: any = {
      request: "Post Data Transaction",
      merchant_id: merchantId,
      merchant: merchantName,
      bill_no: orderId,
      bill_date: billDate,
      bill_expired: expDate,
      bill_desc: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
      bill_currency: "IDR",
      bill_gross: integerAmount.toString() + "00",
      bill_total: integerAmount.toString() + "00",
      cust_no: customer.email || orderId,
      cust_name: customer.name,
      msisdn: customer.phone || "",
      email: customer.email,
      pay_type: isDirect ? "1" : "1",
      payment_channel: faspayChannel || "",
      return_url: returnUrl || config.returnUrl || "",
      callback_url: callbackUrl || config.callbackUrl || "",
      signature,
      ...params.providerParams,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
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
          provider: "faspay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.response_desc || data?.response_message || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.response_code === "00" || data.response_code === "0000" || data.response === "Payment Has Been Processed") {
        const res: InvoiceResponse = {
          success: true,
          provider: "faspay",
          orderId: data.bill_no || orderId,
          amount: integerAmount,
          reference: data.trx_id || data.trx_no || orderId,
          paymentUrl: data.redirect_url,
          rawResponse: data,
        };

        if (data.va_no || data.trx_no) {
          res.vaNumber = data.va_no || data.trx_no;
          res.vaBank = params.paymentMethod?.toString().replace("_va", "").toLowerCase();
        }

        if (data.qr_string || data.qr_content) {
          res.qrString = data.qr_string || data.qr_content;
          res.qrCodeUrl = data.qr_url;
        }

        if (data.payment_code) {
          res.paymentCode = data.payment_code;
        }

        res.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        return res;
      } else {
        return {
          success: false,
          provider: "faspay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.response_desc || data.response_message || `Faspay Error: ${data.response_code}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "faspay",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Faspay API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const merchantId = config.merchantCode || config.merchantId || "";
    const userId = config.clientKey || config.extra?.userId || merchantId;
    const password = config.apiKey || config.serverKey || config.secretKey || "";

    const billNo = body.bill_no || body.billNo || body.order_id || "";
    const statusCode = String(body.payment_status_code || body.payment_status || "");
    const amount = body.payment_total || body.bill_total || body.amount || 0;
    const signature = body.signature || "";

    const isValid = verifyFaspaySignature(userId, password, billNo, statusCode, signature);

    // 2 = Sukses / Terbayar di Faspay
    const isPaid = isValid && (statusCode === "2" || statusCode === "00" || (body.payment_status_desc || "").toUpperCase() === "PAYMENT SUCCESS");
    const isPending = statusCode === "1" || statusCode === "0";
    const isExpired = statusCode === "3";
    const isFailed = !isValid || statusCode === "4" || (!isPaid && !isPending && !isExpired);

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";

    let numAmount = 0;
    if (typeof amount === "string") {
      if (amount.includes(".")) {
        numAmount = Math.round(parseFloat(amount));
      } else if (amount.length > 2 && Number(amount) > 10000000) {
        // Faspay amounts in cents without decimal point (e.g. 35000000 -> 350000)
        numAmount = Math.round(Number(amount) / 100);
      } else {
        numAmount = Number(amount);
      }
    } else {
      numAmount = Number(amount) || 0;
    }

    return {
      isValid,
      provider: "faspay",
      orderId: String(billNo),
      amount: numAmount,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Bill Payment (400)",
        paymentImage: "https://faspay.co.id/images/mandiri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account (401)",
        paymentImage: "https://faspay.co.id/images/bni.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account (402)",
        paymentImage: "https://faspay.co.id/images/bca.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account (405)",
        paymentImage: "https://faspay.co.id/images/bri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account (408)",
        paymentImage: "https://faspay.co.id/images/permata.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account (702)",
        paymentImage: "https://faspay.co.id/images/cimb.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "danamon_va",
        paymentName: "Danamon Virtual Account (708)",
        paymentImage: "https://faspay.co.id/images/danamon.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account (800)",
        paymentImage: "https://faspay.co.id/images/bsi.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (704)",
        paymentImage: "https://faspay.co.id/images/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO (812)",
        paymentImage: "https://faspay.co.id/images/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA (814)",
        paymentImage: "https://faspay.co.id/images/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay (819)",
        paymentImage: "https://faspay.co.id/images/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "linkaja",
        code: "linkaja",
        paymentName: "LinkAja (808)",
        paymentImage: "https://faspay.co.id/images/linkaja.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart (706)",
        paymentImage: "https://faspay.co.id/images/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret (707)",
        paymentImage: "https://faspay.co.id/images/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (500)",
        paymentImage: "https://faspay.co.id/images/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "kredivo",
        code: "kredivo",
        paymentName: "Kredivo (703)",
        paymentImage: "https://faspay.co.id/images/kredivo.png",
        totalFee: "2.3%",
        category: "Paylater / Cicilan",
      },
      {
        paymentMethod: "akulaku",
        code: "akulaku",
        paymentName: "Akulaku (711)",
        paymentImage: "https://faspay.co.id/images/akulaku.png",
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
      provider: "faspay",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const userId = config.clientKey || config.extra?.userId || merchantId;
    const password = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const url = `${this.getBaseUrl(sandbox)}/cvr/100004/10`;
    const signature = generateFaspaySignature(userId, password, merchantOrderId);

    const payload = {
      request: "Inquiry Payment Status",
      merchant_id: merchantId,
      bill_no: merchantOrderId,
      signature,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
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
          provider: "faspay",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.response_desc || `HTTP error! Status: ${response.status}`,
          error: data?.response_desc || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const statusCode = String(data.payment_status_code || data.response_code || "");
      const isPaid = statusCode === "2" || statusCode === "00" || (data.payment_status_desc || "").toUpperCase() === "PAYMENT SUCCESS";
      const isPending = statusCode === "1" || statusCode === "0";
      const isExpired = statusCode === "3";
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
        provider: "faspay",
        orderId: data.bill_no || merchantOrderId,
        reference: data.trx_id || data.trx_no || "",
        amount: data.payment_total ? Math.round(Number(data.payment_total) / 100) : 0,
        statusCode,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.payment_status_desc || data.response_desc || "",
        paymentType: data.payment_channel,
        transactionTime: data.payment_date ? new Date(data.payment_date) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "faspay",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Faspay",
        error: e.message || "Failed to check transaction status in Faspay",
        rawResponse: null,
      };
    }
  }
}
