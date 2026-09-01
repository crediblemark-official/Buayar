import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Square Provider & Client Integration", () => {
  it("should resolve Square config from environment variables", () => {
    process.env.PROVIDER_PG = "square";
    process.env.SQUARE_ACCESS_TOKEN = "EAAAEMockToken1234";
    process.env.SQUARE_APPLICATION_ID = "sq0idp-mockAppId";
    process.env.SQUARE_LOCATION_ID = "LMockLocationId123";
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "mockSignatureKey";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("square");
    expect(buayar.getConfig().apiKey).toBe("EAAAEMockToken1234");
    expect(buayar.getConfig().clientKey).toBe("sq0idp-mockAppId");
    expect(buayar.getConfig().extra?.locationId).toBe("LMockLocationId123");
  });

  it("should create redirect invoice via Square Payment Links", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        payment_link: {
          id: "mockPaymentLinkId",
          url: "https://square.link/u/mockLink",
          version: 1,
          order_id: "mockOrderId",
        },
      }),
    } as any);

    try {
      const buayar = new Buayar({ provider: "square", apiKey: "EAAAEmock", extra: { locationId: "Lmock" } });
      const response = await buayar.createInvoice({
        orderId: "ORDER-SQ-001",
        amount: 2500,
        currency: "USD",
        productDetails: "Coffee & Bakery",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("square");
      expect(response.paymentUrl).toContain("square.link");
      expect(response.reference).toBe("mockPaymentLinkId");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should normalize Square webhook notification", async () => {
    const buayar = new Buayar({ provider: "square", apiKey: "EAAAEmock" });

    const payload = {
      type: "payment.completed",
      merchant_id: "mockMerchantId",
      data: {
        object: {
          payment: {
            id: "mockPaymentId",
            reference_id: "ORDER-SQ-001",
            amount_money: { amount: 2500, currency: "USD" },
            status: "COMPLETED",
          },
        },
      },
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.provider).toBe("square");
    expect(result.isPaid).toBe(true);
    expect(result.amount).toBe(2500);
  });
});
