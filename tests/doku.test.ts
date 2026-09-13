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

  it("should REJECT DOKU webhook without signature headers (S1 security fix)", async () => {
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

    // Tanpa signature header → isValid harus false (S1 fix)
    const result = await buayar.verifyWebhook(dokuCallbackPayload);
    expect(result.isValid).toBe(false);
    expect(result.provider).toBe("doku");
    expect(result.orderId).toBe("ORDER-DOKU-001");
    expect(result.amount).toBe(175000);
  });

  it("should update virtual account via DOKU API", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedMethod = "";
    let interceptedUrl = "";
    let interceptedBody: any = null;

    (globalThis as any).fetch = async (url: any, options: any) => {
      interceptedUrl = String(url);
      interceptedMethod = options.method;
      interceptedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          order: {
            invoice_number: interceptedBody.order.invoice_number,
            amount: interceptedBody.order.amount,
          },
          virtual_account_info: {
            virtual_account_number: "880812345678",
            expired_date: "2026-09-15T12:00:00Z",
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123",
        apiKey: "SK-secret-123",
        sandbox: true,
      });

      const res = await buayar.updateVirtualAccount({
        orderId: "INV-UPDATE-001",
        bank: "bca",
        vaNumber: "880812345678",
        amount: 200000,
        expiredTime: 120,
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe("doku");
      expect(res.orderId).toBe("INV-UPDATE-001");
      expect(res.vaNumber).toBe("880812345678");
      expect(interceptedMethod).toBe("PUT");
      expect(interceptedUrl).toContain("/bca-virtual-account/v2/payment-code");
      expect(interceptedBody.order.amount).toBe(200000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should delete virtual account via DOKU API", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedMethod = "";
    let interceptedUrl = "";

    (globalThis as any).fetch = async (url: any, options: any) => {
      interceptedUrl = String(url);
      interceptedMethod = options.method;

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: "CANCELLED",
          message: "Virtual account successfully deleted",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123",
        apiKey: "SK-secret-123",
        sandbox: true,
      });

      const res = await buayar.deleteVirtualAccount({
        orderId: "INV-DEL-001",
        bank: "bca",
        vaNumber: "880812345678",
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe("doku");
      expect(res.orderId).toBe("INV-DEL-001");
      expect(interceptedMethod).toBe("DELETE");
      expect(interceptedUrl).toContain("/bca-virtual-account/v2/payment-code/INV-DEL-001");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should validate bank account via DOKU Account Inquiry", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = "";
    let interceptedBody: any = null;

    (globalThis as any).fetch = async (url: any, options: any) => {
      interceptedUrl = String(url);
      interceptedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          beneficiary_name: "Budi Santoso",
          beneficiary_bank_code: interceptedBody.beneficiary_bank_code,
          beneficiary_account_number: interceptedBody.beneficiary_account_number,
          status: "SUCCESS",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123",
        apiKey: "SK-secret-123",
        sandbox: true,
      });

      const res = await buayar.validateBankAccount({
        bankCode: "BCA",
        accountNumber: "1234567890",
      });

      expect(res.success).toBe(true);
      expect(res.provider).toBe("doku");
      expect(res.accountHolderName).toBe("Budi Santoso");
      expect(interceptedUrl).toContain("/kirim-doku/v1/account-inquiry");
      expect(interceptedBody.beneficiary_bank_code).toBe("BCA");
      expect(interceptedBody.beneficiary_account_number).toBe("1234567890");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should disburse funds and check payout status via DokuClient", async () => {
    const originalFetch = globalThis.fetch;
    const calls: { url: string; method: string; body?: any }[] = [];

    (globalThis as any).fetch = async (url: any, options: any) => {
      calls.push({
        url: String(url),
        method: options.method,
        body: options.body ? JSON.parse(options.body) : undefined,
      });

      if (options.method === "POST") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: "SUCCESS",
            partner_reference_no: "TRX-PAYOUT-001",
            amount: { value: 500000, currency: "IDR" },
          }),
        } as any;
      } else {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: "SETTLED",
            partner_reference_no: "TRX-PAYOUT-001",
          }),
        } as any;
      }
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123",
        apiKey: "SK-secret-123",
        sandbox: true,
      });

      const client = buayar.getDokuClient();

      const disburseRes = await client.disburse({
        externalId: "TRX-PAYOUT-001",
        bankCode: "BNI",
        accountNumber: "9876543210",
        accountHolderName: "Siti Aminah",
        amount: 500000,
        description: "Bonus tahunan",
      });

      expect(disburseRes.status).toBe("SUCCESS");
      expect(disburseRes.partner_reference_no).toBe("TRX-PAYOUT-001");
      expect(calls[0].url).toContain("/kirim-doku/v1/transfer");
      expect(calls[0].body.amount.value).toBe(500000);

      const statusRes = await client.checkPayoutStatus("TRX-PAYOUT-001");
      expect(statusRes.status).toBe("SETTLED");
      expect(calls[1].url).toContain("/kirim-doku/v1/transfer/status/TRX-PAYOUT-001");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
