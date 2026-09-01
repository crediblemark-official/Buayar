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
import { buildTwoCheckoutAuth, verifyTwoCheckoutWebhook } from "./signature";

export class TwoCheckoutProvider extends BasePaymentProvider {
  readonly name = "twocheckout";

  private getBaseUrl(config: ProviderConfig): string {
    return config.sandbox !== false
      ? "https://api.sandbox.2checkout.com/rest"
      : "https://api.2checkout.com/rest";
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    const merchantCode = config.merchantCode || config.merchantId || "";
    const secretKey = config.apiKey || config.secretKey || "";
    const { header } = buildTwoCheckoutAuth(merchantCode, secretKey);
    return {
      "X-Avangate-Authentication": header,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const currency = (params.currency || "USD").toUpperCase();
    const baseUrl = this.getBaseUrl(config);
    const headers = this.buildHeaders(config);
    const isDirect = !!params.paymentMethod;
    const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";

    const body: any = {
      Currency: currency,
      Language: "en",
      Country: config.extra?.country || "US",
      CustomerIP: params.providerParams?.customerIp || "127.0.0.1",
      Source: "API",
      MerchantReference: orderId,
      Items: [
        {
          Name: productDetails,
          Quantity: 1,
          Price: { Amount: (amount / 100).toFixed(2), Type: "CUSTOM" },
          Type: "PRODUCT",
          IsDynamic: true,
          Tangible: false,
        },
      ],
      BillingDetails: {
        FirstName: customer?.name?.split(" ")[0] || "Customer",
        LastName: customer?.name?.split(" ").slice(1).join(" ") || "Name",
        Email: customer?.email,
        Country: config.extra?.country || "US",
        Address1: config.extra?.address || "N/A",
        City: config.extra?.city || "N/A",
        State: config.extra?.state || "",
        Zip: config.extra?.zip || "00000",
      },
      ...params.providerParams,
    };

    if (!isDirect) {
      // Redirect to 2Checkout Hosted Checkout
      body.PaymentDetails = { Type: "EES_TOKEN_PAYMENT", Currency: currency };
    } else {
      // Direct payment method
      body.PaymentDetails = { Type: params.paymentMethod === "paypal" ? "PAYPAL" : "EES_TOKEN_PAYMENT", Currency: currency };
    }

    try {
      const response = await fetch(`${baseUrl}/6.0/orders`, {
        method: "POST", headers, body: JSON.stringify(body),
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data || data.error_code) {
        return { success: false, provider: "twocheckout", orderId, amount, rawResponse: data, error: data?.message || `HTTP ${response.status}` };
      }

      const paymentUrl = data.PaymentDetails?.PaymentMethod?.RedirectURL ||
        data.PaymentDetails?.PaymentMethod?.Href ||
        `${successUrl}?ref=${data.RefNo}`;

      return {
        success: true, provider: "twocheckout", orderId, amount,
        reference: data.RefNo || data.OrderNo?.toString(),
        paymentUrl,
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, provider: "twocheckout", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const secretWord = config.extra?.secretWord || config.apiKey || "";
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

    const saleId = parsedBody?.SALE_ID || parsedBody?.sale_id || "";
    const productId = parsedBody?.IPN_PID?.[0] || parsedBody?.product_id || "";
    const invoiceId = parsedBody?.IPN_PNAME?.[0] || parsedBody?.invoice_id || "";
    const providedHash = parsedBody?.HASH || parsedBody?.hash || "";

    const isValid = secretWord
      ? verifyTwoCheckoutWebhook(secretWord, saleId, productId, invoiceId, providedHash)
      : true;

    const orderId = parsedBody?.REFNOEXT || parsedBody?.ext_ref_no || parsedBody?.SALE_ID || "";
    const amount = Math.round(Number(parsedBody?.IPN_TOTAL_GENERAL || parsedBody?.total || 0) * 100);
    const statusRaw = (parsedBody?.ORDERSTATUS || parsedBody?.order_status || "").toUpperCase();

    const isPaid = statusRaw === "COMPLETE" || statusRaw === "COMPLETE_MANUAL";
    const isPending = statusRaw === "PENDING" || statusRaw === "PURCHASE_PENDING";
    const isFailed = statusRaw === "CANCELED" || statusRaw === "REFUND" || statusRaw === "FRAUD";
    const isExpired = statusRaw === "EXPIRED";

    const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

    return {
      isValid, provider: "twocheckout", orderId: String(orderId), amount, status, isPaid, isPending, isFailed, isExpired,
      statusCode: statusRaw, rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "EES_TOKEN_PAYMENT", paymentName: "Credit / Debit Card (Visa, Mastercard, Amex)", paymentImage: "https://www.2checkout.com/favicon.ico", totalFee: "3.5% + $0.35", category: "Kartu Kredit" },
      { paymentMethod: "paypal", code: "PAYPAL", paymentName: "PayPal", paymentImage: "https://www.2checkout.com/favicon.ico", totalFee: "3.5% + $0.35", category: "E-Wallet" },
      { paymentMethod: "wire_transfer", code: "WIRE", paymentName: "Wire Transfer / Bank Transfer", paymentImage: "https://www.2checkout.com/favicon.ico", totalFee: "Fixed fee", category: "Virtual Account" },
      { paymentMethod: "paylater", code: "PAY_LATER", paymentName: "Buy Now Pay Later (Klarna)", paymentImage: "https://www.2checkout.com/favicon.ico", totalFee: "Variable", category: "Paylater / Cicilan" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "twocheckout", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const baseUrl = this.getBaseUrl(config);
    const headers = this.buildHeaders(config);

    try {
      const response = await fetch(`${baseUrl}/6.0/orders/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET", headers,
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data || data.error_code) {
        return {
          success: false, provider: "twocheckout", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: data?.message || "HTTP Error", rawResponse: data,
        };
      }

      const statusRaw = (data.Status || "").toUpperCase();
      const isPaid = statusRaw === "COMPLETE";
      const isPending = statusRaw === "PENDING" || statusRaw === "PURCHASE_PENDING";
      const isExpired = statusRaw === "EXPIRED";
      const isFailed = statusRaw === "CANCELED" || statusRaw === "REFUND";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      return {
        success: true, provider: "twocheckout",
        orderId: data.ExternalReference || merchantOrderId, reference: data.RefNo?.toString() || merchantOrderId,
        amount: Math.round(Number(data.GrossAmount || 0) * 100), statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired,
        statusMessage: statusRaw, transactionTime: data.OrderDate ? new Date(data.OrderDate) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "twocheckout", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
