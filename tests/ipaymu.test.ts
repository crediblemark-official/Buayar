import { describe, expect, it } from "bun:test";
import crypto from "crypto";
import { Buayar } from "../src";
import { verifyIpaymuCallbackSignature } from "../src/providers/ipaymu/signature";

const IPAYMU_VA = "0000001411234567";

/**
 * Replikasi normalisasi callback sesuai dokumentasi resmi iPaymu
 * (dipakai untuk menghitung signature pembanding secara independen).
 */
function phpNormalize(rawData: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in rawData) {
    const val = rawData[key];
    if (key === "is_escrow") {
      result[key] = val === "true" || val === "1" || val === 1;
    } else if (["trx_id", "status_code", "transaction_status_code", "paid_off"].includes(key)) {
      result[key] = parseInt(val, 10);
    } else if (key === "additional_info") {
      result[key] = val === "[]" ? [] : val;
    } else {
      result[key] = String(val);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(result, "additional_info")) {
    result.additional_info = [];
  }
  return result;
}

function computeIpaymuSignature(payload: any, secretKey: string): string {
  const normalized = phpNormalize(payload);
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(normalized).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = normalized[key];
  }
  let json = JSON.stringify(sorted);
  json = json.replace(/\//g, "\\/");
  return crypto.createHmac("sha256", secretKey).update(json).digest("hex");
}

const callbackPayload = {
  reference_id: "ORDER-IPAYMU-001",
  status: "berhasil",
  status_code: "1",
  trx_id: "12345678",
  total: "100000",
  amount: "100000",
  sub_total: "100000",
  fee: "1500",
  paid_off: "98500",
  is_escrow: "0",
  additional_info: "[]",
  merchant: IPAYMU_VA,
};

describe("iPaymu Provider & Client Integration", () => {
  it("should create direct VA invoice in iPaymu", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Message: "Success",
          Data: {
            SessionId: "ipaymu-session-123",
            TransactionId: 987654,
            PaymentNo: "0000001411234567",
            PaymentName: "BCA Virtual Account",
            Total: 100000,
            Fee: 3500,
            Expired: "2026-09-02 23:59:59",
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-IPAYMU-001",
        amount: 100000,
        paymentMethod: "bca_va",
        productDetails: "Top Up Game",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("ipaymu");
      expect(response.vaNumber).toBe("0000001411234567");
      expect(response.reference).toBe("987654");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should check balance via IpaymuClient", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Message: "Success",
          Data: {
            MerchantBalance: 25000000,
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });

      const ipaymuClient = buayar.getIpaymuClient();
      const balance = await ipaymuClient.checkBalance();
      expect(balance.success).toBe(true);
      expect(balance.balance).toBe(25000000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should fetch dynamic payment methods via getPaymentMethods", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Status: 200,
          Success: true,
          Data: [
            {
              Code: "va",
              Name: "Virtual Account",
              Channels: [
                {
                  Code: "bag",
                  Name: "VA BAG",
                  TransactionFee: { ActualFee: 3500, ActualFeeType: "FLAT" },
                  HealthStatus: "online",
                  PaymentInstructionsDoc: "https://ipaymu.com/doc/bag.pdf",
                },
                {
                  Code: "bmi",
                  Name: "VA Muamalat",
                  TransactionFee: { ActualFee: 3500, ActualFeeType: "FLAT" },
                  HealthStatus: "online",
                  FeatureStatus: "active",
                },
                {
                  Code: "bca",
                  Name: "VA BCA (maintenance)",
                  TransactionFee: { ActualFee: 4000, ActualFeeType: "FLAT" },
                  HealthStatus: "offline",
                  FeatureStatus: "active",
                },
                {
                  Code: "bri",
                  Name: "VA BRI (non aktif)",
                  TransactionFee: { ActualFee: 4000, ActualFeeType: "FLAT" },
                  HealthStatus: "online",
                  FeatureStatus: "inactive",
                },
                {
                  Code: "mandiri",
                  Name: "VA Mandiri (diblokir)",
                  TransactionFee: { ActualFee: 4000, ActualFeeType: "FLAT" },
                  FeatureStatus: "suspended",
                },
              ],
            },
          ],
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });

      const res = await buayar.getPaymentMethods();
      expect(res.success).toBe(true);
      // Only available channels are returned: offline/inactive/suspended are excluded
      expect(res.methods.length).toBe(2);
      expect(res.methods[0].code).toBe("bag_va");
      expect(res.methods[1].code).toBe("muamalat_va");
      expect(res.methods.some((m) => m.code === "bca_va")).toBe(false);
      expect(res.methods.some((m) => m.code === "bri_va")).toBe(false);
      expect(res.methods.some((m) => m.code === "mandiri_va")).toBe(false);
      expect(res.categories?.["Virtual Account"]?.length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should support getHistory and getBankList on IpaymuClient", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/history")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            Status: 200,
            Success: true,
            Data: {
              Transaction: [{ TransactionId: 12345, Amount: 50000 }],
              Pagination: { total: 1, current_page: 1 },
            },
          }),
        } as any;
      }
      if (urlStr.includes("/banklist")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            Status: 200,
            Success: true,
            Data: {
              bank: [{ code: "014", name: "BCA" }],
            },
          }),
        } as any;
      }
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      const client = buayar.getIpaymuClient();
      const history = await client.getHistory({ page: 1, limit: 10 });
      expect(history.Status).toBe(200);
      expect(history.Data.Transaction.length).toBe(1);

      const bankList = await client.getBankList();
      expect(bankList.Status).toBe(200);
      expect(bankList.Data.bank[0].code).toBe("014");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should include feeDirection and escrow in createInvoice payload", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Success: true,
          Data: {
            TransactionId: 111,
            PaymentNo: "381180001",
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      await buayar.createInvoice({
        orderId: "ORDER-FEES",
        amount: 50000,
        paymentMethod: "bca_va",
        productDetails: "Produk",
        customer: { name: "Budi", email: "budi@mail.com" },
        feeDirection: "BUYER",
        escrow: true,
      });

      expect(capturedBody.feeDirection).toBe("BUYER");
      expect(capturedBody.escrow).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should return failure without static methods when credentials are missing", async () => {
    const buayar = new Buayar({
      provider: "ipaymu",
    });

    const res = await buayar.getPaymentMethods();
    expect(res.success).toBe(false);
    expect(res.methods.length).toBe(0);
    expect(res.error).toBeDefined();
  });

  it("should call official v2 COD endpoints and Area API on IpaymuClient", async () => {
    const calledUrls: { url: string; method: string; body?: any }[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const urlStr = String(url);
      calledUrls.push({ url: urlStr, method: options?.method || "GET", body: options?.body });

      if (urlStr.includes("/cod/area")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: "SUCCESS",
            status: 200,
            success: true,
            data: [{ id: 101, label: "Jakarta Barat" }],
          }),
        } as any;
      }
      if (urlStr.includes("/cod/shipping-calculate")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: "SUCCESS",
            status: 200,
            success: true,
            data: [{ shipping_name: "SICEPAT", shipping_fee: 10000 }],
          }),
        } as any;
      }
      if (urlStr.includes("/cod/pickup")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: "SUCCESS",
            status: 200,
            success: true,
            message: "Pickup scheduled",
          }),
        } as any;
      }
      if (urlStr.includes("/cod/download-label")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: "SUCCESS",
            status: 200,
            success: true,
            data: { url: "https://sandbox.ipaymu.com/labels/123.pdf" },
          }),
        } as any;
      }
      if (urlStr.includes("/cod/tracking")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            code: "SUCCESS",
            status: 200,
            success: true,
            data: { history: [] },
          }),
        } as any;
      }
      if (urlStr.includes("/api/areas/province")) {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 31, name: "DKI Jakarta" }],
        } as any;
      }

      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      const client = buayar.getIpaymuClient();

      const area = await client.getCodArea("jakarta");
      expect(area.success).toBe(true);
      expect(calledUrls.some(c => c.url.includes("/cod/area?area=jakarta") && c.method === "GET")).toBe(true);

      const rate = await client.getCodRate({
        pickup_area_id: "101",
        destination_area_id: "102",
        weight: 1,
      });
      expect(rate.success).toBe(true);
      expect(calledUrls.some(c => c.url.includes("/cod/shipping-calculate") && c.method === "POST")).toBe(true);

      const pickup = await client.getCodPickup({
        transaction_id: "123",
        pickup_date: "2026-09-04",
        pickup_time: "10:00",
        pickup_vehicle: "Motor",
      });
      expect(pickup.success).toBe(true);
      expect(calledUrls.some(c => c.url.includes("/cod/pickup") && c.method === "POST")).toBe(true);

      const awb = await client.getCodAwb("123");
      expect(awb.success).toBe(true);
      expect(calledUrls.some(c => c.url.includes("/cod/download-label/123") && c.method === "GET")).toBe(true);

      const tracking = await client.getCodTracking({ awb: "AWB123" });
      expect(tracking.success).toBe(true);
      expect(calledUrls.some(c => c.url.includes("/cod/tracking") && c.method === "POST")).toBe(true);

      const prov = await client.getAreasProvince();
      expect(prov[0].name).toBe("DKI Jakarta");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should support Split Payment by sending account parameter in createInvoice", async () => {
    let capturedDirectBody: any = null;
    let capturedRedirectBody: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/payment/direct")) {
        capturedDirectBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            Status: 200,
            Success: true,
            Data: { TransactionId: 1001, PaymentNo: "00000012345" },
          }),
        } as any;
      }
      if (urlStr.includes("/payment")) {
        capturedRedirectBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            Status: 200,
            Success: true,
            Data: { SessionID: "sess-1", Url: "https://payment.ipaymu.com" },
          }),
        } as any;
      }
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      // Direct payment with subAccountId
      await buayar.createInvoice({
        orderId: "SPLIT-DIR-1",
        amount: 150000,
        paymentMethod: "bca_va",
        productDetails: "Split payment test",
        customer: { name: "Budi", email: "budi@mail.com" },
        subAccountId: "0000009988776655",
      });
      expect(capturedDirectBody.account).toBe("0000009988776655");

      // Redirect payment with subAccountId
      await buayar.createInvoice({
        orderId: "SPLIT-REDIR-1",
        amount: 200000,
        productDetails: "Split redirect test",
        customer: { name: "Budi", email: "budi@mail.com" },
        subAccountId: "0000009988776655",
      });
      expect(capturedRedirectBody.account).toBe("0000009988776655");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should support Split Payment Single Register API via registerUser", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Status: 200,
          Success: true,
          Message: "Success",
          Data: {
            Email: "reseller@example.com",
            Phone: "08123456789",
            Va: "0000001234567890",
            VaName: "IPAYMU - Reseller",
            IsNewUser: true,
          },
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
      });

      const client = buayar.getIpaymuClient();
      const res = await client.registerUser({
        name: "Reseller Mitra",
        email: "reseller@example.com",
        phone: "08123456789",
      });

expect(res.Success).toBe(true);
    expect(res.Data.Va).toBe("0000001234567890");
    expect(capturedBody.account).toBe("0000001411234567");
    expect(capturedBody.email).toBe("reseller@example.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should accept iPaymu callback with valid X-Signature (HMAC-SHA256 over normalized sorted payload)", async () => {
    const signature = computeIpaymuSignature(callbackPayload, IPAYMU_VA);

    const buayar = new Buayar({
      provider: "ipaymu",
      merchantCode: IPAYMU_VA,
      apiKey: "test-api-key",
      sandbox: true,
    });

    expect(verifyIpaymuCallbackSignature(callbackPayload, IPAYMU_VA, signature)).toBe(true);

    const result = await buayar.verifyWebhook(callbackPayload, {
      "x-signature": signature,
      "x-timestamp": "2025-11-11T10:10:52+07:00",
    });

    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
    expect(result.orderId).toBe("ORDER-IPAYMU-001");
    expect(result.amount).toBe(100000);
    expect(result.status).toBe("paid");
  });

  it("should reject iPaymu callback with invalid/missing X-Signature (forged webhook)", async () => {
    const buayar = new Buayar({
      provider: "ipaymu",
      merchantCode: IPAYMU_VA,
      apiKey: "test-api-key",
      sandbox: true,
    });

    // Missing signature header
    const withoutSig = await buayar.verifyWebhook({ ...callbackPayload, status: "berhasil" });
    expect(withoutSig.isValid).toBe(false);
    expect(withoutSig.isPaid).toBe(false);
    expect(withoutSig.isFailed).toBe(true);

    // Wrong signature header (forged)
    const wrongSig = await buayar.verifyWebhook({ ...callbackPayload, status: "berhasil" }, {
      "x-signature": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    });
    expect(wrongSig.isValid).toBe(false);
    expect(wrongSig.isPaid).toBe(false);

    // Tampered amount must break signature too
    const tampered = { ...callbackPayload, amount: "999999" };
    const tamperedSig = computeIpaymuSignature(tampered, IPAYMU_VA);
    const replayed = await buayar.verifyWebhook(callbackPayload, {
      "x-signature": tamperedSig,
    });
    expect(replayed.isValid).toBe(false);
  });
});
