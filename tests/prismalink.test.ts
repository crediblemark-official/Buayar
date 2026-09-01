import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("PrismaLink Provider & Client Integration", () => {
  it("should resolve PrismaLink config from environment variables", () => {
    process.env.PROVIDER_PG = "prismalink";
    process.env.PRISMALINK_MERCHANT_ID = "PRISMA-TEST-001";
    process.env.PRISMALINK_SECRET_KEY = "prisma-secret-12345";
    process.env.PRISMALINK_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("prismalink");
    expect(buayar.getConfig().apiKey).toBe("prisma-secret-12345");
    expect(buayar.getConfig().merchantCode).toBe("PRISMA-TEST-001");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should create direct VA invoice via PrismaLink API", async () => {
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
          va_number: "70070123456789",
          bank: "BCA",
          payment_url: "https://payment.prismalink.co.id/instructions/bca",
          expired_at: "2026-09-02T12:00:00.000Z",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "prismalink",
        merchantCode: "PRISMA-TEST-001",
        apiKey: "prisma-secret-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-PRISMA-001",
        amount: 225000,
        paymentMethod: "bca_va",
        productDetails: "Hosting Cloud",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("prismalink");
      expect(response.vaNumber).toBe("70070123456789");
      expect(response.vaBank).toBe("bca");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create redirect invoice via PrismaLink Checkout API", async () => {
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
          payment_url: "https://sandbox-api.prismalink.co.id/checkout/pay-123",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "prismalink",
        merchantCode: "PRISMA-TEST-001",
        apiKey: "prisma-secret-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-PRISMA-002",
        amount: 500000,
        productDetails: "Server Dedikasi",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("prismalink");
      expect(response.paymentUrl).toBe("https://sandbox-api.prismalink.co.id/checkout/pay-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize PrismaLink webhook notification", async () => {
    const merchantId = "PRISMA-TEST-001";
    const orderId = "ORDER-PRISMA-001";
    const amount = 225000;
    const secretKey = "prisma-secret-12345";

    const crypto = await import("crypto");
    const signature = crypto.createHash("sha256").update(`${merchantId}${orderId}${amount}${secretKey}`).digest("hex");

    const buayar = new Buayar({
      provider: "prismalink",
      merchantCode: merchantId,
      apiKey: secretKey,
      sandbox: true,
    });

    const callbackPayload = {
      merchant_id: merchantId,
      order_id: orderId,
      amount: amount,
      status: "SUCCESS",
      signature: signature,
    };

    const result = await buayar.verifyWebhook(callbackPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("prismalink");
    expect(result.orderId).toBe(orderId);
    expect(result.amount).toBe(225000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });
});
