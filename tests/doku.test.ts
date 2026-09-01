import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("DOKU Provider & Client Integration", () => {
  it("should resolve DOKU config from environment variables", () => {
    process.env.PROVIDER_PG = "doku";
    process.env.DOKU_CLIENT_ID = "MALL-ID-123456";
    process.env.DOKU_SECRET_KEY = "SK-secret-key-789";
    process.env.DOKU_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("doku");
    expect(buayar.getConfig().apiKey).toBe("SK-secret-key-789");
    expect(buayar.getConfig().merchantCode).toBe("MALL-ID-123456");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should create direct VA invoice via DOKU Jokul v2 API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          order: {
            invoice_number: body.order.invoice_number,
            amount: body.order.amount,
          },
          virtual_account_info: {
            virtual_account_number: "88089988776655",
            how_to_pay_page: "https://sandbox.doku.com/how-to-pay/123",
            expired_date: "2026-09-02T12:00:00Z",
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123456",
        apiKey: "SK-secret-key-789",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-DOKU-001",
        amount: 175000,
        paymentMethod: "bca_va",
        productDetails: "Voucher Game",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("doku");
      expect(response.vaNumber).toBe("88089988776655");
      expect(response.vaBank).toBe("bca");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create redirect invoice via DOKU Jokul Checkout API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response: {
            order: {
              invoice_number: body.order.invoice_number,
              amount: body.order.amount,
            },
            payment: {
              url: "https://sandbox.doku.com/checkout/link/pay-123",
            },
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123456",
        apiKey: "SK-secret-key-789",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-DOKU-002",
        amount: 300000,
        productDetails: "Belanja Bulanan",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("doku");
      expect(response.paymentUrl).toBe("https://sandbox.doku.com/checkout/link/pay-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize DOKU webhook notification", async () => {
    const buayar = new Buayar({
      provider: "doku",
      merchantCode: "MALL-ID-123456",
      apiKey: "SK-secret-key-789",
      sandbox: true,
    });

    const dokuCallbackPayload = {
      service: {
        id: "VIRTUAL_ACCOUNT",
      },
      order: {
        invoice_number: "ORDER-DOKU-001",
        amount: 175000,
      },
      transaction: {
        status: "SUCCESS",
        date: "2026-09-01T12:00:00Z",
      },
    };

    const result = await buayar.verifyWebhook(dokuCallbackPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("doku");
    expect(result.orderId).toBe("ORDER-DOKU-001");
    expect(result.amount).toBe(175000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });
});
