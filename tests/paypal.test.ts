import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("PayPal Provider & Client Integration", () => {
  it("should resolve PayPal config from environment variables", () => {
    process.env.PROVIDER_PG = "paypal";
    process.env.PAYPAL_CLIENT_ID = "AXmockClientId12345";
    process.env.PAYPAL_CLIENT_SECRET = "EMmockClientSecret12345";
    process.env.PAYPAL_WEBHOOK_ID = "WH-mockWebhookId";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("paypal");
    expect(buayar.getConfig().clientKey).toBe("AXmockClientId12345");
    expect(buayar.getConfig().apiKey).toBe("EMmockClientSecret12345");
    expect(buayar.getConfig().extra?.webhookId).toBe("WH-mockWebhookId");
  });

  it("should create redirect invoice via PayPal Orders API v2", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) => {
      callCount++;
      if (url.includes("/oauth2/token")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "A21AAMockToken", expires_in: 32400 }) } as any;
      }
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          id: "5O190127TN364715T",
          status: "CREATED",
          links: [
            { href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T", rel: "self" },
            { href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", rel: "approve" },
          ],
          purchase_units: [{ reference_id: "ORDER-PAYPAL-001", amount: { currency_code: "USD", value: "15.00" } }],
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({ provider: "paypal", clientKey: "AXmockClientId", apiKey: "EMmockClientSecret" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-PAYPAL-001",
        amount: 1500,
        currency: "USD",
        productDetails: "Premium Subscription",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("paypal");
      expect(response.paymentUrl).toContain("sandbox.paypal.com");
      expect(response.reference).toBe("5O190127TN364715T");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should normalize PayPal webhook notification", async () => {
    const buayar = new Buayar({ provider: "paypal", apiKey: "EMmockSecret" });

    const payload = {
      id: "WH-mockEvent",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAP-mockCapture",
        status: "COMPLETED",
        purchase_units: [{ reference_id: "ORDER-PAYPAL-001", amount: { value: "15.00", currency_code: "USD" } }],
      },
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.provider).toBe("paypal");
    expect(result.isPaid).toBe(true);
    expect(result.status).toBe("paid");
  });
});
