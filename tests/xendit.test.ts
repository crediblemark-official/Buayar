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

  it("should create direct VA invoice via Xendit Payments API v3 (endpoint, header, schema)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    let capturedUrl = "";
    let capturedHeaders: any = null;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      capturedBody = body;
      capturedUrl = String(url);
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: "pr-12345678",
          reference_id: body.reference_id,
          currency: "IDR",
          request_amount: body.request_amount,
          status: "REQUIRES_ACTION",
          channel_code: "BCA",
          channel_properties: {
            virtual_account_number: "88089912345678",
            expires_at: "2026-09-02T12:00:00.000Z",
          },
          actions: [{ type: "PRESENT_TO_CUSTOMER", value: "88089912345678", descriptor: "VIRTUAL_ACCOUNT_NUMBER" }],
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
      expect(response.amount).toBe(150000);

      // Payments API v3: endpoint + api-version header + top-level channel schema.
      expect(capturedUrl).toContain("/v3/payment_requests");
      expect(capturedHeaders["api-version"]).toBe("2024-11-11");
      expect(capturedBody.type).toBe("PAY");
      expect(capturedBody.request_amount).toBe(150000);
      // v3 memakai sufiks `_VIRTUAL_ACCOUNT` (diverifikasi live); `"BCA"` → API_VALIDATION_ERROR.
      expect(capturedBody.channel_code).toBe("BCA_VIRTUAL_ACCOUNT");
      expect(capturedBody.payment_method).toBeUndefined();
      expect(capturedBody.amount).toBeUndefined();
      // v3 VA mewajibkan `display_name` (bukan `customer_name`).
      expect(capturedBody.channel_properties.display_name).toBe("Budi");
      expect(capturedBody.channel_properties.customer_name).toBeUndefined();
      // Kami sengaja omit objek `customer` terstruktur (reference_id wajib alfanumerik,
      // orderId umumnya mengandung `-`); atribusi lewat `customer_id` bila tersedia.
      expect(capturedBody.customer).toBeUndefined();
      expect(capturedBody.customer_id).toBe("cust-12345");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should send failure_return_url on Xendit e-wallet channel_properties (X-2)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "pr-ewallet",
            reference_id: capturedBody.reference_id,
            request_amount: capturedBody.request_amount,
            status: "REQUIRES_ACTION",
            channel_code: "OVO",
            actions: [{ type: "REDIRECT_CUSTOMER", value: "https://checkout.xendit.co/ovo" }],
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({ provider: "xendit", apiKey: "xnd_development_test" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-XND-EW-1",
        amount: 50000,
        paymentMethod: "ovo",
        productDetails: "Topup OVO",
        customer: { name: "Budi", email: "budi@mail.com", phone: "08123456789" },
        returnUrl: "https://myapp.com/return",
      });

      expect(response.success).toBe(true);
      expect(capturedBody.channel_code).toBe("OVO");
      expect(capturedBody.channel_properties.success_return_url).toBe("https://myapp.com/return");
      expect(capturedBody.channel_properties.failure_return_url).toBe("https://myapp.com/return");
      // OVO v3 mewajibkan `account_mobile_number` (E.164).
      expect(capturedBody.channel_properties.account_mobile_number).toBe("+628123456789");
      expect(response.paymentUrl).toBe("https://checkout.xendit.co/ovo");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should use REUSABLE_PAYMENT_CODE + payer_name for retail outlets (alfamart/indomaret) on v3", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "pr-otc",
            reference_id: capturedBody.reference_id,
            request_amount: capturedBody.request_amount,
            status: "REQUIRES_ACTION",
            channel_code: "ALFAMART",
            actions: [{ type: "PRESENT_TO_CUSTOMER", value: "TESTABC123", descriptor: "PAYMENT_CODE" }],
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({ provider: "xendit", apiKey: "xnd_development_test" });
      const response = await buayar.createInvoice({
        orderId: "ORDER-XND-OTC-1",
        amount: 25000,
        paymentMethod: "alfamart",
        productDetails: "Voucher Game",
        customer: { name: "Budi Santoso", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.paymentCode).toBe("TESTABC123");
      expect(capturedBody.channel_code).toBe("ALFAMART");
      expect(capturedBody.type).toBe("REUSABLE_PAYMENT_CODE");
      expect(capturedBody.channel_properties.payer_name).toBe("Budi Santoso");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should keep legacy v2 channel schema when config.extra.xenditApiVersion = 'v2'", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    let capturedUrl = "";
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "pr-v2",
            status: "REQUIRES_ACTION",
            payment_method: {
              virtual_account: {
                channel_code: "BCA",
                channel_properties: { virtual_account_number: "88089900000001" },
              },
            },
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "xendit",
        apiKey: "xnd_development_test",
        extra: { xenditApiVersion: "v2" },
      });
      const response = await buayar.createInvoice({
        orderId: "ORDER-XND-V2-1",
        amount: 30000,
        paymentMethod: "bca_va",
        productDetails: "Legacy VA",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(capturedUrl).not.toContain("/v3/");
      expect(capturedBody.payment_method).toBeDefined();
      expect(capturedBody.payment_method.virtual_account.channel_code).toBe("BCA");
      expect(capturedBody.payment_method.virtual_account.channel_properties.customer_name).toBe("Budi");
      expect(capturedBody.channel_code).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create hosted checkout via Xendit Payment Sessions (legacy Invoice replacement)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: any = null;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            payment_session_id: "ps-67890",
            reference_id: capturedBody.reference_id,
            amount: capturedBody.amount,
            status: "ACTIVE",
            payment_link_url: "https://checkout.xendit.co/web/ps-67890",
            expires_at: "2026-09-02T12:00:00.000Z",
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
        customer: { name: "Budi Santoso", email: "budi@mail.com", phone: "081234567890" },
        returnUrl: "https://myapp.com/return",
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("xendit");
      expect(response.reference).toBe("ps-67890");
      expect(response.paymentUrl).toBe("https://checkout.xendit.co/web/ps-67890");

      // Endpoint Payment Sessions + skema PAYMENT_LINK, bukan /v2/invoices (legacy).
      expect(capturedUrl).toContain("/sessions");
      expect(capturedBody.session_type).toBe("PAY");
      expect(capturedBody.mode).toBe("PAYMENT_LINK");
      expect(capturedBody.external_id).toBeUndefined();
      // Nomor telepon lokal dinormalisasi ke E.164.
      expect(capturedBody.customer.mobile_number).toBe("+6281234567890");
      // reference_id pelanggan wajib alfanumerik.
      expect(capturedBody.customer.reference_id).toBe("ORDERXND002");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should fall back to legacy Invoice v2 when config.extra.xenditRedirect = 'invoice'", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "inv-67890",
            external_id: body.external_id,
            amount: body.amount,
            status: "PENDING",
            invoice_url: "https://checkout.xendit.co/web/inv-67890",
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "xendit",
        apiKey: "xnd_development_test",
        extra: { xenditRedirect: "invoice" },
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-XND-003",
        amount: 200000,
        productDetails: "Lisensi Software",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(capturedUrl).toContain("/v2/invoices");
      expect(response.paymentUrl).toBe("https://checkout.xendit.co/web/inv-67890");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should REJECT Xendit webhook without callback token (S2 security fix)", async () => {
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

    // Tanpa x-callback-token → isValid harus false (S2 fix)
    const result = await buayar.verifyWebhook(invoiceCallbackPayload);
    expect(result.isValid).toBe(false);
    expect(result.provider).toBe("xendit");
    expect(result.orderId).toBe("ORDER-XND-002");
    expect(result.amount).toBe(200000);
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

  it("should query dynamic payment channels via Xendit API (S7) and support probePaymentMethods (S8)", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any) => {
      if (url.includes("/payment_channels")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              channel_code: "BCA",
              display_name: "BCA Virtual Account",
              type: "BANK_TRANSFER",
              status: "ACTIVE",
              fee: 4000,
            },
            {
              channel_code: "OVO",
              display_name: "OVO E-Wallet",
              type: "EWALLET",
              status: "ACTIVE",
              fee: "1.5%",
            },
            {
              channel_code: "BNI",
              display_name: "BNI Virtual Account (Maintenance)",
              type: "BANK_TRANSFER",
              status: "INACTIVE", // Tidak boleh masuk
            },
          ],
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "xendit",
        apiKey: "xnd_development_test",
      });

      // S7: getPaymentMethods returns live channels from /payment_channels
      const res = await buayar.getPaymentMethods();
      expect(res.success).toBe(true);
      expect(res.methods.length).toBe(2);
      expect(res.methods[0].paymentMethod).toBe("bca_va");
      expect(res.methods[1].paymentMethod).toBe("ovo");

      // S8: probePaymentMethods returns active channels
      const probe = await buayar.probePaymentMethods();
      expect(probe.success).toBe(true);
      expect(probe.enabled).toEqual(["bca_va", "ovo"]);
      // Endpoint /payment_channels berhasil → sumber harus dilaporkan LIVE (X-8).
      expect((probe as any).source).toBe("live");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
