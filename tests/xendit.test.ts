import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Xendit Provider & Client Integration", () => {
  it("should resolve Xendit config from environment variables", () => {
    process.env.PROVIDER_PG = "xendit";
    process.env.XENDIT_SECRET_KEY = "xnd_development_secret123";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("xendit");
    expect(buayar.getConfig().apiKey).toBe("xnd_development_secret123");
  });

  it("should create direct VA invoice via Xendit Payment Requests API", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      capturedBody = body;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: "pr-12345678",
          reference_id: body.reference_id,
          currency: "IDR",
          amount: body.amount,
          status: "PENDING",
          payment_method: {
            type: "VIRTUAL_ACCOUNT",
            channel_code: "BCA",
            channel_properties: {
              virtual_account_number: "88089912345678",
              expires_at: "2026-09-02T12:00:00.000Z",
            },
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "xendit",
        apiKey: "xnd_development_test",
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-XND-001",
        amount: 150000,
        paymentMethod: "bca_va",
        productDetails: "Kursus Online",
        customer: { name: "Budi", email: "budi@mail.com" },
        providerParams: { customer_id: "cust-12345" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("xendit");
      expect(response.vaNumber).toBe("88089912345678");
      expect(response.vaBank).toBe("bca");
      expect(response.reference).toBe("pr-12345678");

      // Payment Requests API rejects the inline `customer` object; it must be
      // omitted and any customer attribution must come via `customer_id`.
      expect(capturedBody).toBeDefined();
      expect(capturedBody.customer).toBeUndefined();
      expect(capturedBody.customer_id).toBe("cust-12345");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create redirect invoice via Xendit Invoice v2 API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: "inv-67890",
          external_id: body.external_id,
          amount: body.amount,
          status: "PENDING",
          invoice_url: "https://checkout.xendit.co/web/inv-67890",
          expiry_date: "2026-09-02T12:00:00.000Z",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "xendit",
        apiKey: "xnd_development_test",
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-XND-002",
        amount: 200000,
        productDetails: "Lisensi Software",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("xendit");
      expect(response.paymentUrl).toBe("https://checkout.xendit.co/web/inv-67890");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Xendit webhook notification", async () => {
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_development_test",
    });

    const invoiceCallbackPayload = {
      id: "inv-67890",
      external_id: "ORDER-XND-002",
      status: "PAID",
      paid_amount: 200000,
      payment_method: "BANK_TRANSFER",
      payment_channel: "BCA",
      paid_at: "2026-09-01T12:30:00.000Z",
    };

    const result = await buayar.verifyWebhook(invoiceCallbackPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("xendit");
    expect(result.orderId).toBe("ORDER-XND-002");
    expect(result.amount).toBe(200000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });

  it("should check merchant balance via XenditClient", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          balance: 35000000,
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "xendit",
        apiKey: "xnd_development_test",
      });

      const xenditClient = buayar.getXenditClient();
      const balance = await xenditClient.checkBalance();
      expect(balance.success).toBe(true);
      expect(balance.balance).toBe(35000000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
