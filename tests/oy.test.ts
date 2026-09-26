import { describe, expect, it, afterEach } from "bun:test";
import { Buayar } from "../src";

const OY_ENV = ["PROVIDER_PG", "OY_USERNAME", "OY_API_KEY", "OY_SANDBOX"] as const;

// Hindari pencemaran process.env ke file test lain (mis. webhook.test.ts).
// Dulu hanya dihapus, tidak dipulihkan, jadi var OY yang sudah ada di
// environment mesin hilang permanen untuk sisa suite. Sekarang nilai aslinya
// disimpan lalu dikembalikan.
const ENV_AWAL: Record<string, string | undefined> = {};
for (const key of OY_ENV) ENV_AWAL[key] = process.env[key];

afterEach(() => {
  for (const key of OY_ENV) {
    const awal = ENV_AWAL[key];
    if (awal === undefined) delete process.env[key];
    else process.env[key] = awal;
  }
});

describe("OY! Bisnis Provider & Client Integration", () => {
  it("should resolve OY! config from environment variables", () => {
    process.env.PROVIDER_PG = "oy";
    process.env.OY_USERNAME = "myoybusiness";
    process.env.OY_API_KEY = "oy-secret-key-12345";
    process.env.OY_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("oy");
    expect(buayar.getConfig().apiKey).toBe("oy-secret-key-12345");
    expect(buayar.getConfig().merchantCode).toBe("myoybusiness");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should create direct VA invoice via OY! API", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: { code: "000", message: "success" },
          va_number: "98877123456789",
          bank_code: body.bank_code,
          trx_id: body.trx_id,
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "oy",
        merchantCode: "myoybusiness",
        apiKey: "oy-secret-key-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-OY-001",
        amount: 320000,
        paymentMethod: "bca_va",
        productDetails: "Kursus Web Developer",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("oy");
      expect(response.vaNumber).toBe("98877123456789");
      expect(response.orderId).toBe("ORDER-OY-001");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create redirect checkout invoice via OY! Payment Checkout v2", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: { code: "000", message: "success" },
          partner_tx_id: body.partner_tx_id,
          tx_id: "OY-TX-112233",
          url: "https://pay.oyindonesia.com/checkout/order-123",
        }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "oy",
        merchantCode: "myoybusiness",
        apiKey: "oy-secret-key-12345",
        sandbox: true,
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-OY-002",
        amount: 450000,
        productDetails: "Konsultasi Cloud",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(response.success).toBe(true);
      expect(response.provider).toBe("oy");
      expect(response.paymentUrl).toBe("https://pay.oyindonesia.com/checkout/order-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify and normalize OY! webhook notification", async () => {
    const buayar = new Buayar({
      provider: "oy",
      merchantCode: "myoybusiness",
      apiKey: "oy-secret-key-12345",
      sandbox: true,
    });

    const callbackPayload = {
      partner_tx_id: "ORDER-OY-001",
      tx_id: "OY-TX-112233",
      amount: 320000,
      status: "SUCCESS",
      payment_method: "VA",
    };

    const result = await buayar.verifyWebhook(callbackPayload, {
      "x-oy-username": "myoybusiness",
    });
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("oy");
    expect(result.orderId).toBe("ORDER-OY-001");
    expect(result.amount).toBe(320000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });

  // SECURITY: tanpa header x-oy-username tidak ada bukti autentikasi sama sekali.
  // Webhook forging harus selalu ditolak, meski payload terlihat "COMPLETED".
  it("should REJECT an OY! webhook with no x-oy-username header (fail-closed)", async () => {
    const buayar = new Buayar({
      provider: "oy",
      merchantCode: "myoybusiness",
      apiKey: "oy-secret-key-12345",
      sandbox: true,
    });

    const forged = {
      partner_tx_id: "ORDER-FORGED",
      tx_id: "OY-FORGED-001",
      amount: 320000,
      status: "SUCCESS",
    };

    const result = await buayar.verifyWebhook(forged);
    expect(result.isValid).toBe(false);
    expect(result.isPaid).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("should REJECT an OY! webhook whose x-oy-username does not match (fail-closed)", async () => {
    const buayar = new Buayar({
      provider: "oy",
      merchantCode: "myoybusiness",
      apiKey: "oy-secret-key-12345",
      sandbox: true,
    });

    const result = await buayar.verifyWebhook(
      { partner_tx_id: "ORDER-FORGED-2", amount: 1000, status: "SUCCESS" },
      { "x-oy-username": "attacker-oy" }
    );
    expect(result.isValid).toBe(false);
    expect(result.isPaid).toBe(false);
  });
});
