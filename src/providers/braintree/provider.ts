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
import { buildBraintreeBasicAuth, verifyBraintreeWebhook } from "./signature";

export class BraintreeProvider extends BasePaymentProvider {
  readonly name = "braintree";

  private getBaseUrl(config: ProviderConfig): string {
    const merchantId = config.merchantCode || config.merchantId || "";
    const base = config.sandbox !== false
      ? "https://api.sandbox.braintreegateway.com"
      : "https://api.braintreegateway.com";
    return `${base}/merchants/${merchantId}`;
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    const publicKey = config.clientKey || config.extra?.publicKey || "";
    const privateKey = config.apiKey || config.secretKey || "";
    return {
      "Authorization": `Basic ${buildBraintreeBasicAuth(publicKey, privateKey)}`,
      "Content-Type": "application/json",
      "Braintree-Version": "2019-01-01",
    };
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer } = params;
    const currency = (params.currency || "USD").toUpperCase();
    const baseUrl = this.getBaseUrl(config);
    const headers = this.buildHeaders(config);
    const isDirect = !!params.paymentMethod;

    try {
      if (isDirect) {
        // Direct transaction using payment method nonce from frontend Drop-in UI
        const paymentMethodNonce = params.providerParams?.nonce || params.providerParams?.paymentMethodNonce || "fake-valid-nonce";
        const body = {
          transaction: {
            amount: (amount / 100).toFixed(2),
            payment_method_nonce: paymentMethodNonce,
            order_id: orderId,
            currency_iso_code: currency,
            options: { submit_for_settlement: true },
            customer: { first_name: customer?.name, email: customer?.email },
            custom_fields: { order_id: orderId },
            ...params.providerParams,
          },
        };

        const response = await fetch(`${baseUrl}/transactions`, {
          method: "POST", headers, body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || data?.apiErrorResponse) {
          return { success: false, provider: "braintree", orderId, amount, rawResponse: data, error: data?.apiErrorResponse?.message || `HTTP ${response.status}` };
        }

        const tx = data?.transaction || data;
        const statusRaw = (tx.status || "").toLowerCase();
        return {
          success: statusRaw === "submitted_for_settlement" || statusRaw === "settling" || statusRaw === "settled",
          provider: "braintree", orderId, amount: Math.round(Number(tx.amount || amount / 100) * 100),
          reference: tx.id, rawResponse: data,
        };
      } else {
        // Client Token generation for Drop-in UI (redirect flow)
        const body = { client_token: { customer_id: customer?.email || orderId } };

        const response = await fetch(`${baseUrl}/client_token`, {
          method: "POST", headers, body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data?.clientToken) {
          return { success: false, provider: "braintree", orderId, amount, rawResponse: data, error: data?.message || `HTTP ${response.status}` };
        }

        return {
          success: true, provider: "braintree", orderId, amount,
          reference: orderId,
          paymentCode: data.clientToken, // Frontend uses this token for Drop-in UI
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return { success: false, provider: "braintree", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const privateKey = config.apiKey || config.secretKey || "";
    const btSignature = config.extra?.btSignature || "";
    const btPayload = config.extra?.btPayload || "";

    const isValid = btSignature && btPayload
      ? verifyBraintreeWebhook(btSignature, btPayload, privateKey)
      : false;

    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
    const subject = parsedBody?.subject || parsedBody;
    const transaction = subject?.transaction || subject?.disbursement || parsedBody;
    const kind = parsedBody?.kind || parsedBody?.event || "";

    const orderId = transaction?.orderId || transaction?.order_id || transaction?.id || "";
    const amount = Math.round(Number(transaction?.amount || 0) * 100);
    const statusRaw = (transaction?.status || "").toLowerCase();

    const isPaid = kind === "transaction_settled" || kind === "transaction_disbursed" || statusRaw === "settled";
    const isPending = kind === "transaction_settlement_declined" || statusRaw === "submitted_for_settlement" || statusRaw === "settling";
    const isFailed = kind === "transaction_failed" || statusRaw === "failed" || statusRaw === "voided";
    const isExpired = statusRaw === "expired";

    const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

    return {
      isValid, provider: "braintree", orderId: String(orderId), amount, status, isPaid, isPending, isFailed, isExpired,
      statusCode: kind || statusRaw, rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "CreditCard", paymentName: "Credit / Debit Card (Drop-in UI)", paymentImage: "https://www.braintreepayments.com/favicon.ico", totalFee: "2.59% + $0.49", category: "Kartu Kredit" },
      { paymentMethod: "paypal", code: "PayPalAccount", paymentName: "PayPal (via Drop-in UI)", paymentImage: "https://www.braintreepayments.com/favicon.ico", totalFee: "3.49% + fixed", category: "E-Wallet" },
      { paymentMethod: "apple_pay", code: "ApplePayCard", paymentName: "Apple Pay", paymentImage: "https://www.braintreepayments.com/favicon.ico", totalFee: "Card network fee", category: "E-Wallet" },
      { paymentMethod: "google_pay", code: "AndroidPayCard", paymentName: "Google Pay", paymentImage: "https://www.braintreepayments.com/favicon.ico", totalFee: "Card network fee", category: "E-Wallet" },
      { paymentMethod: "venmo", code: "VenmoAccount", paymentName: "Venmo (US only)", paymentImage: "https://www.braintreepayments.com/favicon.ico", totalFee: "1.9% + $0.10", category: "E-Wallet" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "braintree", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const baseUrl = this.getBaseUrl(config);
    const headers = this.buildHeaders(config);

    try {
      const response = await fetch(`${baseUrl}/transactions/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET", headers,
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false, provider: "braintree", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: "HTTP Error", rawResponse: data,
        };
      }

      const tx = data.transaction || data;
      const statusRaw = (tx.status || "").toLowerCase();
      const isPaid = statusRaw === "settled" || statusRaw === "settling";
      const isPending = statusRaw === "submitted_for_settlement" || statusRaw === "authorized";
      const isExpired = statusRaw === "expired";
      const isFailed = statusRaw === "failed" || statusRaw === "voided";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      return {
        success: true, provider: "braintree",
        orderId: tx.orderId || merchantOrderId, reference: tx.id || merchantOrderId,
        amount: Math.round(Number(tx.amount || 0) * 100), statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired,
        statusMessage: statusRaw, paymentType: tx.paymentInstrumentType || "card",
        transactionTime: tx.createdAt ? new Date(tx.createdAt) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "braintree", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
