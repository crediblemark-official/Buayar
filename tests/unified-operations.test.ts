import { describe, expect, it, afterEach } from "bun:test";
import { Buayar } from "../src";

let originalFetch: any;

function mockFetch(handler: (url: any, options?: any) => any) {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: any, options: any) => {
    const result = handler(url, options);
    const body = typeof result.body !== "undefined" ? result.body : result;
    return {
      ok: result.ok !== false,
      status: result.status ?? 200,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as any;
  };
}

function restoreFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
}

afterEach(() => restoreFetch());

describe("Unified Operations — Refund", () => {
  it("should refund via Stripe", async () => {
    mockFetch(() => ({ id: "re_123", status: "succeeded" }));
    const buayar = new Buayar({ provider: "stripe", apiKey: "sk_test_123" });
    const result = await buayar.refund({ transactionId: "pi_456", amount: 50000 });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.reference).toBe("re_123");
  });

  it("should refund via Midtrans", async () => {
    mockFetch(() => ({ order_id: "ORDER-1", status_message: "Success, transaction is refunded" }));
    const buayar = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-123" });
    const result = await buayar.refund({ transactionId: "ORDER-1", amount: 50000, reason: "product defect" });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.provider).toBe("midtrans");
  });

  it("should return supported:false for provider without refund (faspay)", async () => {
    const buayar = new Buayar({ provider: "faspay", apiKey: "x", merchantCode: "M", extra: { userId: "u", password: "p" } });
    const result = await buayar.refund({ transactionId: "ORDER-1" });
    expect(result.supported).toBe(false);
    expect(result.success).toBe(false);
  });
});

describe("Unified Operations — Check Balance", () => {
  it("should fetch Stripe balance", async () => {
    mockFetch(() => ({ available: [{ amount: 150000, currency: "idr" }] }));
    const buayar = new Buayar({ provider: "stripe", apiKey: "sk_test_123" });
    const result = await buayar.checkBalance();
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.balance).toBe(150000);
    expect(result.currency).toBe("idr");
  });

  it("should fetch Xendit balance", async () => {
    mockFetch(() => ({ balance: 250000 }));
    const buayar = new Buayar({ provider: "xendit", apiKey: "xnd_development_123" });
    const result = await buayar.checkBalance();
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.balance).toBe(250000);
  });

  it("should return supported:false for provider without balance (twocheckout)", async () => {
    const buayar = new Buayar({ provider: "twocheckout", merchantCode: "M", secretKey: "S", extra: { secretWord: "W" } });
    const result = await buayar.checkBalance();
    expect(result.supported).toBe(false);
    expect(result.success).toBe(false);
  });
});

describe("Unified Operations — Disburse", () => {
  it("should disburse via Xendit", async () => {
    const calls: string[] = [];
    mockFetch((url: any, options: any) => {
      calls.push(JSON.parse(options.body).external_id);
      return { id: "disb_123", status: "PENDING" };
    });
    const buayar = new Buayar({ provider: "xendit", apiKey: "xnd_development_123" });
    const result = await buayar.disburse({
      externalId: "DISB-001",
      bankCode: "BCA",
      accountHolderName: "BUDI",
      accountNumber: "1234567890",
      amount: 500000,
    });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(calls[0]).toBe("DISB-001");
    expect(result.reference).toBe("disb_123");
  });

  it("should disburse via Duitku", async () => {
    mockFetch(() => ({ statusCode: "00", statusMessage: "Success" }));
    const buayar = new Buayar({ provider: "duitku", apiKey: "k", merchantCode: "M" });
    const result = await buayar.disburse({
      externalId: "DISB-002",
      bankCode: "BCA",
      accountNumber: "1234567890",
      amount: 100000,
    });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
  });

  it("should return supported:false for provider without disburse (stripe)", async () => {
    const buayar = new Buayar({ provider: "stripe", apiKey: "sk_test_123" });
    const result = await buayar.disburse({
      externalId: "DISB-003",
      bankCode: "BCA",
      accountNumber: "123",
      amount: 1000,
    });
    expect(result.supported).toBe(false);
    expect(result.success).toBe(false);
  });
});
