import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import { createHash } from "crypto";

describe("2Checkout / Verifone Provider & Client Integration", () => {
  it("should resolve 2Checkout config from environment variables", () => {
    process.env.PROVIDER_PG = "twocheckout";
    process.env.TWOCHECKOUT_MERCHANT_CODE = "MOCKMERCH";
    process.env.TWOCHECKOUT_SECRET_KEY = "mockSecretKey123";
    process.env.TWOCHECKOUT_SECRET_WORD = "mockSecretWord";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("twocheckout");
    expect(buayar.getConfig().merchantCode).toBe("MOCKMERCH");
    expect(buayar.getConfig().apiKey).toBe("mockSecretKey123");
    expect(buayar.getConfig().extra?.secretWord).toBe("mockSecretWord");
  });

  it("should create redirect invoice via 2Checkout Orders API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        RefNo: "123456789",
        ExternalReference: "ORDER-2CO-001",
        Status: "PENDING",
        GrossAmount: 29.99,
        Currency: "USD",
        PaymentDetails: {
          PaymentMethod: {
            RedirectURL: "https://secure.sandbox.2checkout.com/checkout/pay/123456789",
          },
        },
      }),
    } as any);

    try {
      const buayar = new Buayar({ provider: "twocheckout", merchantCode: "MOCKMERCH", apiKey: "mockSecret" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-2CO-001",
        amount: 2999,
        currency: "USD",
        productDetails: "Annual License",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("twocheckout");
      expect(response.paymentUrl).toContain("2checkout.com");
      expect(response.reference).toBe("123456789");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize 2Checkout IPN/webhook notification", async () => {
    const secretWord = "mockSecretWord";
    const saleId = "9003693785";
    const productId = "4903129";
    const invoiceId = "12345";

    const rawHash = secretWord + saleId + productId + invoiceId;
    const hash = createHash("md5").update(rawHash).digest("hex").toUpperCase();

    const buayar = new Buayar({ provider: "twocheckout", merchantCode: "MOCKMERCH", apiKey: "mockSecret", extra: { secretWord } });

    const payload = {
      HASH: hash,
      REFNOEXT: "ORDER-2CO-001",
      SALE_ID: saleId,
      IPN_PID: [productId],
      IPN_PNAME: [invoiceId],
      ORDERSTATUS: "COMPLETE",
      IPN_TOTAL_GENERAL: "29.99",
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.provider).toBe("twocheckout");
    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.orderId).toBe("ORDER-2CO-001");
    expect(result.amount).toBe(2999); // 29.99 * 100
  });
});
