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
import { verifyPayuWebhook, buildPayuBasicAuth } from "./signature";

export class PayuProvider extends BasePaymentProvider {
  readonly name = "payu";

  private getBaseUrl(config: ProviderConfig): string {
    return config.sandbox !== false
      ? "https://secure.snd.payu.com"
      : "https://secure.payu.com";
  }

  /** OAuth2 Bearer Token untuk PayU */
  private async getAccessToken(config: ProviderConfig): Promise<string> {
    const clientId = config.extra?.oauthClientId || config.clientKey || "";
    const clientSecret = config.extra?.oauthClientSecret || config.apiKey || config.secretKey || "";

    if (!clientId || !clientSecret) {
      // Fallback to POS ID as basic if no OAuth creds
      return "";
    }

    const baseUrl = this.getBaseUrl(config);

    const response = await fetch(`${baseUrl}/pl/standard/user/oauth/authorize`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${buildPayuBasicAuth(clientId, clientSecret)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const text = await response.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!response.ok || !data?.access_token) {
      throw new Error(data?.error_description || `Failed to get PayU access token: ${response.status}`);
    }

    return data.access_token;
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const currency = (params.currency || "PLN").toUpperCase();
    const posId = config.merchantCode || config.merchantId || config.extra?.posId || "";
    const baseUrl = this.getBaseUrl(config);

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (e: any) {
      return { success: false, provider: "payu", orderId, amount, error: e.message, rawResponse: null };
    }

    const isDirect = !!params.paymentMethod;
    const continueUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";
    const notifyUrl = callbackUrl || config.callbackUrl || "";

    const body: any = {
      notifyUrl,
      customerIp: params.providerParams?.customerIp || "127.0.0.1",
      merchantPosId: posId,
      description: productDetails,
      currencyCode: currency,
      totalAmount: amount.toString(),
      extOrderId: orderId,
      continueUrl,
      buyer: {
        email: customer?.email,
        firstName: customer?.name?.split(" ")[0],
        lastName: customer?.name?.split(" ").slice(1).join(" ") || "-",
        phone: customer?.phone,
        language: "en",
      },
      products: [
        { name: productDetails, unitPrice: amount.toString(), quantity: "1" },
      ],
      ...params.providerParams,
    };

    if (isDirect && params.paymentMethod) {
      body.payMethods = {
        payMethod: {
          type: "PBL",
          value: params.paymentMethod, // e.g. "blik", "c" (card), "ap" (Apple Pay)
        },
      };
    }

    try {
      const response = await fetch(`${baseUrl}/api/v2_1/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        redirect: "manual", // PayU responds with 302
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      // PayU returns 302 redirect for checkout success
      if (response.status === 302 || response.headers.get("location")) {
        const location = response.headers.get("location") || "";
        return {
          success: true, provider: "payu", orderId, amount,
          reference: data?.orderId || orderId, paymentUrl: location, rawResponse: data,
        };
      }

      if (!response.ok || !data || data.status?.statusCode === "ERROR") {
        return { success: false, provider: "payu", orderId, amount, rawResponse: data, error: data?.status?.statusDesc || `HTTP ${response.status}` };
      }

      return {
        success: true, provider: "payu", orderId, amount,
        reference: data.orderId || orderId, paymentUrl: data.redirectUri, rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, provider: "payu", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const md5Key = config.extra?.md5Key || config.apiKey || config.secretKey || "";
    const signatureHeader = config.extra?.signatureHeader || "";
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

    const isValid = signatureHeader
      ? verifyPayuWebhook(rawBody, signatureHeader, md5Key)
      : false;

    const order = parsedBody?.order || parsedBody;
    const orderId = order.extOrderId || order.orderId || "";
    const amount = Number(order.totalAmount || 0);
    const statusRaw = (order.status || "").toUpperCase();

    const isPaid = statusRaw === "COMPLETED";
    const isPending = statusRaw === "PENDING" || statusRaw === "WAITING_FOR_CONFIRMATION";
    const isFailed = statusRaw === "CANCELED" || statusRaw === "REJECTED";
    const isExpired = false;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : "failed";

    return {
      isValid, provider: "payu", orderId: String(orderId), amount, status, isPaid, isPending, isFailed, isExpired,
      statusCode: statusRaw, rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "c", paymentName: "Credit / Debit Card", paymentImage: "https://payu.com/favicon.ico", totalFee: "1.5%+", category: "Kartu Kredit" },
      { paymentMethod: "blik", code: "blik", paymentName: "BLIK (Poland)", paymentImage: "https://payu.com/favicon.ico", totalFee: "Fixed fee", category: "E-Wallet" },
      { paymentMethod: "apple_pay", code: "ap", paymentName: "Apple Pay", paymentImage: "https://payu.com/favicon.ico", totalFee: "Card fee", category: "E-Wallet" },
      { paymentMethod: "google_pay", code: "gp", paymentName: "Google Pay", paymentImage: "https://payu.com/favicon.ico", totalFee: "Card fee", category: "E-Wallet" },
      { paymentMethod: "bank_transfer", code: "t", paymentName: "Online Bank Transfer (50+ banks)", paymentImage: "https://payu.com/favicon.ico", totalFee: "Fixed fee", category: "Virtual Account" },
      { paymentMethod: "installment", code: "ai", paymentName: "Installments (PayU)", paymentImage: "https://payu.com/favicon.ico", totalFee: "Bank rate", category: "Paylater / Cicilan" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "payu", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const baseUrl = this.getBaseUrl(config);

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (e: any) {
      return {
        success: false, provider: "payu", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "AUTH_ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }

    try {
      const response = await fetch(`${baseUrl}/api/v2_1/orders/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false, provider: "payu", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: "HTTP Error", rawResponse: data,
        };
      }

      const order = data.orders?.[0] || data;
      const statusRaw = (order.status || "").toUpperCase();
      const isPaid = statusRaw === "COMPLETED";
      const isPending = statusRaw === "PENDING" || statusRaw === "WAITING_FOR_CONFIRMATION";
      const isFailed = statusRaw === "CANCELED" || statusRaw === "REJECTED";
      const isExpired = false;
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : "failed";

      return {
        success: true, provider: "payu",
        orderId: order.extOrderId || merchantOrderId, reference: order.orderId || merchantOrderId,
        amount: Number(order.totalAmount || 0), statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired,
        statusMessage: statusRaw, transactionTime: order.orderCreateDate ? new Date(order.orderCreateDate) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "payu", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
