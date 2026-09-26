import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import { verifyAdyenWebhook } from "../src/providers/adyen/signature";

describe("Adyen Provider & Client Integration", () => {
  it("should resolve Adyen config from environment variables", () => {
    process.env.PROVIDER_PG = "adyen";
    process.env.ADYEN_API_KEY = "AQEyhmfxK4CsKKY5mock";
    process.env.ADYEN_MERCHANT_ACCOUNT = "MyCompanyCOM";
    process.env.ADYEN_CLIENT_KEY = "test_XXXXYYYYZZZZ";
    process.env.ADYEN_HMAC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("adyen");
    expect(buayar.getConfig().apiKey).toBe("AQEyhmfxK4CsKKY5mock");
    expect(buayar.getConfig().merchantCode).toBe("MyCompanyCOM");
    expect(buayar.getConfig().extra?.hmacKey).toBe("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
  });

  it("should create redirect invoice via Adyen Sessions API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({
        id: "CS-mock-session-id",
        sessionData: "Ab02b4c0!BQABAgCm4e5xyz",
        url: "https://checkoutshopper-test.adyen.com/checkoutshopper/sessions/CS-mock",
      }),
    } as any);

    try {
      const buayar = new Buayar({ provider: "adyen", apiKey: "AQEymock", merchantCode: "TestMerchant" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-ADYEN-001",
        amount: 1000,
        currency: "EUR",
        productDetails: "Test Product",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("adyen");
      expect(response.paymentUrl).toContain("adyen.com");
      expect(response.reference).toBe("CS-mock-session-id");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Adyen webhook HMAC signature", () => {
    const hmacKey = "44DAC70D0210E570E301E2A99FC16B7B37F1B8EB9AC7F9E81002FF13975296D3";
    const notificationItem = {
      pspReference: "8535284862439990",
      originalReference: "",
      merchantAccountCode: "MyCompanyCOM",
      merchantReference: "ORDER-ADYEN-001",
      amount: { value: 1000, currency: "EUR" },
      eventCode: "AUTHORISATION",
      success: "true",
      additionalData: { hmacSignature: "invalid-for-test" },
    };

    const isValid = verifyAdyenWebhook(notificationItem, ""); // empty key = false
    expect(isValid).toBe(false);

    const isInvalidSig = verifyAdyenWebhook(notificationItem, hmacKey);
    expect(isInvalidSig).toBe(false);
  });

  it("should normalize Adyen webhook notification with valid HMAC", async () => {
    const hmacKey = "44DAC70D0210E570E301E2A99FC16B7B37F1B8EB9AC7F9E81002FF13975296D3";
    const signedData = "8535284862439990::MyCompanyCOM:ORDER-ADYEN-001:1000:EUR:AUTHORISATION:true";
    const validSignature = require("crypto")
      .createHmac("sha256", Buffer.from(hmacKey, "hex"))
      .update(signedData, "utf8")
      .digest("base64");

    const buayar = new Buayar({
      provider: "adyen",
      apiKey: "AQEymock",
      extra: { hmacKey },
    });

    const payload = {
      notificationItems: [{
        NotificationRequestItem: {
          pspReference: "8535284862439990",
          merchantReference: "ORDER-ADYEN-001",
          merchantAccountCode: "MyCompanyCOM",
          amount: { value: 1000, currency: "EUR" },
          eventCode: "AUTHORISATION",
          success: "true",
          additionalData: { hmacSignature: validSignature },
        },
      }],
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.provider).toBe("adyen");
    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.orderId).toBe("ORDER-ADYEN-001");
    expect(result.amount).toBe(1000);
  });

  it("should REJECT unauthenticated Adyen webhook (fail-closed)", async () => {
    const buayar = new Buayar({ provider: "adyen", apiKey: "AQEymock" });

    const payload = {
      notificationItems: [{
        NotificationRequestItem: {
          pspReference: "8535284862439990",
          merchantReference: "ORDER-ADYEN-001",
          merchantAccountCode: "MyCompanyCOM",
          amount: { value: 1000, currency: "EUR" },
          eventCode: "AUTHORISATION",
          success: "true",
        },
      }],
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.isValid).toBe(false);
    expect(result.isPaid).toBe(false);
    expect(result.status).toBe("failed");
  });
});
