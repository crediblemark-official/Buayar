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
import { generateFinpaySignature, verifyFinpaySignature } from "./signature";

export class FinpayProvider extends BasePaymentProvider {
  readonly name = "finpay";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://sandbox.finpay.co.id"
      : "https://api.finpay.id";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const finpayMethod = toFinpayPaymentMethod(params.paymentMethod);
    const isDirect = !!finpayMethod;

    const baseUrl = this.getBaseUrl(sandbox);
    const endpoint = isDirect ? "/pg/payment/direct" : "/pg/payment/card/initiate";
    const url = `${baseUrl}${endpoint}`;

    const signature = generateFinpaySignature(merchantId, orderId, integerAmount, merchantKey);

    const payload: any = {
      merchant_id: merchantId,
      order_id: orderId,
      amount: integerAmount,
      product_description: productDetails,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone || "",
      payment_channel: finpayMethod || "",
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
          provider: "finpay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.response_desc || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      const statusText = (data.status || data.response_code || "").toString().toUpperCase();
      if (statusText === "SUCCESS" || statusText === "00" || statusText === "200" || statusText === "OK" || data.payment_url || data.redirect_url || data.va_number) {
        const res: InvoiceResponse = {
          success: true,
          provider: "finpay",
          orderId: data.order_id || orderId,
          amount: data.amount ? Number(data.amount) : integerAmount,
          reference: data.transaction_id || data.reference_id || orderId,
          paymentUrl: data.payment_url || data.redirect_url || data.checkout_url,
          rawResponse: data,
        };

        if (data.va_number || data.virtual_account_number) {
          res.vaNumber = data.va_number || data.virtual_account_number;
          res.vaBank = (data.bank || finpayMethod || "").toLowerCase();
        }

        if (data.qr_string || data.qr_content) {
          res.qrString = data.qr_string || data.qr_content;
          res.qrCodeUrl = data.qr_url || data.qr_image_url;
        }

        if (data.payment_code) {
          res.paymentCode = data.payment_code;
        }

        if (data.expired_date || data.expired_at) {
          res.expiresAt = new Date(data.expired_date || data.expired_at);
        }

        return res;
      } else {
        return {
          success: false,
          provider: "finpay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.response_desc || data.message || `Finpay Error: ${statusText}`,
        };
      }
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
    const merchantId = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";

    const orderId = body.order_id || body.orderId || body.invoice_number || "";
    const amount = body.amount || body.total_amount || 0;
    const signature = body.signature || "";

    const isValid = verifyFinpaySignature(merchantId, orderId, Number(amount), merchantKey, signature);
    const rawStatus = (body.status || body.payment_status || body.response_code || "").toUpperCase();

    const isPaid = isValid && (rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED" || rawStatus === "00");
    const isPending = rawStatus === "PENDING" || rawStatus === "01";
    const isExpired = rawStatus === "EXPIRED";
    const isFailed = !isValid || rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";

    return {
      isValid,
      provider: "finpay",
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

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account",
        paymentImage: "https://finpay.id/assets/bca.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account",
        paymentImage: "https://finpay.id/assets/mandiri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://finpay.id/assets/bni.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://finpay.id/assets/bri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://finpay.id/assets/permata.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: "https://finpay.id/assets/cimb.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://finpay.id/assets/bsi.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (Finpay)",
        paymentImage: "https://finpay.id/assets/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "pos",
        code: "pos",
        paymentName: "Kantor Pos Indonesia (Finpay)",
        paymentImage: "https://finpay.id/assets/pos.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart",
        paymentImage: "https://finpay.id/assets/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://finpay.id/assets/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO",
        paymentImage: "https://finpay.id/assets/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA",
        paymentImage: "https://finpay.id/assets/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay",
        paymentImage: "https://finpay.id/assets/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "linkaja",
        code: "linkaja",
        paymentName: "LinkAja",
        paymentImage: "https://finpay.id/assets/linkaja.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (Visa, Mastercard)",
        paymentImage: "https://finpay.id/assets/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
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

    const url = `${this.getBaseUrl(sandbox)}/pg/payment/status`;
    const signature = generateFinpaySignature(merchantId, merchantOrderId, 0, merchantKey);

    const payload = {
      merchant_id: merchantId,
      order_id: merchantOrderId,
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
          statusMessage: data?.response_desc || `HTTP error! Status: ${response.status}`,
          error: data?.response_desc || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const statusCode = String(data.status || data.response_code || "");
      const isPaid = statusCode === "SUCCESS" || statusCode === "PAID" || statusCode === "00";
      const isPending = statusCode === "PENDING" || statusCode === "01";
      const isExpired = statusCode === "EXPIRED";
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
        provider: "finpay",
        orderId: data.order_id || merchantOrderId,
        reference: data.transaction_id || data.reference_id || "",
        amount: data.amount ? Number(data.amount) : 0,
        statusCode,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.response_desc || data.status || "",
        paymentType: data.payment_channel,
        transactionTime: data.transaction_time ? new Date(data.transaction_time) : undefined,
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
