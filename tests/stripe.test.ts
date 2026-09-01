import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Stripe Provider & Client Integration", () => {
  it("should resolve Stripe config from environment variables", () => {
    process.env.PROVIDER_PG = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_51MockStripeKey12345";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_mockWebhookSecret123";
    process.env.STRIPE_PUBLIC_KEY = "pk_test_51MockPublishableKey";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("stripe");
    expect(buayar.getConfig().apiKey).toBe("sk_test_51MockStripeKey12345");
    expect(buayar.getConfig().clientKey).toBe("pk_test_51MockPublishableKey");
    expect(buayar.getConfig().extra?.webhookSecret).toBe("whsec_mockWebhookSecret123");
  });

  it("should create redirect invoice via Stripe Checkout Session", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: "cs_test_a1b2c3d4e5",
          object: "checkout.session",
          client_reference_id: "ORDER-STRIPE-001",
          amount_total: 150000,
          url: "https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5",
          payment_status: "unpaid",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "stripe",
        apiKey: "sk_test_51MockStripeKey12345",
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-STRIPE-001",
        amount: 150000,
        productDetails: "Kursus TypeScript Expert",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("stripe");
      expect(response.paymentUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4e5");
      expect(response.reference).toBe("cs_test_a1b2c3d4e5");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create direct payment code via Stripe Payment Intent", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
          object: "payment_intent",
          amount: 250000,
          client_secret: "pi_3MtwBwLkdIwHu7ix28a3tqPa_secret_YrKJ",
          status: "requires_payment_method",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "stripe",
        apiKey: "sk_test_51MockStripeKey12345",
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-STRIPE-002",
        amount: 250000,
        paymentMethod: "credit_card",
        productDetails: "Langganan Premium Pro",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("stripe");
      expect(response.reference).toBe("pi_3MtwBwLkdIwHu7ix28a3tqPa");
      expect(response.paymentCode).toBe("pi_3MtwBwLkdIwHu7ix28a3tqPa_secret_YrKJ");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Stripe webhook notification", async () => {
    const webhookSecret = "whsec_mockSecret123";
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const payload = {
      id: "evt_1MtwBwLkdIwHu7ix28a3tqPa",
      object: "event",
      api_version: "2023-10-16",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_a1b2c3d4e5",
          object: "checkout.session",
          client_reference_id: "ORDER-STRIPE-001",
          amount_total: 150000,
          payment_status: "paid",
          metadata: { order_id: "ORDER-STRIPE-001" },
        },
      },
    };

    const crypto = await import("crypto");
    const payloadString = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${payloadString}`).digest("hex");
    const sigHeader = `t=${timestamp},v1=${signature}`;

    const buayar = new Buayar({
      provider: "stripe",
      apiKey: "sk_test_51MockStripeKey12345",
      extra: {
        webhookSecret,
      },
    });

    const result = await buayar.verifyWebhook(payload, {
      "stripe-signature": sigHeader,
    });

    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("stripe");
    expect(result.orderId).toBe("ORDER-STRIPE-001");
    expect(result.amount).toBe(150000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });
});
