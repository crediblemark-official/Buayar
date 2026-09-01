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
import { verifySquareWebhook } from "./signature";

export class SquareProvider extends BasePaymentProvider {
  readonly name = "square";

  private getBaseUrl(config: ProviderConfig): string {
    return config.sandbox !== false
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    return {
      "Authorization": `Bearer ${config.apiKey || config.secretKey || ""}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-01-17",
    };
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const currency = (params.currency || "USD").toUpperCase();
    const locationId = config.extra?.locationId || config.projectId || "";
    const baseUrl = this.getBaseUrl(config);
    const headers = this.buildHeaders(config);
    const isDirect = !!params.paymentMethod;
    const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";

    try {
      if (isDirect) {
        // Create Payment (requires sourceId/nonce from frontend Square Web Payments SDK)
        const sourceId = params.providerParams?.sourceId || params.providerParams?.nonce || "cnon:card-nonce-ok";
        const body: any = {
          idempotency_key: orderId,
          source_id: sourceId,
          amount_money: { amount, currency },
          reference_id: orderId,
          note: productDetails,
          buyer_email_address: customer?.email,
          ...params.providerParams,
        };

        const response = await fetch(`${baseUrl}/v2/payments`, {
          method: "POST", headers, body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.errors?.length) {
          return { success: false, provider: "square", orderId, amount, rawResponse: data, error: data?.errors?.[0]?.detail || `HTTP ${response.status}` };
        }

        const payment = data.payment || data;
        return {
          success: true, provider: "square", orderId, amount: payment.amount_money?.amount || amount,
          reference: payment.id, rawResponse: data,
        };
      } else {
        // Square Checkout (Hosted Payment Page)
        const body: any = {
          idempotency_key: orderId,
          order: {
            location_id: locationId,
            reference_id: orderId,
            line_items: [
              {
                name: productDetails,
                quantity: "1",
                base_price_money: { amount, currency },
              },
            ],
          },
          checkout_options: {
            redirect_url: successUrl,
            ask_for_shipping_address: false,
          },
          pre_populated_data: {
            buyer_email: customer?.email,
          },
          ...params.providerParams,
        };

        const response = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
          method: "POST", headers, body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.errors?.length) {
          return { success: false, provider: "square", orderId, amount, rawResponse: data, error: data?.errors?.[0]?.detail || `HTTP ${response.status}` };
        }

        const link = data.payment_link || data;
        return {
          success: true, provider: "square", orderId, amount,
          reference: link.id, paymentUrl: link.url, rawResponse: data,
        };
      }
    } catch (e: any) {
      return { success: false, provider: "square", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const signatureKey = config.extra?.webhookSignatureKey || config.secretKey || "";
    const signatureHeader = config.extra?.signatureHeader || "";
    const notificationUrl = config.callbackUrl || config.extra?.notificationUrl || "";
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

    const isValid = signatureHeader
      ? verifySquareWebhook(rawBody, signatureHeader, signatureKey, notificationUrl)
      : true;

    const eventType = parsedBody?.type || "";
    const data = parsedBody?.data?.object || parsedBody?.data || parsedBody;
    const payment = data?.payment || data;

    const orderId = payment?.reference_id || payment?.order_id || payment?.id || "";
    const amount = Number(payment?.amount_money?.amount || 0);
    const statusRaw = (payment?.status || "").toUpperCase();

    const isPaid = statusRaw === "COMPLETED" || eventType === "payment.completed";
    const isPending = statusRaw === "PENDING" || statusRaw === "APPROVED";
    const isFailed = statusRaw === "FAILED" || statusRaw === "CANCELED";
    const isExpired = eventType === "payment.expired";

    const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

    return {
      isValid, provider: "square", orderId: String(orderId), amount, status, isPaid, isPending, isFailed, isExpired,
      statusCode: eventType || statusRaw, rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "card", paymentName: "Credit / Debit Card (Visa, Mastercard, Amex, JCB)", paymentImage: "https://squareup.com/favicon.ico", totalFee: "2.9% + $0.30", category: "Kartu Kredit" },
      { paymentMethod: "apple_pay", code: "applepay", paymentName: "Apple Pay", paymentImage: "https://squareup.com/favicon.ico", totalFee: "2.9% + $0.30", category: "E-Wallet" },
      { paymentMethod: "google_pay", code: "googlepay", paymentName: "Google Pay", paymentImage: "https://squareup.com/favicon.ico", totalFee: "2.9% + $0.30", category: "E-Wallet" },
      { paymentMethod: "cash_app", code: "cashapp", paymentName: "Cash App Pay", paymentImage: "https://squareup.com/favicon.ico", totalFee: "2.9% + $0.30", category: "E-Wallet" },
      { paymentMethod: "afterpay", code: "afterpay", paymentName: "Afterpay / Clearpay", paymentImage: "https://squareup.com/favicon.ico", totalFee: "6% + $0.30", category: "Paylater / Cicilan" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "square", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const baseUrl = this.getBaseUrl(config);
    const headers = this.buildHeaders(config);

    try {
      const response = await fetch(`${baseUrl}/v2/payments/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET", headers,
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data || data.errors?.length) {
        return {
          success: false, provider: "square", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: data?.errors?.[0]?.detail || "HTTP Error", rawResponse: data,
        };
      }

      const payment = data.payment || data;
      const statusRaw = (payment.status || "").toUpperCase();
      const isPaid = statusRaw === "COMPLETED";
      const isPending = statusRaw === "PENDING" || statusRaw === "APPROVED";
      const isExpired = statusRaw === "CANCELED";
      const isFailed = statusRaw === "FAILED";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      return {
        success: true, provider: "square",
        orderId: payment.reference_id || merchantOrderId, reference: payment.id || merchantOrderId,
        amount: Number(payment.amount_money?.amount || 0), statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired,
        statusMessage: statusRaw, paymentType: payment.source_type || "card",
        transactionTime: payment.created_at ? new Date(payment.created_at) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "square", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
