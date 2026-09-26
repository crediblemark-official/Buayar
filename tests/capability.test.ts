import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("K5 — Pre-flight payment method capability validation", () => {
  it("rejects unsupported paymentMethod BEFORE making network requests (e.g. kredivo on paypal)", async () => {
    const buayar = new Buayar({
      provider: "paypal",
      clientKey: "mock-client-id",
      apiKey: "mock-secret",
    });

    const result = await buayar.createInvoice({
      orderId: "ORD-K5-01",
      amount: 50000,
      productDetails: "Test Item",
      customer: { name: "Buyer", email: "buyer@example.com" },
      paymentMethod: "kredivo", // PayPal tidak mendukung kredivo
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Payment method 'kredivo' is not supported by provider 'paypal'");
    expect(result.error).toContain("Supported methods: credit_card, paylater, paypal, bank_transfer");
  });

  it("rejects unsupported method on square (e.g. bca_va on square)", async () => {
    const buayar = new Buayar({
      provider: "square",
      apiKey: "mock-token",
    });

    const result = await buayar.createInvoice({
      orderId: "ORD-K5-02",
      amount: 50000,
      productDetails: "Test Item",
      customer: { name: "Buyer", email: "buyer@example.com" },
      paymentMethod: "bca_va", // Square tidak mendukung bca_va
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Payment method 'bca_va' is not supported by provider 'square'");
  });

  it("allows raw escape hatch to bypass pre-flight capability check", async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      fetchCalled = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "order_mock" }),
        text: async () => JSON.stringify({ id: "order_mock" }),
      };
    };

    try {
      const buayar = new Buayar({
        provider: "paypal",
        clientKey: "mock-client-id",
        apiKey: "mock-secret",
      });

      // Escape hatch eksplisit untuk testing atau method baru yang belum ada di enum kanonikal
      await buayar.createInvoice({
        orderId: "ORD-K5-03",
        amount: 50000,
        productDetails: "Test Item",
        customer: { name: "Buyer", email: "buyer@example.com" },
        paymentMethod: { raw: "custom_unmapped", providerOnly: true },
      });

      // Escape hatch lolos pre-flight check dan memanggil provider
      expect(fetchCalled).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("probePaymentMethods returns explicit source: 'live' | 'static'", async () => {
    const buayar = new Buayar({
      provider: "duitku",
      merchantCode: "M1",
      apiKey: "k1",
    });

    const probe = await buayar.probePaymentMethods();
    expect(probe.source).toBeDefined();
    expect(["live", "static"]).toContain(probe.source!);
  });
});
