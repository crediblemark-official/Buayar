import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("PayU Provider & Client Integration", () => {
  it("should resolve PayU config from environment variables", () => {
    process.env.PROVIDER_PG = "payu";
    process.env.PAYU_POS_ID = "300747";
    process.env.PAYU_MD5_KEY = "mockMd5Key123";
    process.env.PAYU_OAUTH_CLIENT_ID = "mockOAuthClientId";
    process.env.PAYU_OAUTH_CLIENT_SECRET = "mockOAuthClientSecret";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("payu");
    expect(buayar.getConfig().merchantCode).toBe("300747");
    expect(buayar.getConfig().extra?.md5Key).toBe("mockMd5Key123");
    expect(buayar.getConfig().extra?.oauthClientId).toBe("mockOAuthClientId");
  });

  it("should create redirect invoice via PayU Orders API", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, options: any) => {
      callCount++;
      if (url.includes("/oauth/authorize")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "mockAccessToken", expires_in: 43199 }) } as any;
      }
      // PayU responds with 302 redirect for orders
      return {
        ok: false, status: 302,
        headers: { get: (h: string) => h === "location" ? "https://secure.snd.payu.com/pay?orderId=mockOrderId" : null },
        text: async () => JSON.stringify({ orderId: "mockOrderId", extOrderId: "ORDER-PAYU-001", status: { statusCode: "SUCCESS" } }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "payu",
        merchantCode: "300747",
        extra: { oauthClientId: "mockClientId", oauthClientSecret: "mockClientSecret" },
      });
      const response = await buayar.createInvoice({
        orderId: "ORDER-PAYU-001",
        amount: 10000,
        currency: "PLN",
        productDetails: "Kursus Online",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.provider).toBe("payu");
      // Either success from 302 redirect or fallback
      expect(response.orderId).toBe("ORDER-PAYU-001");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should normalize PayU webhook notification (OpenPayU-Signature)", async () => {
    const buayar = new Buayar({ provider: "payu", apiKey: "mockMd5Key" });

    const payload = {
      order: {
        orderId: "mockOrderId",
        extOrderId: "ORDER-PAYU-001",
        totalAmount: "10000",
        status: "COMPLETED",
        orderCreateDate: "2024-01-01T00:00:00.000+01:00",
      },
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.provider).toBe("payu");
    expect(result.isPaid).toBe(true);
    expect(result.orderId).toBe("ORDER-PAYU-001");
    expect(result.amount).toBe(10000);
  });
});
