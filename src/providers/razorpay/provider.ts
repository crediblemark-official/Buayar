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
import { buildRazorpayBasicAuth, verifyRazorpayWebhook } from "./signature";

export class RazorpayProvider extends BasePaymentProvider {
  readonly name = "razorpay";

  private getBaseUrl(): string {
    return "https://api.razorpay.com/v1";
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    const keyId = config.clientKey || config.merchantCode || config.merchantId || "";
    const keySecret = config.apiKey || config.secretKey || "";
    return {
      "Authorization": `Basic ${buildRazorpayBasicAuth(keyId, keySecret)}`,
      "Content-Type": "application/json",
    };
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const currency = (params.currency || "INR").toUpperCase();
    const baseUrl = this.getBaseUrl();
    const headers = this.buildHeaders(config);
    const isDirect = !!params.paymentMethod;

    try {
      if (isDirect) {
        // Create Order (client frontend completes payment with Razorpay checkout.js)
        const body = {
          amount,
          currency,
          receipt: orderId,
          notes: { order_id: orderId, product: productDetails },
          ...params.providerParams,
        };

        const response = await fetch(`${baseUrl}/orders`, {
          method: "POST", headers, body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.error) {
          return { success: false, provider: "razorpay", orderId, amount, rawResponse: data, error: data?.error?.description || `HTTP ${response.status}` };
        }

        return {
          success: true, provider: "razorpay", orderId, amount: data.amount || amount,
          reference: data.id, paymentCode: data.id, rawResponse: data,
        };
      } else {
        // Payment Link (Hosted checkout page)
        const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";
        const body: any = {
          amount,
          currency,
          description: productDetails,
          reference_id: orderId,
          customer: { name: customer?.name, email: customer?.email, contact: customer?.phone || "" },
          notify: { sms: false, email: !!customer?.email },
          reminder_enable: false,
          callback_url: callbackUrl || config.callbackUrl || successUrl,
          callback_method: "get",
          notes: { order_id: orderId },
          ...params.providerParams,
        };

        const response = await fetch(`${baseUrl}/payment_links`, {
          method: "POST", headers, body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.error) {
          return { success: false, provider: "razorpay", orderId, amount, rawResponse: data, error: data?.error?.description || `HTTP ${response.status}` };
        }

        return {
          success: true, provider: "razorpay", orderId, amount: data.amount || amount,
          reference: data.id, paymentUrl: data.short_url, rawResponse: data,
        };
      }
    } catch (e: any) {
      return { success: false, provider: "razorpay", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const webhookSecret = config.extra?.webhookSecret || config.secretKey || "";
    const signatureHeader = config.extra?.signatureHeader || "";
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

    const isValid = signatureHeader
      ? verifyRazorpayWebhook(rawBody, signatureHeader, webhookSecret)
      : true;

    const eventType = parsedBody?.event || "";
    const payload = parsedBody?.payload;
    const paymentEntity = payload?.payment?.entity || payload?.payment_link?.entity || parsedBody;

    const orderId = paymentEntity?.notes?.order_id || paymentEntity?.order_id || paymentEntity?.reference_id || paymentEntity?.id || "";
    const amount = Number(paymentEntity?.amount || 0);
    const statusRaw = (paymentEntity?.status || "").toLowerCase();

    const isPaid = eventType === "payment.captured" || eventType === "payment_link.paid" || statusRaw === "captured";
    const isPending = eventType === "payment.authorized" || statusRaw === "authorized" || statusRaw === "created";
    const isExpired = eventType === "payment_link.expired" || statusRaw === "expired";
    const isFailed = eventType === "payment.failed" || statusRaw === "failed";

    const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

    return {
      isValid, provider: "razorpay", orderId: String(orderId), amount, status, isPaid, isPending, isFailed, isExpired,
      statusCode: eventType || statusRaw, rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "card", paymentName: "Credit / Debit Card", paymentImage: "https://razorpay.com/favicon.ico", totalFee: "2% + GST", category: "Kartu Kredit" },
      { paymentMethod: "upi", code: "upi", paymentName: "UPI (GPay, PhonePe, Paytm)", paymentImage: "https://razorpay.com/favicon.ico", totalFee: "Free", category: "QRIS" },
      { paymentMethod: "netbanking", code: "netbanking", paymentName: "Net Banking (50+ banks)", paymentImage: "https://razorpay.com/favicon.ico", totalFee: "₹10", category: "Virtual Account" },
      { paymentMethod: "wallet", code: "wallet", paymentName: "Wallets (Paytm, PhonePe, etc.)", paymentImage: "https://razorpay.com/favicon.ico", totalFee: "Variable", category: "E-Wallet" },
      { paymentMethod: "emi", code: "emi", paymentName: "EMI (Card / Cardless)", paymentImage: "https://razorpay.com/favicon.ico", totalFee: "Bank charge", category: "Paylater / Cicilan" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "razorpay", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const baseUrl = this.getBaseUrl();
    const headers = this.buildHeaders(config);

    try {
      // Try as payment first, then payment link
      const endpoint = merchantOrderId.startsWith("plink_")
        ? `/payment_links/${encodeURIComponent(merchantOrderId)}`
        : `/payments/${encodeURIComponent(merchantOrderId)}`;

      const response = await fetch(`${baseUrl}${endpoint}`, { method: "GET", headers });
      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data || data.error) {
        return {
          success: false, provider: "razorpay", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: data?.error?.description || "HTTP Error", rawResponse: data,
        };
      }

      const statusRaw = (data.status || "").toLowerCase();
      const isPaid = statusRaw === "captured" || statusRaw === "paid";
      const isPending = statusRaw === "authorized" || statusRaw === "created";
      const isExpired = statusRaw === "expired";
      const isFailed = statusRaw === "failed";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      return {
        success: true, provider: "razorpay",
        orderId: data.notes?.order_id || data.reference_id || merchantOrderId,
        reference: data.id || merchantOrderId,
        amount: Number(data.amount || 0), statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired,
        statusMessage: statusRaw, paymentType: data.method || "card",
        transactionTime: data.created_at ? new Date(data.created_at * 1000) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "razorpay", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
