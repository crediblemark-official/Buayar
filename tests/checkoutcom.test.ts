import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import { createHmac } from "crypto";

describe("Checkout.com Provider & Client Integration", () => {
  it("should resolve Checkout.com config from environment variables", () => {
    process.env.PROVIDER_PG = "checkoutcom";
    process.env.CHECKOUTCOM_SECRET_KEY = "sk_test_mockSecretKey123";
    process.env.CHECKOUTCOM_PUBLIC_KEY = "pk_test_mockPublicKey123";
    process.env.CHECKOUTCOM_WEBHOOK_SECRET = "mockWebhookSecret123";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("checkoutcom");
    expect(buayar.getConfig().apiKey).toBe("sk_test_mockSecretKey123");
    expect(buayar.getConfig().clientKey).toBe("pk_test_mockPublicKey123");
  });

  it("should create redirect invoice via Checkout.com Payment Links", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true, status: 201,
      text: async () => JSON.stringify({
        id: "pl_mockPaymentLinkId",
        reference: "ORDER-CKO-001",
        expires_on: "2027-01-01T00:00:00Z",
        _links: { redirect: { href: "https://pay.checkout.com/pages/pl_mockPaymentLinkId" } },
      }),
    } as any);

    try {
      const buayar = new Buayar({ provider: "checkoutcom", apiKey: "sk_test_mock" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-CKO-001",
        amount: 5000,
        currency: "GBP",
        productDetails: "Premium Plan",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("checkoutcom");
      expect(response.paymentUrl).toContain("checkout.com");
      expect(response.reference).toBe("pl_mockPaymentLinkId");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Checkout.com webhook notification", async () => {
    const secret = "mockWebhookSecret123";
    const payload = {
      type: "payment_captured",
      data: {
        id: "pay_mockPaymentId",
        reference: "ORDER-CKO-001",
        amount: 5000,
        currency: "GBP",
        approved: true,
        _links: {},
      },
    };

    const rawBody = JSON.stringify(payload);
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const buayar = new Buayar({
      provider: "checkoutcom",
      apiKey: "sk_test_mock",
      extra: { webhookSecret: secret },
    });

    const result = await buayar.verifyWebhook(payload, { "cko-signature": `sha256=${signature}` });
    expect(result.provider).toBe("checkoutcom");
    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.status).toBe("paid");
  });
});
