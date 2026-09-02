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
import { verifyCheckoutComWebhook } from "./signature";

export class CheckoutComProvider extends BasePaymentProvider {
  readonly name = "checkoutcom";

  private getBaseUrl(config: ProviderConfig): string {
    return config.sandbox !== false
      ? "https://api.sandbox.checkout.com"
      : "https://api.checkout.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const secretKey = config.apiKey || config.secretKey || "";
    const currency = (params.currency || "USD").toUpperCase();
    const baseUrl = this.getBaseUrl(config);
    const isDirect = !!params.paymentMethod;
    const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";

    try {
      if (isDirect) {
        // Direct Payments API
        const url = `${baseUrl}/payments`;
        const body: any = {
          amount,
          currency,
          reference: orderId,
          description: productDetails,
          customer: { email: customer?.email, name: customer?.name },
          success_url: successUrl,
          failure_url: successUrl,
          metadata: { order_id: orderId },
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers: { "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.error_codes) {
          return { success: false, provider: "checkoutcom", orderId, amount, rawResponse: data, error: (data?.error_codes || []).join(", ") || `HTTP ${response.status}` };
        }

        return {
          success: true,
          provider: "checkoutcom",
          orderId,
          amount: data.amount || amount,
          reference: data.id,
          paymentUrl: data._links?.redirect?.href,
          rawResponse: data,
        };
      } else {
        // Payment Links (Hosted Payment Page)
        const url = `${baseUrl}/payment-links`;
        const body: any = {
          amount,
          currency,
          reference: orderId,
          description: productDetails,
          customer: { email: customer?.email, name: customer?.name },
          return_url: successUrl,
          metadata: { order_id: orderId },
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers: { "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.error_codes) {
          return { success: false, provider: "checkoutcom", orderId, amount, rawResponse: data, error: (data?.error_codes || []).join(", ") || `HTTP ${response.status}` };
        }

        return {
          success: true,
          provider: "checkoutcom",
          orderId,
          amount,
          reference: data.id,
          paymentUrl: data._links?.redirect?.href || data.reference,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return { success: false, provider: "checkoutcom", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const webhookSecret = config.extra?.webhookSecret || config.secretKey || "";
    const signatureHeader = config.extra?.signatureHeader || "";
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

    const isValid = signatureHeader
      ? verifyCheckoutComWebhook(rawBody, signatureHeader, webhookSecret)
      : false;

    const eventType = parsedBody?.type || "";
    const data = parsedBody?.data || parsedBody;

    const orderId = data?.reference || data?.metadata?.order_id || data?.id || "";
    const amount = Number(data?.amount || 0);

    const isPaid = eventType === "payment_approved" || eventType === "payment_captured" || data?.approved === true;
    const isPending = eventType === "payment_pending" || eventType === "payment_voided";
    const isExpired = eventType === "payment_expired";
    const isFailed = eventType === "payment_declined" || eventType === "payment_capture_declined";

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending ? "pending" : isExpired ? "expired" : "failed";

    return {
      isValid,
      provider: "checkoutcom",
      orderId: String(orderId),
      amount,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: eventType,
      rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "card", paymentName: "Credit / Debit Card (Visa, Mastercard, Amex)", paymentImage: "https://checkout.com/favicon.ico", totalFee: "1.5% + $0.25", category: "Kartu Kredit" },
      { paymentMethod: "apple_pay", code: "applepay", paymentName: "Apple Pay", paymentImage: "https://checkout.com/favicon.ico", totalFee: "Card fee", category: "E-Wallet" },
      { paymentMethod: "google_pay", code: "googlepay", paymentName: "Google Pay", paymentImage: "https://checkout.com/favicon.ico", totalFee: "Card fee", category: "E-Wallet" },
      { paymentMethod: "paypal", code: "paypal", paymentName: "PayPal", paymentImage: "https://checkout.com/favicon.ico", totalFee: "Variable", category: "E-Wallet" },
      { paymentMethod: "klarna", code: "klarna", paymentName: "Klarna Pay Later", paymentImage: "https://checkout.com/favicon.ico", totalFee: "Variable", category: "Paylater / Cicilan" },
      { paymentMethod: "sofort", code: "sofort", paymentName: "Sofort / SEPA", paymentImage: "https://checkout.com/favicon.ico", totalFee: "0.8% + €0.25", category: "Virtual Account" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "checkoutcom", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const secretKey = config.apiKey || config.secretKey || "";
    const baseUrl = this.getBaseUrl(config);

    try {
      const response = await fetch(`${baseUrl}/payments/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${secretKey}`, "Content-Type": "application/json" },
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false, provider: "checkoutcom", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: "HTTP Error", rawResponse: data,
        };
      }

      const statusRaw = (data.status || "").toLowerCase();
      const isPaid = statusRaw === "authorized" || statusRaw === "captured";
      const isPending = statusRaw === "pending" || statusRaw === "card_verified";
      const isExpired = statusRaw === "expired" || statusRaw === "voided";
      const isFailed = statusRaw === "declined" || statusRaw === "failed";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      return {
        success: true, provider: "checkoutcom",
        orderId: data.reference || merchantOrderId, reference: data.id || merchantOrderId,
        amount: Number(data.amount || 0), statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired,
        statusMessage: statusRaw, paymentType: data.payment_type || "card",
        transactionTime: data.requested_on ? new Date(data.requested_on) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "checkoutcom", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
