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
import { buildPaypalBasicAuth } from "./signature";
import { httpFetch } from "../../utils/http";

export class PaypalProvider extends BasePaymentProvider {
  readonly name = "paypal";

  private getSandbox(config: ProviderConfig): boolean {
    return config.sandbox !== false;
  }

  private getBaseUrl(config: ProviderConfig): string {
    return this.getSandbox(config)
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";
  }

  /** OAuth2 Client Credentials — dapatkan access token */
  private async getAccessToken(config: ProviderConfig): Promise<string> {
    const clientId = config.clientKey || config.merchantCode || config.merchantId || "";
    const clientSecret = config.apiKey || config.secretKey || "";
    const auth = buildPaypalBasicAuth(clientId, clientSecret);
    const baseUrl = this.getBaseUrl(config);

    const response = await httpFetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const text = await response.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch (e) {}

    if (!response.ok || !data?.access_token) {
      throw new Error(data?.error_description || `Failed to get PayPal access token: ${response.status}`);
    }

    return data.access_token;
  }

  /**
   * Verifikasi webhook via PayPal Webhook Verification API (cert-chain nyata).
   * Fail-closed: tanpa kredensial, tanpa webhook id, atau tanpa header wajib
   * → return false (JANGAN pernah fallback ke "assume valid").
   */
  private async verifyWebhookSignature(
    body: any,
    headers: Record<string, string | string[] | undefined>,
    config: ProviderConfig
  ): Promise<{ valid: boolean; error?: string }> {
    const h = (name: string): string => {
      const v = headers[name];
      return Array.isArray(v) ? v[0] || "" : v || "";
    };

    const authAlgo = h("paypal-auth-algo");
    const certUrl = h("paypal-cert-url");
    const transmissionId = h("paypal-transmission-id");
    const transmissionSig = h("paypal-transmission-sig");
    const transmissionTime = h("paypal-transmission-time");
    const webhookId = h("paypal-webhook-id") || config.extra?.webhookId || config.extra?.paypalWebhookId || "";

    const missing = [
      ["paypal-auth-algo", authAlgo],
      ["paypal-cert-url", certUrl],
      ["paypal-transmission-id", transmissionId],
      ["paypal-transmission-sig", transmissionSig],
      ["paypal-transmission-time", transmissionTime],
    ]
      .filter(([, val]) => !val)
      .map(([name]) => name as string);

    if (missing.length > 0) {
      return { valid: false, error: `Missing PayPal verification header(s): ${missing.join(", ")}.` };
    }
    if (!webhookId) {
      return {
        valid: false,
        error: "PayPal webhook id not configured. Set PAYPAL_WEBHOOK_ID (or config.extra.webhookId) to the id of the webhook registered in your PayPal dashboard.",
      };
    }

    if (config.simulate) {
      if (!transmissionSig || transmissionSig.includes("invalid")) {
        return { valid: false, error: "Invalid simulated PayPal transmission signature" };
      }
      return { valid: true };
    }

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (e: any) {
      return { valid: false, error: `Could not authenticate against PayPal: ${e.message}` };
    }

    try {
      const response = await httpFetch(`${this.getBaseUrl(config)}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: typeof body === "string" ? JSON.parse(body) : body,
        }),
      });
      const data = await response.json().catch(() => null);
      if (data?.verification_status === "SUCCESS") return { valid: true };
      return {
        valid: false,
        error: `PayPal rejected the webhook signature (verification_status=${data?.verification_status ?? response.status}).`,
      };
    } catch (e: any) {
      return { valid: false, error: `PayPal verification request failed: ${e.message}` };
    }
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const currency = (params.currency || "USD").toUpperCase();

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (e: any) {
      return { success: false, provider: "paypal", orderId, amount, error: e.message, rawResponse: null };
    }

    const baseUrl = this.getBaseUrl(config);
    const amountFormatted = (amount / 100).toFixed(2); // PayPal uses decimal (e.g. "15.00")
    const isDirect = !!params.paymentMethod;

    const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";
    const cancelUrl = returnUrl || config.returnUrl || "https://example.com/payment/cancel";

    const body: any = {
      intent: isDirect ? "CAPTURE" : "CAPTURE",
      purchase_units: [
        {
          reference_id: orderId,
          description: productDetails,
          amount: {
            currency_code: currency,
            value: amountFormatted,
          },
        },
      ],
      application_context: {
        return_url: successUrl,
        cancel_url: cancelUrl,
        brand_name: productDetails,
        user_action: "PAY_NOW",
      },
    };

    if (isDirect) {
      // Capture immediately (auto-capture flow)
      body.application_context.shipping_preference = "NO_SHIPPING";
    }

    if (callbackUrl || config.callbackUrl) {
      // PayPal uses webhooks configured in dashboard, not per-order
    }

    try {
      const response = await httpFetch(`${baseUrl}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": orderId,
          "Prefer": "return=representation",
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data || data.name) {
        return {
          success: false,
          provider: "paypal",
          orderId,
          amount,
          rawResponse: data,
          error: data?.message || `HTTP error! Status: ${response.status}`,
        };
      }

      // Find approve link
      const approveLink = data.links?.find((l: any) => l.rel === "approve" || l.rel === "payer-action");
      const paymentUrl = approveLink?.href || "";

      return {
        success: true,
        provider: "paypal",
        orderId,
        amount,
        reference: data.id,
        paymentUrl,
        rawResponse: data,
      };
    } catch (e: any) {
      return { success: false, provider: "paypal", orderId, amount, error: e.message, rawResponse: null };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const headers = config.extra?.headers || {};
    const { valid: isValid, error } = await this.verifyWebhookSignature(body, headers, config);

    const eventType = body?.event_type || body?.event_name || "";
    const resource = body?.resource || {};

    const orderId =
      resource.reference_id ||
      resource.purchase_units?.[0]?.reference_id ||
      resource.supplementary_data?.related_ids?.order_id ||
      resource.id ||
      "";
    const amount =
      Number(resource.amount?.value || resource.purchase_units?.[0]?.amount?.value || 0) * 100; // Convert back to integer

    const statusRaw = (resource.status || "").toUpperCase();
    // Status hanya dipercaya bila signature PayPal sudah diverifikasi.
    const isPaid = isValid && (statusRaw === "COMPLETED" || eventType === "PAYMENT.CAPTURE.COMPLETED");
    const isPending = isValid && (statusRaw === "PENDING" || eventType === "PAYMENT.CAPTURE.PENDING");
    const isExpired = isValid && (statusRaw === "EXPIRED" || eventType === "CHECKOUT.ORDER.EXPIRED");
    const isFailed =
      !isValid ||
      (!isPaid && !isPending && !isExpired &&
        (statusRaw === "DENIED" || statusRaw === "FAILED" || eventType.includes("FAILED") || eventType.includes("DENIED")));

    const status: "paid" | "pending" | "failed" | "expired" = !isValid
      ? "failed"
      : isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

    return {
      isValid,
      provider: "paypal",
      orderId: String(orderId),
      amount,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: eventType,
      rawPayload: body,
      error,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const methods: PaymentMethod[] = [
      {
        paymentMethod: "credit_card",
        code: "card",
        paymentName: "Credit / Debit Card (Visa, Mastercard, Amex)",
        paymentImage: "https://www.paypalobjects.com/webstatic/icon/pp258.png",
        totalFee: "3.49% + fixed fee",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "paypal",
        code: "paypal",
        paymentName: "PayPal Balance / PayPal Checkout",
        paymentImage: "https://www.paypalobjects.com/webstatic/icon/pp258.png",
        totalFee: "3.49% + fixed fee",
        category: "E-Wallet",
      },
      {
        paymentMethod: "paylater",
        code: "pay_later",
        paymentName: "PayPal Pay Later / Buy Now Pay Later",
        paymentImage: "https://www.paypalobjects.com/webstatic/icon/pp258.png",
        totalFee: "3.49% + fixed fee",
        category: "Paylater / Cicilan",
      },
    ];

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of methods) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }

    return { success: true, provider: "paypal", methods, categories, rawResponse: methods };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(config);
    } catch (e: any) {
      return {
        success: false, provider: "paypal", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "AUTH_ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }

    const baseUrl = this.getBaseUrl(config);

    try {
      const response = await httpFetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch (e) {}

      if (!response.ok || !data || data.name) {
        return {
          success: false, provider: "paypal", orderId: merchantOrderId, reference: "", amount: 0,
          statusCode: response.status.toString(), status: "failed", isPaid: false, isPending: false,
          isFailed: true, isExpired: false, statusMessage: data?.message || "HTTP Error", error: data?.message, rawResponse: data,
        };
      }

      const statusRaw = (data.status || "").toUpperCase();
      const isPaid = statusRaw === "COMPLETED";
      const isPending = statusRaw === "PENDING" || statusRaw === "APPROVED" || statusRaw === "CREATED";
      const isExpired = statusRaw === "VOIDED";
      const isFailed = !isPaid && !isPending && !isExpired;

      const status: "paid" | "pending" | "failed" | "expired" = isPaid ? "paid" : isPending ? "pending" : isExpired ? "expired" : "failed";

      const amountValue =
        Number(data.purchase_units?.[0]?.amount?.value || 0) * 100; // Convert to integer cents

      return {
        success: true, provider: "paypal",
        orderId: data.purchase_units?.[0]?.reference_id || merchantOrderId,
        reference: data.id || merchantOrderId, amount: amountValue,
        statusCode: statusRaw, status, isPaid, isPending, isFailed, isExpired, statusMessage: statusRaw,
        transactionTime: data.create_time ? new Date(data.create_time) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false, provider: "paypal", orderId: merchantOrderId, reference: "", amount: 0,
        statusCode: "ERROR", status: "failed", isPaid: false, isPending: false, isFailed: true,
        isExpired: false, statusMessage: e.message, error: e.message, rawResponse: null,
      };
    }
  }
}
