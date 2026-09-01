import { describe, expect, it } from "bun:test";
import { Buayar, MidtransProvider } from "../src";

describe("Midtrans Provider & Core API Integration", () => {
  it("should return pre-categorized payment channels in Midtrans", async () => {
    const provider = new MidtransProvider();
    const result = await provider.getPaymentMethods({}, {});

    expect(result.success).toBe(true);
    expect(result.methods.length).toBeGreaterThan(5);
    expect(result.categories).toBeDefined();
    expect(result.categories!["Virtual Account"]).toBeDefined();
    expect(result.categories!["QRIS"]).toBeDefined();
    expect(result.categories!["E-Wallet"]).toBeDefined();
  });

  it("should parse Direct VA and QRIS responses in Midtrans Core API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      if (body.payment_type === "bank_transfer") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status_code: "201",
            status_message: "Success, Bank Transfer transaction is created",
            transaction_id: "mid-trx-001",
            order_id: body.transaction_details.order_id,
            gross_amount: "100000.00",
            payment_type: "bank_transfer",
            va_numbers: [{ bank: "bca", va_number: "987654321012" }],
            expiry_time: "2026-09-02 12:00:00",
          }),
        } as any;
      }
      if (body.payment_type === "qris") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status_code: "201",
            status_message: "Success, QRIS transaction is created",
            transaction_id: "mid-trx-002",
            order_id: body.transaction_details.order_id,
            gross_amount: "50000.00",
            payment_type: "qris",
            qr_string: "00020101021226590014ID.LINKAJA.WWW0118936009110000000001020300051020000000000005204581253033605802ID5911Merchant5802ID6007JAKARTA61051234562070703A0163041D3B",
            actions: [{ name: "generate-qr-code", url: "https://api.midtrans.com/v2/qris/123/qr-code" }],
          }),
        } as any;
      }
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "midtrans",
        apiKey: "SB-Mid-server-test",
      });

      // 1. Direct VA
      const vaResponse = await buayar.createInvoice({
        orderId: "ORDER-VA-001",
        amount: 100000,
        paymentMethod: "bca_va",
        productDetails: "Top Up Game",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(vaResponse.success).toBe(true);
      expect(vaResponse.provider).toBe("midtrans");
      expect(vaResponse.vaNumber).toBe("987654321012");
      expect(vaResponse.vaBank).toBe("bca");

      // 2. Direct QRIS
      const qrisResponse = await buayar.createInvoice({
        orderId: "ORDER-QR-001",
        amount: 50000,
        paymentMethod: "qris",
        productDetails: "Kopi",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(qrisResponse.success).toBe(true);
      expect(qrisResponse.qrString).toContain("00020101021226590014ID");
      expect(qrisResponse.qrCodeUrl).toBe("https://api.midtrans.com/v2/qris/123/qr-code");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
