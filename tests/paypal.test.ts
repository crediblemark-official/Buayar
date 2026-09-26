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

  it("should normalize PayPal webhook notification when PayPal confirms the signature", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "A-mockToken" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/v1/notifications/verify-webhook-signature")) {
        return new Response(JSON.stringify({ verification_status: "SUCCESS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as any;

    try {
      const buayar = new Buayar({
        provider: "paypal",
        apiKey: "EMmockSecret",
        clientKey: "mock-client-id",
        extra: { webhookId: "WH-MOCK-ID" },
      });

      const payload = {
        id: "WH-mockEvent",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP-mockCapture",
          status: "COMPLETED",
          purchase_units: [{ reference_id: "ORDER-PAYPAL-001", amount: { value: "15.00", currency_code: "USD" } }],
        },
      };

      const result = await buayar.verifyWebhook(payload, {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.paypal.com/cert.pem",
        "paypal-transmission-id": "trans-id-1",
        "paypal-transmission-sig": "sig-1",
        "paypal-transmission-time": "2026-06-18T12:00:00Z",
      });

      expect(result.provider).toBe("paypal");
      expect(result.isValid).toBe(true);
      expect(result.isPaid).toBe(true);
      expect(result.status).toBe("paid");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // SECURITY: payload COMPLETED tanpa header verifikasi PayPal = tidak ada bukti apa pun.
  // Dulu isValid di-hardcode true; sekarang harus fail-closed.
  it("should REJECT a PayPal webhook with no verification headers (fail-closed)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as any;
    try {
      const buayar = new Buayar({ provider: "paypal", apiKey: "EMmockSecret" });
      const result = await buayar.verifyWebhook({
        id: "WH-forged",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "CAP-forged", status: "COMPLETED", reference_id: "ORDER-FORGED" },
      });
      expect(result.isValid).toBe(false);
      expect(result.isPaid).toBe(false);
      expect(result.status).toBe("failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should REJECT a PayPal webhook that PayPal's verify API refuses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => {
      const u = String(url);
      if (u.includes("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "A-mockToken" }), { status: 200 });
      }
      if (u.includes("/v1/notifications/verify-webhook-signature")) {
        return new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as any;

    try {
      const buayar = new Buayar({
        provider: "paypal",
        apiKey: "EMmockSecret",
        clientKey: "mock-client-id",
        extra: { webhookId: "WH-MOCK-ID" },
      });
      const result = await buayar.verifyWebhook(
        { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { status: "COMPLETED", reference_id: "ORDER-FORGED-3" } },
        {
          "paypal-auth-algo": "SHA256withRSA",
          "paypal-cert-url": "https://api.paypal.com/cert.pem",
          "paypal-transmission-id": "trans-id-2",
          "paypal-transmission-sig": "bad-sig",
          "paypal-transmission-time": "2026-06-18T12:00:00Z",
        }
      );
      expect(result.isValid).toBe(false);
      expect(result.isPaid).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
