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
import { toPrismalinkPaymentMethod } from "../../core/canonical";
import { generatePrismalinkSignature, verifyPrismalinkSignature } from "./signature";

export class PrismalinkProvider extends BasePaymentProvider {
  readonly name = "prismalink";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://sandbox-api.prismalink.co.id"
      : "https://api.prismalink.co.id";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const prismaMethod = toPrismalinkPaymentMethod(params.paymentMethod);
    const isDirect = !!prismaMethod;

    const baseUrl = this.getBaseUrl(sandbox);
    const endpoint = isDirect ? "/api/v1/payment/direct" : "/api/v1/payment/checkout";
    const url = `${baseUrl}${endpoint}`;

    const signature = generatePrismalinkSignature(merchantId, orderId, integerAmount, secretKey);

    let payload: any;
    if (isDirect) {
      payload = {
        merchant_id: merchantId,
        order_id: orderId,
        amount: integerAmount,
        payment_method: prismaMethod,
        product_details: productDetails,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone || "",
        callback_url: callbackUrl || config.callbackUrl || "",
        return_url: returnUrl || config.returnUrl || "",
        signature,
        ...params.providerParams,
      };
    } else {
      payload = {
        merchant_id: merchantId,
        order_id: orderId,
        amount: integerAmount,
        product_details: productDetails,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone || "",
        callback_url: callbackUrl || config.callbackUrl || "",
        return_url: returnUrl || config.returnUrl || "",
        signature,
        ...params.providerParams,
      };
    }

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
          provider: "prismalink",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.message || data?.response_message || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      const statusText = (data.status || data.response_code || "").toString().toUpperCase();
      if (statusText === "SUCCESS" || statusText === "00" || statusText === "200" || statusText === "OK") {
        const res: InvoiceResponse = {
          success: true,
          provider: "prismalink",
          orderId: data.order_id || orderId,
          amount: data.amount ? Number(data.amount) : integerAmount,
          reference: data.transaction_id || data.reference_id || orderId,
          paymentUrl: data.payment_url || data.checkout_url,
          rawResponse: data,
        };

        if (data.va_number || data.virtual_account_number) {
          res.vaNumber = data.va_number || data.virtual_account_number;
          res.vaBank = (data.bank || prismaMethod?.replace("_VA", "") || "").toLowerCase();
        }

        if (data.qr_string || data.qr_code) {
          res.qrString = data.qr_string || data.qr_code;
          res.qrCodeUrl = data.qr_image_url || data.qr_url;
        }

        if (data.payment_code) {
          res.paymentCode = data.payment_code;
        }

        if (data.deeplink) {
          res.deeplink = data.deeplink;
          res.paymentUrl = res.paymentUrl || data.deeplink;
        }

        if (data.expired_at) {
          res.expiresAt = new Date(data.expired_at);
        }

        return res;
      } else {
        return {
          success: false,
          provider: "prismalink",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.message || data.response_message || `PrismaLink Error: ${statusText}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "prismalink",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to PrismaLink API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const merchantId = config.merchantCode || config.merchantId || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";

    const orderId = body.order_id || body.orderId || "";
    const amount = body.amount || 0;
    const signature = body.signature || "";

    const isValid = verifyPrismalinkSignature(merchantId, orderId, Number(amount), secretKey, signature);
    const rawStatus = (body.status || body.transaction_status || "").toUpperCase();

    const isPaid = isValid && (rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED" || body.response_code === "00");
    const isPending = rawStatus === "PENDING" || body.response_code === "01";
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
      provider: "prismalink",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: rawStatus || body.response_code,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account",
        paymentImage: "https://prismalink.co.id/images/bca.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account",
        paymentImage: "https://prismalink.co.id/images/mandiri.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://prismalink.co.id/images/bni.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://prismalink.co.id/images/bri.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://prismalink.co.id/images/permata.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: "https://prismalink.co.id/images/cimb.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://prismalink.co.id/images/bsi.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal",
        paymentImage: "https://prismalink.co.id/images/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "gopay",
        code: "gopay",
        paymentName: "GoPay",
        paymentImage: "https://prismalink.co.id/images/gopay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO",
        paymentImage: "https://prismalink.co.id/images/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA",
        paymentImage: "https://prismalink.co.id/images/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay",
        paymentImage: "https://prismalink.co.id/images/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart",
        paymentImage: "https://prismalink.co.id/images/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://prismalink.co.id/images/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card",
        paymentImage: "https://prismalink.co.id/images/cc.png",
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
      provider: "prismalink",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const merchantId = config.merchantCode || config.merchantId || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const url = `${this.getBaseUrl(sandbox)}/api/v1/payment/status`;
    const signature = generatePrismalinkSignature(merchantId, merchantOrderId, 0, secretKey);

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
          provider: "prismalink",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.message || `HTTP error! Status: ${response.status}`,
          error: data?.message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const rawStatus = (data.status || data.transaction_status || "").toUpperCase();
      const isPaid = rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED" || data.response_code === "00";
      const isPending = rawStatus === "PENDING" || data.response_code === "01";
      const isExpired = rawStatus === "EXPIRED";
      const isFailed = rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "prismalink",
        orderId: data.order_id || merchantOrderId,
        reference: data.transaction_id || data.reference_id || "",
        amount: data.amount ? Number(data.amount) : 0,
        statusCode: rawStatus || data.response_code || "",
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.status || data.message || "",
        paymentType: data.payment_method,
        transactionTime: data.transaction_time ? new Date(data.transaction_time) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "prismalink",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in PrismaLink",
        error: e.message || "Failed to check transaction status in PrismaLink",
        rawResponse: null,
      };
    }
  }
}
