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

  it("should fetch dynamic payment methods via getPaymentMethods", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Status: 200,
          Success: true,
          Data: [
            {
              Code: "va",
              Name: "Virtual Account",
              Channels: [
                {
                  Code: "bag",
                  Name: "VA BAG",
                  TransactionFee: { ActualFee: 3500, ActualFeeType: "FLAT" },
                  HealthStatus: "online",
                  PaymentInstructionsDoc: "https://ipaymu.com/doc/bag.pdf",
                },
                {
                  Code: "bmi",
                  Name: "VA Muamalat",
                  TransactionFee: { ActualFee: 3500, ActualFeeType: "FLAT" },
                  HealthStatus: "online",
                },
              ],
            },
          ],
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

      const res = await buayar.getPaymentMethods();
      expect(res.success).toBe(true);
      expect(res.methods.length).toBe(2);
      expect(res.methods[0].code).toBe("bag_va");
      expect(res.methods[1].code).toBe("muamalat_va");
      expect(res.categories?.["Virtual Account"]?.length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should support getHistory and getBankList on IpaymuClient", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/history")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            Status: 200,
            Success: true,
            Data: {
              Transaction: [{ TransactionId: 12345, Amount: 50000 }],
              Pagination: { total: 1, current_page: 1 },
            },
          }),
        } as any;
      }
      if (urlStr.includes("/banklist")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            Status: 200,
            Success: true,
            Data: {
              bank: [{ code: "014", name: "BCA" }],
            },
          }),
        } as any;
      }
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      const client = buayar.getIpaymuClient();
      const history = await client.getHistory({ page: 1, limit: 10 });
      expect(history.Status).toBe(200);
      expect(history.Data.Transaction.length).toBe(1);

      const bankList = await client.getBankList();
      expect(bankList.Status).toBe(200);
      expect(bankList.Data.bank[0].code).toBe("014");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should include feeDirection and escrow in createInvoice payload", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Success: true,
          Data: {
            TransactionId: 111,
            PaymentNo: "381180001",
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      await buayar.createInvoice({
        orderId: "ORDER-FEES",
        amount: 50000,
        paymentMethod: "bca_va",
        productDetails: "Produk",
        customer: { name: "Budi", email: "budi@mail.com" },
        feeDirection: "BUYER",
        escrow: true,
      });

      expect(capturedBody.feeDirection).toBe("BUYER");
      expect(capturedBody.escrow).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
