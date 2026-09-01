import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

describe("Faspay Provider & Client Integration", () => {
  it("should resolve Faspay config from environment variables", () => {
    process.env.PROVIDER_PG = "faspay";
    process.env.FASPAY_MERCHANT_ID = "31112";
    process.env.FASPAY_USER_ID = "db31112";
    process.env.FASPAY_PASSWORD = "faspay-password-123";
    process.env.FASPAY_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("faspay");
    expect(buayar.getConfig().apiKey).toBe("faspay-password-123");
    expect(buayar.getConfig().merchantCode).toBe("31112");
    expect(buayar.getConfig().clientKey).toBe("db31112");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should create direct VA invoice via Faspay Post Data API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          response_code: "00",
          response_desc: "Success",
          bill_no: body.bill_no,
          trx_id: "TRX-FAS-998877",
          trx_no: "8888012345678901",
          va_no: "8888012345678901",
          redirect_url: "https://sandbox.faspay.co.id/payment/123",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "faspay",
        merchantCode: "31112",
        clientKey: "db31112",
        apiKey: "faspay-password-123",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-FASPAY-001",
        amount: 350000,
        paymentMethod: "bca_va",
        productDetails: "Kursus Pemrograman",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("faspay");
      expect(response.vaNumber).toBe("8888012345678901");
      expect(response.reference).toBe("TRX-FAS-998877");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize Faspay webhook notification", async () => {
    const userId = "db31112";
    const password = "faspay-password-123";
    const billNo = "ORDER-FASPAY-001";
    const paymentStatusCode = "2";

    const crypto = await import("crypto");
    const md5 = crypto.createHash("md5").update(`${userId}${password}${billNo}${paymentStatusCode}`).digest("hex");
    const signature = crypto.createHash("sha1").update(md5).digest("hex");

    const buayar = new Buayar({
      provider: "faspay",
      merchantCode: "31112",
      clientKey: userId,
      apiKey: password,
      sandbox: true,
    });

    const callbackPayload = {
      bill_no: billNo,
      trx_id: "TRX-FAS-998877",
      payment_status_code: paymentStatusCode,
      payment_status_desc: "Payment Success",
      payment_total: "35000000", // in cents/subunits
      signature: signature,
    };

    const result = await buayar.verifyWebhook(callbackPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("faspay");
    expect(result.orderId).toBe(billNo);
    expect(result.amount).toBe(350000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });
});
