import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Nicepay Provider & Client Integration", () => {
  it("should resolve Nicepay config from environment variables", () => {
    process.env.PROVIDER_PG = "nicepay";
    process.env.NICEPAY_IMID = "IONPAYTEST";
    process.env.NICEPAY_KEY = "nicepay-merchant-key-12345";
    process.env.NICEPAY_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("nicepay");
    expect(buayar.getConfig().apiKey).toBe("nicepay-merchant-key-12345");
    expect(buayar.getConfig().merchantCode).toBe("IONPAYTEST");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should create direct VA invoice via Nicepay API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          resultCd: "0000",
          resultMsg: "SUCCESS",
          referenceNo: body.referenceNo,
          tXid: "TX-NICE-887766",
          amt: body.amt,
          vacctNo: "70014123456789",
          bankCd: "BBBB",
          vacctValidDt: "20260902",
          vacctValidTm: "235959",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "nicepay",
        merchantCode: "IONPAYTEST",
        apiKey: "nicepay-merchant-key-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-NICE-001",
        amount: 215000,
        paymentMethod: "bca_va",
        productDetails: "Kursus Digital",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("nicepay");
      expect(response.vaNumber).toBe("70014123456789");
      expect(response.reference).toBe("TX-NICE-887766");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create redirect invoice via Nicepay Order Regist API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          resultCd: "0000",
          resultMsg: "SUCCESS",
          referenceNo: body.referenceNo,
          tXid: "TX-NICE-554433",
          paymentUrl: "https://dev.nicepay.co.id/nicepay/pay/order-123",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "nicepay",
        merchantCode: "IONPAYTEST",
        apiKey: "nicepay-merchant-key-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-NICE-002",
        amount: 400000,
        productDetails: "Konsultasi Bisnis",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("nicepay");
      expect(response.paymentUrl).toBe("https://dev.nicepay.co.id/nicepay/pay/order-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Nicepay webhook notification", async () => {
    const iMid = "IONPAYTEST";
    const merchantKey = "nicepay-merchant-key-12345";
    const referenceNo = "ORDER-NICE-001";
    const amt = 215000;
    const timeStamp = "20260901120000";

    const crypto = await import("crypto");
    const merchantToken = crypto.createHash("sha256").update(`${timeStamp}${iMid}${referenceNo}${amt}${merchantKey}`).digest("hex");

    const buayar = new Buayar({
      provider: "nicepay",
      merchantCode: iMid,
      apiKey: merchantKey,
      sandbox: true,
    });

    const callbackPayload = {
      iMid: iMid,
      referenceNo: referenceNo,
      tXid: "TX-NICE-887766",
      amt: amt,
      resultCd: "0000",
      status: "0",
      timeStamp: timeStamp,
      merchantToken: merchantToken,
    };

    const result = await buayar.verifyWebhook(callbackPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("nicepay");
    expect(result.orderId).toBe(referenceNo);
    expect(result.amount).toBe(215000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });
});
