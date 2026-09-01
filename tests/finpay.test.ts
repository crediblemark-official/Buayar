import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Finpay Provider & Client Integration", () => {
  it("should resolve Finpay config from environment variables", () => {
    process.env.PROVIDER_PG = "finpay";
    process.env.FINPAY_MERCHANT_ID = "FINPAY-MCH-001";
    process.env.FINPAY_MERCHANT_KEY = "finpay-secret-key-12345";
    process.env.FINPAY_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("finpay");
    expect(buayar.getConfig().apiKey).toBe("finpay-secret-key-12345");
    expect(buayar.getConfig().merchantCode).toBe("FINPAY-MCH-001");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should create direct VA invoice via Finpay API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: "SUCCESS",
          order_id: body.order_id,
          amount: body.amount,
          va_number: "99880011223344",
          bank: "bca",
          payment_url: "https://sandbox.finpay.co.id/instructions/bca",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: "FINPAY-MCH-001",
        apiKey: "finpay-secret-key-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-FINPAY-001",
        amount: 275000,
        paymentMethod: "bca_va",
        productDetails: "Langganan Internet",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("finpay");
      expect(response.vaNumber).toBe("99880011223344");
      expect(response.vaBank).toBe("bca");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create redirect invoice via Finpay Payment Initiate API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: "SUCCESS",
          order_id: body.order_id,
          amount: body.amount,
          payment_url: "https://sandbox.finpay.co.id/pay/invoice-123",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "finpay",
        merchantCode: "FINPAY-MCH-001",
        apiKey: "finpay-secret-key-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-FINPAY-002",
        amount: 450000,
        productDetails: "Paket Hosting Bisnis",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("finpay");
      expect(response.paymentUrl).toBe("https://sandbox.finpay.co.id/pay/invoice-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Finpay webhook notification", async () => {
    const merchantId = "FINPAY-MCH-001";
    const merchantKey = "finpay-secret-key-12345";
    const orderId = "ORDER-FINPAY-001";
    const amount = 275000;

    const crypto = await import("crypto");
    const signature = crypto.createHmac("sha512", merchantKey).update(`${merchantId}%${orderId}%${amount}%${merchantKey}`).digest("hex");

    const buayar = new Buayar({
      provider: "finpay",
      merchantCode: merchantId,
      apiKey: merchantKey,
      sandbox: true,
    });

    const callbackPayload = {
      merchant_id: merchantId,
      order_id: orderId,
      amount: amount,
      payment_status: "SUCCESS",
      signature: signature,
    };

    const result = await buayar.verifyWebhook(callbackPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("finpay");
    expect(result.orderId).toBe(orderId);
    expect(result.amount).toBe(275000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });
});
