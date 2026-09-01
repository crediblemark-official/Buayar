import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("iPaymu Provider & Client Integration", () => {
  it("should create direct VA invoice in iPaymu", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Message: "Success",
          Data: {
            SessionId: "ipaymu-session-123",
            TransactionId: 987654,
            PaymentNo: "0000001411234567",
            PaymentName: "BCA Virtual Account",
            Total: 100000,
            Fee: 3500,
            Expired: "2026-09-02 23:59:59",
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-IPAYMU-001",
        amount: 100000,
        paymentMethod: "bca_va",
        productDetails: "Top Up Game",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("ipaymu");
      expect(response.vaNumber).toBe("0000001411234567");
      expect(response.reference).toBe("987654");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should check balance via IpaymuClient", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Message: "Success",
          Data: {
            MerchantBalance: 25000000,
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });

      const ipaymuClient = buayar.getIpaymuClient();
      const balance = await ipaymuClient.checkBalance();
      expect(balance.success).toBe(true);
      expect(balance.balance).toBe(25000000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
