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
import { toStripePaymentMethod } from "../../core/canonical";
import { serializeStripeParams, verifyStripeWebhook } from "./signature";

export class StripeProvider extends BasePaymentProvider {
  readonly name = "stripe";

  private getBaseUrl() {
    return "https://api.stripe.com/v1";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";

    const integerAmount = Math.round(amount);
    const stripeMethod = toStripePaymentMethod(params.paymentMethod);
    const isDirect = !!params.paymentMethod;

    const baseUrl = this.getBaseUrl();
    const headers = {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    try {
      if (isDirect) {
        // Mode Direct (Payment Intent)
        const url = `${baseUrl}/payment_intents`;
        const payload = {
          amount: integerAmount,
          currency: (params.currency || "idr").toLowerCase(),
          description: productDetails,
          receipt_email: customer?.email,
          payment_method_types: [stripeMethod || "card"],
          metadata: {
            order_id: orderId,
            customer_name: customer?.name,
          },
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: serializeStripeParams(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok || !data || data.error) {
          return {
            success: false,
            provider: "stripe",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.error?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          provider: "stripe",
          orderId,
          amount: data.amount ? Number(data.amount) : integerAmount,
          reference: data.id,
          paymentCode: data.client_secret,
          rawResponse: data,
        };
      } else {
        // Mode Hosted Checkout (Checkout Session)
        const url = `${baseUrl}/checkout/sessions`;
        const successUrl = returnUrl || config.returnUrl || "https://example.com/payment/success";
        const cancelUrl = returnUrl || config.returnUrl || "https://example.com/payment/cancel";

        const payload = {
          mode: "payment",
          client_reference_id: orderId,
          customer_email: customer?.email,
          line_items: [
            {
              price_data: {
                currency: (params.currency || "idr").toLowerCase(),
                product_data: {
                  name: productDetails,
                },
                unit_amount: integerAmount,
              },
              quantity: 1,
            },
          ],
          metadata: {
            order_id: orderId,
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: serializeStripeParams(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok || !data || data.error) {
          return {
            success: false,
            provider: "stripe",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.error?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          provider: "stripe",
          orderId: data.client_reference_id || orderId,
          amount: data.amount_total ? Number(data.amount_total) : integerAmount,
          reference: data.id,
          paymentUrl: data.url,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "stripe",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Stripe API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const webhookSecret = config.extra?.webhookSecret || config.secretKey || "";
    const signatureHeader = config.extra?.signatureHeader || "";

    const isValid = verifyStripeWebhook(body, signatureHeader, webhookSecret);

    const eventType = body.type || "";
    const obj = body.data?.object || body;

    const orderId = obj.metadata?.order_id || obj.client_reference_id || obj.id || "";
    const amount = obj.amount_total || obj.amount || 0;
    const paymentStatus = (obj.payment_status || obj.status || "").toLowerCase();

    const isPaid =
      (eventType === "checkout.session.completed" && (paymentStatus === "paid" || paymentStatus === "complete")) ||
      (eventType === "payment_intent.succeeded" && paymentStatus === "succeeded") ||
      (eventType === "charge.succeeded" && (paymentStatus === "succeeded" || paymentStatus === "paid")) ||
      paymentStatus === "paid" ||
      paymentStatus === "succeeded";

    const isPending = paymentStatus === "unpaid" || paymentStatus === "processing" || paymentStatus === "requires_action";
    const isExpired = paymentStatus === "expired" || eventType === "checkout.session.expired";
    const isFailed = !isPaid && !isPending && !isExpired;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";

    return {
      isValid,
      provider: "stripe",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: eventType || paymentStatus,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (Visa, Mastercard, JCB, Amex)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS (Indonesia)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account (Bank Transfer)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account (Bank Transfer)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account (Bank Transfer)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account (Bank Transfer)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account (Bank Transfer)",
        paymentImage: "https://stripe.com/img/v3/home/social.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
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
      provider: "stripe",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const baseUrl = this.getBaseUrl();

    let endpoint = `/checkout/sessions/${encodeURIComponent(merchantOrderId)}`;
    if (merchantOrderId.startsWith("pi_")) {
      endpoint = `/payment_intents/${encodeURIComponent(merchantOrderId)}`;
    }

    const url = `${baseUrl}${endpoint}`;
    const headers = {
      "Authorization": `Bearer ${secretKey}`,
      "Accept": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data || data.error) {
        return {
          success: false,
          provider: "stripe",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.error?.message || `HTTP error! Status: ${response.status}`,
          error: data?.error?.message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const paymentStatus = (data.payment_status || data.status || "").toLowerCase();
      const isPaid = paymentStatus === "paid" || paymentStatus === "succeeded" || paymentStatus === "complete";
      const isPending = paymentStatus === "unpaid" || paymentStatus === "processing" || paymentStatus === "requires_action";
      const isExpired = paymentStatus === "expired";
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
        provider: "stripe",
        orderId: data.metadata?.order_id || data.client_reference_id || data.id || merchantOrderId,
        reference: data.id || "",
        amount: data.amount_total ? Number(data.amount_total) : data.amount ? Number(data.amount) : 0,
        statusCode: paymentStatus,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: paymentStatus,
        paymentType: data.payment_method_types?.[0] || "card",
        transactionTime: data.created ? new Date(data.created * 1000) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "stripe",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Stripe",
        error: e.message || "Failed to check transaction status in Stripe",
        rawResponse: null,
      };
    }
  }
}
