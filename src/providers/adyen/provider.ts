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
import { verifyAdyenWebhook } from "./signature";

export class AdyenProvider extends BasePaymentProvider {
  readonly name = "adyen";

  private getBaseUrl(config: ProviderConfig): string {
    if (!config.sandbox) {
      const prefix = config.extra?.liveUrlPrefix || config.projectId || "";
      if (prefix) {
        return `https://${prefix}-checkout-live.adyenpayments.com/checkout`;
      }
    }
    return "https://checkout-test.adyen.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const apiKey = config.apiKey || config.secretKey || "";
    const merchantAccount = config.merchantCode || config.merchantId || config.extra?.merchantAccount || "";
    const currency = (params.currency || "USD").toUpperCase();
    const baseUrl = this.getBaseUrl(config);
    const isDirect = !!params.paymentMethod;

    const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";

    try {
      if (isDirect) {
        // Direct API: POST /v68/payments
        const url = `${baseUrl}/v68/payments`;
        const body: any = {
          merchantAccount,
          reference: orderId,
          amount: { value: amount, currency },
          returnUrl: successUrl,
          shopperEmail: customer?.email,
          shopperName: customer?.name ? { firstName: customer.name.split(" ")[0], lastName: customer.name.split(" ").slice(1).join(" ") || "-" } : undefined,
          shopperReference: customer?.email || orderId,
          additionalData: { allow3DS2: true },
          metadata: { order_id: orderId },
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.status >= 400) {
          return { success: false, provider: "adyen", orderId, amount, rawResponse: data, error: data?.message || `HTTP ${response.status}` };
        }

        const isPaid = data.resultCode === "Authorised";
        const isPending = data.resultCode === "Pending" || data.resultCode === "RedirectShopper" || data.resultCode === "IdentifyShopper" || data.resultCode === "ChallengeShopper";

        return {
          success: true,
          provider: "adyen",
          orderId,
          amount,
          reference: data.pspReference || data.merchantReference,
          paymentUrl: data.action?.url || data.redirect?.url || undefined,
          rawResponse: data,
        };
      } else {
        // Hosted Checkout Sessions: POST /v68/sessions
        const url = `${baseUrl}/v68/sessions`;
        const body: any = {
          merchantAccount,
          reference: orderId,
          amount: { value: amount, currency },
          returnUrl: successUrl,
          countryCode: config.extra?.countryCode || "US",
          shopperLocale: config.extra?.shopperLocale || "en-US",
          shopperEmail: customer?.email,
          shopperReference: customer?.email || orderId,
          metadata: { order_id: orderId },
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch (e) {}

        if (!response.ok || !data || data.status >= 400) {
          return { success: false, provider: "adyen", orderId, amount, rawResponse: data, error: data?.message || `HTTP ${response.status}` };
        }

        return {
          success: true,
          provider: "adyen",
          orderId,
          amount,
          reference: data.id,
          paymentUrl: data.url,
          paymentCode: data.sessionData,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return { success: false, provider: "adyen", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const hmacKey = config.extra?.hmacKey || config.secretKey || "";
    const notificationItems: any[] = body?.notificationItems || [body];
    const item = notificationItems[0]?.NotificationRequestItem || notificationItems[0] || body;

    const isValid = hmacKey ? verifyAdyenWebhook(item, hmacKey) : false;

    const eventCode = (item.eventCode || "").toUpperCase();
    const success = item.success === "true" || item.success === true;
    const orderId = item.merchantReference || item.pspReference || "";
    const amount = item.amount?.value ? Number(item.amount.value) : 0;

    const isPaid = eventCode === "AUTHORISATION" && success;
    const isPending = eventCode === "PENDING" || eventCode === "OFFER_CLOSED";
    const isExpired = eventCode === "EXPIRED" || eventCode === "CANCEL";
    const isFailed = !isPaid && !isPending && !isExpired && (!success || eventCode === "REFUSAL");

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending ? "pending" : isExpired ? "expired" : "failed";

    return {
      isValid,
      provider: "adyen",
      orderId: String(orderId),
      amount,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: eventCode,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      { paymentMethod: "credit_card", code: "scheme", paymentName: "Credit / Debit Card (Visa, Mastercard, Amex, JCB)", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "Interchange++", category: "Kartu Kredit" },
      { paymentMethod: "paypal", code: "paypal", paymentName: "PayPal", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "Variable", category: "E-Wallet" },
      { paymentMethod: "apple_pay", code: "applepay", paymentName: "Apple Pay", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "Card network fee", category: "E-Wallet" },
      { paymentMethod: "google_pay", code: "googlepay", paymentName: "Google Pay", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "Card network fee", category: "E-Wallet" },
      { paymentMethod: "klarna", code: "klarna", paymentName: "Klarna Pay Later", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "Variable", category: "Paylater / Cicilan" },
      { paymentMethod: "sepa", code: "sepadirectdebit", paymentName: "SEPA Direct Debit", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "Fixed fee", category: "Virtual Account" },
      { paymentMethod: "qris", code: "qris", paymentName: "QRIS (Indonesia)", paymentImage: "https://www.adyen.com/dam/jcr:8c86eab1-a18c-4bdb-8f3f-0832b0c0e3d5/adyen-logo.svg", totalFee: "0.7%", category: "QRIS" },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "adyen", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const apiKey = config.apiKey || config.secretKey || "";
    const merchantAccount = config.merchantCode || config.merchantId || "";

    // Adyen uses PSP reference for lookup
    const baseUrl = this.getBaseUrl(config);

    try {
      const response = await fetch(`${baseUrl}/v68/payments/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false, provider: "adyen", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: data?.message || "HTTP Error", error: data?.message, rawResponse: data,
        };
      }

      const resultCode = (data.resultCode || data.status || "").toUpperCase();
      const isPaid = resultCode === "AUTHORISED" || resultCode === "SETTLED";
      const isPending = resultCode === "PENDING" || resultCode === "RECEIVED" || resultCode === "REDIRECTSHOPPER";
      const isExpired = resultCode === "EXPIRED" || resultCode === "CANCELLED";
      const isFailed = !isPaid && !isPending && !isExpired;
      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      return {
        success: true, provider: "adyen",
        orderId: data.merchantReference || merchantOrderId,
        reference: data.pspReference || merchantOrderId,
        amount: data.amount?.value ? Number(data.amount.value) : 0,
        statusCode: resultCode, status, isPaid, isPending, isFailed, isExpired, statusMessage: resultCode, rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "adyen", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
