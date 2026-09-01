import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import { createHmac } from "crypto";

describe("Razorpay Provider & Client Integration", () => {
  it("should resolve Razorpay config from environment variables", () => {
    process.env.PROVIDER_PG = "razorpay";
    process.env.RAZORPAY_KEY_ID = "rzp_test_mockKeyId123";
    process.env.RAZORPAY_KEY_SECRET = "mockKeySecret123";
    process.env.RAZORPAY_WEBHOOK_SECRET = "mockWebhookSecret";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("razorpay");
    expect(buayar.getConfig().clientKey).toBe("rzp_test_mockKeyId123");
    expect(buayar.getConfig().apiKey).toBe("mockKeySecret123");
  });

  it("should create redirect invoice via Razorpay Payment Links", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        id: "plink_mockId123",
        reference_id: "ORDER-RZP-001",
        amount: 50000,
        currency: "INR",
        short_url: "https://rzp.io/i/mockLink",
        status: "created",
      }),
    } as any);

    try {
      const buayar = new Buayar({ provider: "razorpay", clientKey: "rzp_test_mock", apiKey: "mockSecret" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-RZP-001",
        amount: 50000,
        currency: "INR",
        productDetails: "Online Course",
        customer: { name: "Budi", email: "budi@mail.com", phone: "+628123456789" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("razorpay");
      expect(response.paymentUrl).toContain("rzp.io");
      expect(response.reference).toBe("plink_mockId123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Razorpay webhook notification", async () => {
    const secret = "mockWebhookSecret";
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_mockPaymentId",
            order_id: "order_mockOrderId",
            amount: 50000,
            currency: "INR",
            status: "captured",
            notes: { order_id: "ORDER-RZP-001" },
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const buayar = new Buayar({ provider: "razorpay", apiKey: "mockSecret", extra: { webhookSecret: secret } });
    const result = await buayar.verifyWebhook(payload, { "x-razorpay-signature": signature });

    expect(result.provider).toBe("razorpay");
    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.orderId).toBe("ORDER-RZP-001");
  });
});
