import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Braintree Provider & Client Integration", () => {
  it("should resolve Braintree config from environment variables", () => {
    process.env.PROVIDER_PG = "braintree";
    process.env.BRAINTREE_MERCHANT_ID = "mockMerchantId123";
    process.env.BRAINTREE_PUBLIC_KEY = "mockPublicKey123";
    process.env.BRAINTREE_PRIVATE_KEY = "mockPrivateKey123";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("braintree");
    expect(buayar.getConfig().merchantCode).toBe("mockMerchantId123");
    expect(buayar.getConfig().clientKey).toBe("mockPublicKey123");
    expect(buayar.getConfig().apiKey).toBe("mockPrivateKey123");
  });

  it("should generate client token via Braintree (redirect/hosted flow)", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ clientToken: "mockClientTokenBase64AAAABBBBCCCC==" }),
    } as any);

    try {
      const buayar = new Buayar({
        provider: "braintree",
        merchantCode: "mockMerchantId",
        clientKey: "mockPublicKey",
        apiKey: "mockPrivateKey",
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-BT-001",
        amount: 2000,
        currency: "USD",
        productDetails: "SaaS Plan",
        customer: { name: "Budi", email: "budi@mail.com" },
        // No paymentMethod = hosted/Drop-in UI token flow
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("braintree");
      // paymentCode contains clientToken for Drop-in UI
      expect(response.paymentCode).toBe("mockClientTokenBase64AAAABBBBCCCC==");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should normalize Braintree webhook notification (transaction settled)", async () => {
    const buayar = new Buayar({ provider: "braintree", apiKey: "mockPrivateKey" });

    const payload = {
      kind: "transaction_settled",
      subject: {
        transaction: {
          id: "mockTransactionId",
          orderId: "ORDER-BT-001",
          amount: "20.00",
          status: "settled",
        },
      },
    };

    const result = await buayar.verifyWebhook(payload);
    expect(result.provider).toBe("braintree");
    expect(result.isPaid).toBe(true);
    expect(result.orderId).toBe("ORDER-BT-001");
    expect(result.amount).toBe(2000); // 20.00 * 100
  });
});
