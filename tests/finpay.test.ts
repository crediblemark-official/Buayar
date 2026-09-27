import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import { generateFinpaySignature, verifyFinpaySignature } from "../src/providers/finpay/signature";
import { FinpayProvider, normalizeFinpayPhone, mapFinpayStatus } from "../src/providers/finpay/provider";
import { toFinpayPaymentMethod } from "../src/core/canonical";

const MERCHANT_ID = "FINPAY-MCH-001";
const MERCHANT_KEY = "finpay-secret-key-12345";

describe("Finpay Provider & Client Integration", () => {
  it("should resolve Finpay config from environment variables", () => {
    process.env.PROVIDER_PG = "finpay";
    process.env.FINPAY_MERCHANT_ID = MERCHANT_ID;
    process.env.FINPAY_MERCHANT_KEY = MERCHANT_KEY;
    process.env.FINPAY_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("finpay");
    expect(buayar.getConfig().apiKey).toBe(MERCHANT_KEY);
    expect(buayar.getConfig().merchantCode).toBe(MERCHANT_ID);
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("maps canonical methods to official sourceOfFunds SOF IDs", () => {
    expect(toFinpayPaymentMethod("bca_va")).toBe("vabca");
    expect(toFinpayPaymentMethod("mandiri_va")).toBe("vamandiri");
    expect(toFinpayPaymentMethod("bni_va")).toBe("vabni");
    expect(toFinpayPaymentMethod("indomaret")).toBe("idm");
    expect(toFinpayPaymentMethod("credit_card")).toBe("cc");
    expect(toFinpayPaymentMethod("qris")).toBe("qris");
  });

  it("creates a Virtual Account invoice with Basic auth and nested payload", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            responseCode: "2000000",
            responseMessage: "Success",
            paymentCode: "8802700000076850",
            redirecturl: "https://devo.finpay.id/widgetpg/pending/5613",
            expiryLink: "2026-09-27 09:56:35",
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: MERCHANT_ID,
        apiKey: MERCHANT_KEY,
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-FINPAY-001",
        amount: 275000,
        paymentMethod: "bca_va",
        productDetails: "Langganan Internet",
        customer: { name: "Budi Santoso", email: "budi@mail.com", phone: "+628123" },
      });

      // Base URL & endpoint resmi (development).
      expect(capturedUrl).toBe("https://devo.finnet.co.id/pg/payment/card/initiate");
      // Basic auth: base64(merchantId:merchantKey).
      const expectedAuth = "Basic " + Buffer.from(`${MERCHANT_ID}:${MERCHANT_KEY}`).toString("base64");
      expect(capturedHeaders.Authorization).toBe(expectedAuth);
      // Body bersarang resmi.
      expect(capturedBody.order).toMatchObject({
        id: "ORDER-FINPAY-001",
        amount: "275000",
        description: "Langganan Internet",
      });
      expect(capturedBody.order.item).toEqual([
        {
          name: "Langganan Internet",
          description: "Langganan Internet",
          category: "General",
          quantity: "1",
          unitPrice: "275000",
        },
      ]);
      expect(capturedBody.customer.firstName).toBe("Budi");
      expect(capturedBody.customer.lastName).toBe("Santoso");
      expect(capturedBody.sourceOfFunds).toEqual({ type: "vabca" });
      // Tidak ada field warisan yang salah.
      expect(capturedBody.merchant_id).toBeUndefined();
      expect(capturedBody.signature).toBeUndefined();

      expect(response.success).toBe(true);
      expect(response.provider).toBe("finpay");
      expect(response.vaNumber).toBe("8802700000076850");
      expect(response.vaBank).toBe("bca");
      expect(response.mode).toBe("va");
      expect(response.paymentUrl).toBe("https://devo.finpay.id/widgetpg/pending/5613");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes Indonesian phone numbers to E.164 (verified live)", () => {
    expect(normalizeFinpayPhone("081234567890")).toBe("+6281234567890");
    expect(normalizeFinpayPhone("81234567890")).toBe("+6281234567890");
    expect(normalizeFinpayPhone("6281234567890")).toBe("+6281234567890");
    expect(normalizeFinpayPhone("+62 812-3456-7890")).toBe("+6281234567890");
    expect(normalizeFinpayPhone("")).toBeUndefined();
    expect(normalizeFinpayPhone(undefined)).toBeUndefined();
  });

  it("always sends order.item and E.164 phone; OVO gets sourceOfFunds.accountId", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: any[] = [];
    (globalThis as any).fetch = async (_url: any, options: any) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ responseCode: "2000000" }) } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: MERCHANT_ID,
        apiKey: MERCHANT_KEY,
        sandbox: true,
      });

      await buayar.createInvoice({
        orderId: "ORDER-DANA",
        amount: 15000,
        paymentMethod: "dana",
        productDetails: "Topup DANA",
        customer: { name: "Budi", email: "budi@mail.com", phone: "0812 3456 7890" },
      });
      await buayar.createInvoice({
        orderId: "ORDER-OVO",
        amount: 20000,
        paymentMethod: "ovo",
        productDetails: "Topup OVO",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
      });

      // order.item wajib untuk DANA/LinkAja; fallback 1 item = amount + category.
      expect(bodies[0].order.item).toEqual([
        {
          name: "Topup DANA",
          description: "Topup DANA",
          category: "General",
          quantity: "1",
          unitPrice: "15000",
        },
      ]);
      expect(bodies[0].customer.mobilePhone).toBe("+6281234567890");
      // OVO butuh accountId format lokal 0… (contoh dokumen resmi).
      expect(bodies[1].sourceOfFunds).toEqual({ type: "ovo", accountId: "081234567890" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates a hosted-payment redirect invoice without sourceOfFunds", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            responseCode: "2000000",
            responseMessage: "Success",
            redirecturl: "https://devo.finpay.id/pg/payment/card/v2/access/abc",
            expiryLink: "2026-09-27 14:55:24",
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: MERCHANT_ID,
        apiKey: MERCHANT_KEY,
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-FINPAY-002",
        amount: 450000,
        productDetails: "Paket Hosting Bisnis",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(capturedBody.sourceOfFunds).toBeUndefined();
      expect(capturedBody.order.amount).toBe("450000");
      expect(response.success).toBe(true);
      expect(response.mode).toBe("checkout");
      expect(response.paymentUrl).toBe("https://devo.finpay.id/pg/payment/card/v2/access/abc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed when Finpay returns a non-success responseCode", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ responseCode: "4011000", responseMessage: "Unauthorized" }),
    }) as any;

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: MERCHANT_ID,
        apiKey: MERCHANT_KEY,
        sandbox: true,
      });
      const response = await buayar.createInvoice({
        orderId: "ORDER-FINPAY-DENIED",
        amount: 10000,
        paymentMethod: "bca_va",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(response.success).toBe(false);
      expect(response.error).toContain("Unauthorized");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("verifies a documented nested Finpay callback (HMAC-SHA512 over fields minus signature)", async () => {
    const fields = {
      customer: { id: "hajar@yahoo.com" },
      order: { id: "1664255905824", reference: "16642559058241000000000", amount: 1000, currency: "IDR" },
      meta: { data: null },
      result: {
        payment: {
          amount: 1000,
          status: "PAID",
          channel: "014",
          datetime: "2026-09-21 13:33:09",
          userDesc: "Your transaction was successful",
          reference: "59d5d4a7-1bb4-4301-b89e-df278e11343b014",
          statusDesc: "PAID",
        },
      },
    };
    const signature = generateFinpaySignature(fields, MERCHANT_KEY);

    const buayar = new Buayar({
      provider: "finpay",
      merchantCode: MERCHANT_ID,
      apiKey: MERCHANT_KEY,
      sandbox: true,
    });

    const result = await buayar.verifyWebhook({ ...fields, signature });
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("finpay");
    expect(result.orderId).toBe("1664255905824");
    expect(result.amount).toBe(1000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });

  it("accepts a CAPTURED status as paid (documented result status)", async () => {
    const fields = {
      customer: { id: "a@b.c" },
      order: { id: "ORDER-CAP", amount: 5000 },
      result: { payment: { status: "CAPTURED" } },
    };
    const signature = generateFinpaySignature(fields, MERCHANT_KEY);
    const provider = new FinpayProvider();
    const result = await provider.verifyCallback(
      { ...fields, signature },
      { provider: "finpay", merchantCode: MERCHANT_ID, apiKey: MERCHANT_KEY },
    );
    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.status).toBe("paid");
  });

  it("maps documented Finpay statuses, including live-observed REQUEST_INITIATED → pending", () => {
    expect(mapFinpayStatus("PAID").status).toBe("paid");
    expect(mapFinpayStatus("CAPTURED").status).toBe("paid");
    expect(mapFinpayStatus("REQUEST_INITIATED").status).toBe("pending");
    expect(mapFinpayStatus("PENDING").status).toBe("pending");
    expect(mapFinpayStatus("EXPIRED").status).toBe("expired");
    expect(mapFinpayStatus("FAILED").status).toBe("failed");
    expect(mapFinpayStatus("").status).toBe("failed");
  });

  it("rejects a forged signature and never trusts status without a valid signature", () => {
    const fields = {
      order: { id: "ORDER-FORGED", amount: 1000 },
      result: { payment: { status: "PAID" } },
    };
    expect(verifyFinpaySignature({ ...fields, signature: "deadbeef" }, MERCHANT_KEY, "deadbeef")).toBe(false);
    expect(verifyFinpaySignature(fields, MERCHANT_KEY, "")).toBe(false);
  });

  it("fails closed for an unsigned pending webhook", async () => {
    const buayar = new Buayar({
      provider: "finpay",
      merchantCode: MERCHANT_ID,
      apiKey: MERCHANT_KEY,
      sandbox: true,
    });

    const result = await buayar.verifyWebhook({
      order: { id: "ORDER-FINPAY-PENDING", amount: 275000 },
      result: { payment: { status: "PENDING" } },
    });

    expect(result.isValid).toBe(false);
    expect(result.isPending).toBe(false);
    expect(result.isPaid).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("cancels and voids transactions via the official GET endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string; auth: string }> = [];
    (globalThis as any).fetch = async (url: any, options: any) => {
      calls.push({ url: String(url), method: options.method, auth: options.headers.Authorization });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ responseCode: "2000000", responseMessage: "Request has been processed successfully" }),
      } as any;
    };

    try {
      const provider = new FinpayProvider();
      const cfg = { provider: "finpay", merchantCode: MERCHANT_ID, apiKey: MERCHANT_KEY, sandbox: true };

      const cancel = await provider.cancelTransaction("ORDER-CANCEL-1", cfg);
      const voided = await provider.voidTransaction("ORDER-VOID-1", cfg);

      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toBe("https://devo.finnet.co.id/pg/payment/card/cancel/ORDER-CANCEL-1");
      expect(calls[1].method).toBe("GET");
      expect(calls[1].url).toBe("https://devo.finnet.co.id/pg/payment/card/void/ORDER-VOID-1");
      const expectedAuth = "Basic " + Buffer.from(`${MERCHANT_ID}:${MERCHANT_KEY}`).toString("base64");
      expect(calls[0].auth).toBe(expectedAuth);
      expect(cancel.success).toBe(true);
      expect(cancel.statusCode).toBe("2000000");
      expect(voided.success).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed for cancel/void without credentials or with an error responseCode", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ responseCode: "4041011", responseMessage: "Transaction Not Found" }),
    }) as any;

    try {
      const provider = new FinpayProvider();
      // Tanpa kredensial → tidak menembak network sama sekali.
      const noCreds = await provider.cancelTransaction("X", { provider: "finpay" });
      expect(noCreds.success).toBe(false);
      expect(noCreds.rawResponse).toBeNull();

      const rejected = await provider.cancelTransaction("ORDER-X", {
        provider: "finpay",
        merchantCode: MERCHANT_ID,
        apiKey: MERCHANT_KEY,
      });
      expect(rejected.success).toBe(false);
      expect(rejected.error).toContain("Transaction Not Found");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("checks transaction status via GET /pg/payment/card/check/{orderId}", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedMethod = options.method;
      capturedAuth = options.headers.Authorization;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            responseCode: "2000000",
            responseMessage: "Success",
            data: {
              order: { id: "ORDER-FINPAY-003", reference: "REF-003", amount: 100000, currency: "IDR" },
              result: { payment: { amount: 100000, status: "PAID", statusDesc: "PAID" } },
            },
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: MERCHANT_ID,
        apiKey: MERCHANT_KEY,
        sandbox: true,
      });
      const result = await buayar.checkTransaction({ merchantOrderId: "ORDER-FINPAY-003" });

      expect(capturedMethod).toBe("GET");
      expect(capturedUrl).toBe("https://devo.finnet.co.id/pg/payment/card/check/ORDER-FINPAY-003");
      expect(capturedAuth).toBe("Basic " + Buffer.from(`${MERCHANT_ID}:${MERCHANT_KEY}`).toString("base64"));
      expect(result.success).toBe(true);
      expect(result.isPaid).toBe(true);
      expect(result.status).toBe("paid");
      expect(result.amount).toBe(100000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
