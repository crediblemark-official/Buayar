/**
 * Regression test untuk P0 — "silent failure" yang membuat klaim
 * "ganti provider cukup ganti env" tidak sepenuhnya benar.
 *
 * Setiap test di sini gagal pada kode sebelum perbaikannya.
 */
import { describe, expect, it, afterEach, beforeEach } from "bun:test";
import { Buayar } from "../src";
import { resolveConfigFromEnv } from "../src/core/config";
import { providerRegistry } from "../src/core/providerRegistry";

const originalEnv = { ...process.env };

function withEnv(env: Record<string, string>) {
  process.env = { ...env };
}

beforeEach(() => {
  // isolate: sisihkan proses dari env host
  process.env = { NODE_ENV: "test" };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("P0-1 — konflik env provider tidak boleh diam-diam", () => {
  it("backward-compatible: PROVIDER_PG tetap menang atas BUAYAR_PROVIDER", () => {
    withEnv({ PROVIDER_PG: "midtrans", BUAYAR_PROVIDER: "stripe" });
    expect(resolveConfigFromEnv({}).provider).toBe("midtrans");
  });

  it("memberi peringatan keras saat PROVIDER_PG != BUAYAR_PROVIDER", () => {
    withEnv({ PROVIDER_PG: "midtrans", BUAYAR_PROVIDER: "stripe" });
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (m?: any) => { warnings.push(String(m)); };
    try {
      resolveConfigFromEnv({});
    } finally {
      console.warn = orig;
    }
    const joined = warnings.join("\n");
    expect(joined).toContain("PERINGATAN");
    expect(joined).toContain("PROVIDER_PG='midtrans'");
    expect(joined).toContain("BUAYAR_PROVIDER='stripe'");
    // harus menunjuk cara memperbaiki, bukan hanya Layersakehan
    expect(joined).toContain("Hapus PROVIDER_PG");
  });

  it("tidak berteriak bila kedua env konsisten atau hanya satu yang di-set", () => {
    const collect = (env: Record<string, string>): string => {
      const warnings: string[] = [];
      const orig = console.warn;
      console.warn = (m?: any) => { warnings.push(String(m)); };
      try { withEnv(env); resolveConfigFromEnv({}); } finally { console.warn = orig; }
      return warnings.join("\n");
    };
    expect(collect({ PROVIDER_PG: "midtrans", BUAYAR_PROVIDER: "midtrans" })).not.toContain("PERINGATAN");
    expect(collect({ BUAYAR_PROVIDER: "midtrans" })).not.toContain("PERINGATAN");
    expect(collect({ PROVIDER_PG: "midtrans" })).not.toContain("PERINGATAN");
  });

  it("PG_PROVIDER (legacy lain) juga memicu peringatan", () => {
    withEnv({ PG_PROVIDER: "duitku", BUAYAR_PROVIDER: "xendit" });
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (m?: any) => { warnings.push(String(m)); };
    try { resolveConfigFromEnv({}); } finally { console.warn = orig; }
    expect(warnings.join("\n")).toContain("PERINGATAN");
  });
});

describe("P0-2 — alias nama provider", () => {
  const cases: [string, string][] = [
    ["checkout.com", "checkoutcom"],
    ["checkout-com", "checkoutcom"],
    ["checkout_com", "checkoutcom"],
    ["2co", "twocheckout"],
    ["2-checkout", "twocheckout"],
    ["twoco", "twocheckout"],
    ["snap", "midtrans"],
    ["snapbni", "midtrans"],
    ["xenditpay", "xendit"],
    ["oyindonesia", "oy"],
    ["2checkout", "twocheckout"],
    ["MIDTRANS", "midtrans"],
  ];

  for (const [input, expected] of cases) {
    it(`normalize '${input}' -> '${expected}'`, () => {
      withEnv({ BUAYAR_PROVIDER: input, BUAYAR_API_KEY: "k" });
      const orig = console.warn;
      console.warn = () => {};
      try {
        expect(resolveConfigFromEnv({}).provider).toBe(expected);
      } finally {
        console.warn = orig;
      }
    });
  }

  it("alias tidak merusak nama yang sudah benar", () => {
    withEnv({ BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "k" });
    expect(resolveConfigFromEnv({}).provider).toBe("midtrans");
  });
});

describe("P0-3 — webhook credential di-scope per provider (anti kontaminasi)", () => {
  it("SISA SUMOPOD_WEBHOOK_TOKEN tidak menimpa token Xendit", () => {
    withEnv({
      BUAYAR_PROVIDER: "xendit",
      BUAYAR_API_KEY: "xnd-secret",
      BUAYAR_WEBHOOK_TOKEN: "token-xendit-asli",
      SUMOPOD_WEBHOOK_TOKEN: "token-sumopod",
    });
    const cfg = resolveConfigFromEnv({});
    expect(cfg.provider).toBe("xendit");
    expect(cfg.webhookToken).toBe("token-xendit-asli");
    expect(cfg.webhookToken).not.toBe("token-sumopod");
  });

  it("SISA STRIPE_WEBHOOK_SECRET tidak menimpa secret Checkout.com", () => {
    withEnv({
      BUAYAR_PROVIDER: "checkoutcom",
      BUAYAR_API_KEY: "cko-secret",
      BUAYAR_WEBHOOK_SECRET: "secret-checkoutcom",
      STRIPE_WEBHOOK_SECRET: "whsec_stripe",
    });
    expect(resolveConfigFromEnv({}).webhookSecret).toBe("secret-checkoutcom");
  });

  it("provider lain yang punya env spesifik tetap dipakai (tidak ada regresi)", () => {
    withEnv({ BUAYAR_PROVIDER: "xendit", BUAYAR_API_KEY: "x", XENDIT_WEBHOOK_TOKEN: "tok-x" });
    expect(resolveConfigFromEnv({}).webhookToken).toBe("tok-x");
  });

  it("XENDIT_WEBHOOK_VERIFICATION_TOKEN tetap diterima", () => {
    withEnv({ BUAYAR_PROVIDER: "xendit", BUAYAR_API_KEY: "x", XENDIT_WEBHOOK_VERIFICATION_TOKEN: "tok-v" });
    expect(resolveConfigFromEnv({}).webhookToken).toBe("tok-v");
  });

  it("Sumopod tetap memakai env-nya sendiri", () => {
    withEnv({ BUAYAR_PROVIDER: "sumopod", BUAYAR_API_KEY: "x", SUMOPOD_WEBHOOK_TOKEN: "tok-sp" });
    expect(resolveConfigFromEnv({}).webhookToken).toBe("tok-sp");
  });

  it("Sumopod sandbox memakai token sandbox", () => {
    withEnv({
      BUAYAR_PROVIDER: "sumopod",
      BUAYAR_API_KEY: "x",
      SUMOPOD_SANDBOX: "true",
      SUMOPOD_SANDBOX_WEBHOOK_TOKEN: "tok-sb",
      SUMOPOD_PRODUCTION_WEBHOOK_TOKEN: "tok-prod",
    });
    expect(resolveConfigFromEnv({}).webhookToken).toBe("tok-sb");
  });

  it("Xenith & Stripe & Razorpay memetakan secret ke provider yang benar", () => {
    withEnv({ BUAYAR_PROVIDER: "xenith", BUAYAR_API_KEY: "x", XENITH_WEBHOOK_SECRET: "wh-xenith" });
    expect(resolveConfigFromEnv({}).webhookSecret).toBe("wh-xenith");

    withEnv({ BUAYAR_PROVIDER: "razorpay", BUAYAR_API_KEY: "x", RAZORPAY_WEBHOOK_SECRET: "wh-rzp" });
    expect(resolveConfigFromEnv({}).webhookSecret).toBe("wh-rzp");
  });
});

describe("P0-4 — Square & PayPal webhook bisa dikonfigurasi via BUAYAR_*", () => {
  it("Square: BUAYAR_WEBHOOK_SIGNATURE_KEY mengisi signature key", () => {
    withEnv({
      BUAYAR_PROVIDER: "square",
      BUAYAR_API_KEY: "sq-access-token",
      BUAYAR_WEBHOOK_SIGNATURE_KEY: "sig-key",
    });
    const cfg = resolveConfigFromEnv({});
    expect(cfg.extra?.webhookSignatureKey).toBe("sig-key");
  });

  it("Square: SQUARE_WEBHOOK_SIGNATURE_KEY specific tetap menang", () => {
    withEnv({
      BUAYAR_PROVIDER: "square",
      BUAYAR_API_KEY: "sq",
      SQUARE_WEBHOOK_SIGNATURE_KEY: "specific",
      BUAYAR_WEBHOOK_SIGNATURE_KEY: "universal",
    });
    expect(resolveConfigFromEnv({}).extra?.webhookSignatureKey).toBe("specific");
  });

  it("PayPal: BUAYAR_WEBHOOK_ID mengisi webhook id", () => {
    withEnv({
      BUAYAR_PROVIDER: "paypal",
      BUAYAR_API_KEY: "secret",
      BUAYAR_CLIENT_KEY: "client-id",
      BUAYAR_WEBHOOK_ID: "WH-123",
    });
    expect(resolveConfigFromEnv({}).extra?.webhookId).toBe("WH-123");
  });

  it("PayPal: PAYPAL_WEBHOOK_ID specific tetap menang", () => {
    withEnv({
      BUAYAR_PROVIDER: "paypal",
      BUAYAR_API_KEY: "s",
      PAYPAL_WEBHOOK_ID: "specific",
      BUAYAR_WEBHOOK_ID: "universal",
    });
    expect(resolveConfigFromEnv({}).extra?.webhookId).toBe("specific");
  });
});

describe("P0-5 — autodetect tidak lagi dimatikan oleh satu sisa env", () => {
  it("sisa env provider lain dengan kredensial lebih sedikit TIDAK membatalkan deteksi", () => {
    expect(
      providerRegistry.detectFromEnv({
        MIDTRANS_SERVER_KEY: "sk",
        MIDTRANS_CLIENT_KEY: "ck",
        ADYEN_API_KEY: "AK", // sisa debugging
      })
    ).toBe("midtrans");
  });

  it("kredensial parsial yang SEJUMAH dengan kandidat atas tetap dianggap ambigu", () => {
    expect(providerRegistry.detectFromEnv({ MIDTRANS_SERVER_KEY: "sk", DUITKU_API_KEY: "dk" })).toBeUndefined();
  });

  it("dua provider lengkap dengan jumlah sama tetap ambigu", () => {
    expect(
      providerRegistry.detectFromEnv({
        DUITKU_API_KEY: "k", DUITKU_MERCHANT_CODE: "M",
        IPAYMU_API_KEY: "k", IPAYMU_MERCHANT_CODE: "M",
      })
    ).toBeUndefined();
  });

  it("hanya ada kredensial parsial -> undefined (tidak menebak)", () => {
    expect(providerRegistry.detectFromEnv({ ADYEN_API_KEY: "AK" })).toBeUndefined();
  });

  it("alias sah di REQUIRED_ENV_KEYS ikut recognized", () => {
    expect(providerRegistry.detectFromEnv({ IPAYMU_API_KEY: "k", IPAYMU_MERCHANT_CODE: "M" })).toBe("ipaymu");
    expect(providerRegistry.detectFromEnv({ DOKU_CLIENT_ID: "c", DOKU_API_KEY: "k" })).toBe("doku");
    expect(providerRegistry.detectFromEnv({ PRISMALINK_MERCHANT_ID: "m", PRISMALINK_API_KEY: "k" })).toBe("prismalink");
    expect(providerRegistry.detectFromEnv({ NICEPAY_IMID: "i", NICEPAY_SECRET_KEY: "k" })).toBe("nicepay");
    expect(providerRegistry.detectFromEnv({ FASPAY_MERCHANT_ID: "m", FASPAY_USER_ID: "u", FASPAY_API_KEY: "k" })).toBe("faspay");
    expect(providerRegistry.detectFromEnv({ STRIPE_KEY: "sk_test_x" })).toBe("stripe");
  });

  it("kredensial BUAYAR_* universal tetap tidak ditebak (-tetap wajib BUAYAR_PROVIDER)", () => {
    expect(
      providerRegistry.detectFromEnv({ BUAYAR_API_KEY: "s", BUAYAR_MERCHANT_CODE: "m", BUAYAR_CLIENT_KEY: "c" })
    ).toBeUndefined();
  });
});

describe("P0-6 — setConfig() tidak boleh memakai kredensial provider lama", () => {
  it("ganti provider membuang apiKey provider sebelumnya", () => {
    withEnv({ BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "sk-midtrans", BUAYAR_SANDBOX: "true" });
    const b = new Buayar();
    expect(b.getConfig().apiKey).toBe("sk-midtrans");

    // Xendit dikonfigurasi lewat env juga
    process.env.BUAYAR_PROVIDER = "xendit";
    process.env.BUAYAR_API_KEY = "xnd-secret";
    b.setConfig({ provider: "xendit" });

    expect(b.provider).toBe("xendit");
    expect(b.getConfig().apiKey).toBe("xnd-secret");
    expect(b.getConfig().apiKey).not.toBe("sk-midtrans");
  });

  it("ganti provider membuang webhook token provider sebelumnya", () => {
    withEnv({
      BUAYAR_PROVIDER: "xendit",
      BUAYAR_API_KEY: "x",
      BUAYAR_WEBHOOK_TOKEN: "token-xendit",
      BUAYAR_SANDBOX: "true",
    });
    const b = new Buayar();
    expect(b.getConfig().webhookToken).toBe("token-xendit");

    process.env.BUAYAR_PROVIDER = "sumopod";
    process.env.BUAYAR_API_KEY = "sp";
    process.env.SUMOPOD_WEBHOOK_TOKEN = "token-sumopod";
    b.setConfig({ provider: "sumopod" });

    expect(b.getConfig().webhookToken).toBe("token-sumopod");
  });

  it("extra yang diwarisi tidak menimpa env provider baru", () => {
    withEnv({ BUAYAR_PROVIDER: "xendit", BUAYAR_API_KEY: "x", BUAYAR_SANDBOX: "true" });
    const b = new Buayar();
    process.env.BUAYAR_PROVIDER = "stripe";
    process.env.BUAYAR_API_KEY = "sk_test_new";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_new";
    b.setConfig({ provider: "stripe" });
    expect(b.getConfig().webhookSecret).toBe("whsec_new");
  });

  it("setConfig({}) tanpa patch provider TIDAK menebak provider baru dari env", () => {
    // Kontrak yang disepakati: `setConfig` tidak pernah mengganti provider di
    // belakang caller. Config eksplisit yang sudah aktif tetap menang atas env,
    // sama seperti `config.provider` di `resolveConfigFromEnv`. Untuk pindah
    // provider, pemanggil harus menyebut namanya.
    withEnv({ BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "sk-mid", BUAYAR_SANDBOX: "true" });
    const b = new Buayar();
    process.env.BUAYAR_PROVIDER = "duitku";
    process.env.BUAYAR_API_KEY = "dk-key";
    b.setConfig({});
    expect(b.provider).toBe("midtrans");
    expect(b.getConfig().apiKey).toBe("sk-mid");
  });

  it("kredensial non-kredensial bisa di-update tanpa menyebut provider", () => {
    withEnv({ BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "sk-mid", BUAYAR_SANDBOX: "true" });
    const b = new Buayar();
    b.setConfig({ callbackUrl: "https://baru.test/cb" });
    expect(b.getConfig().callbackUrl).toBe("https://baru.test/cb");
    expect(b.provider).toBe("midtrans");
    expect(b.getConfig().apiKey).toBe("sk-mid");
  });

  it("preferensi non-kredensial (sandbox, callbackUrl) dipertahankan", () => {
    withEnv({ BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "sk", BUAYAR_CALLBACK_URL: "https://a.test/cb" });
    const b = new Buayar();
    b.setConfig({ provider: "xendit" });
    expect(b.getConfig().callbackUrl).toBe("https://a.test/cb");
  });
});

describe("P6 — BUAYAR_EXTRA_* membuat knob provider terjangkau tanpa edit kode", () => {
  it("BUAYAR_EXTRA_SNAP=true -> extra.snap === true (boolean, bukan string)", () => {
    withEnv({ BUAYAR_PROVIDER: "doku", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_SNAP: "true" });
    expect(resolveConfigFromEnv({}).extra?.snap).toBe(true);
  });

  it("SNAKE_CASE dikonversi ke camelCase", () => {
    withEnv({ BUAYAR_PROVIDER: "adyen", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_COUNTRY_CODE: "ID" });
    expect(resolveConfigFromEnv({}).extra?.countryCode).toBe("ID");
  });

  it("nilai non-boolean tetap string", () => {
    withEnv({ BUAYAR_PROVIDER: "adyen", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_SHOPPER_LOCALE: "id-ID" });
    expect(resolveConfigFromEnv({}).extra?.shopperLocale).toBe("id-ID");
  });

  it("'false'/'0'/'' menjadi boolean false, BUKAN string truthy", () => {
    for (const v of ["false", "0", ""]) {
      withEnv({ BUAYAR_PROVIDER: "doku", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_SNAP: v });
      const snap = resolveConfigFromEnv({}).extra?.snap;
      expect(snap, `BUAYAR_EXTRA_SNAP="${v}"`).toBe(false);
      if (snap) throw new Error(`BUAYAR_EXTRA_SNAP="${v}" truthy — akan menyalakan feature yang tidak diinginkan`);
    }
  });

  it("'true'/'1' menjadi boolean true", () => {
    for (const v of ["true", "1"]) {
      withEnv({ BUAYAR_PROVIDER: "doku", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_SNAP: v });
      expect(resolveConfigFromEnv({}).extra?.snap, v).toBe(true);
    }
  });

  it("customConfig.extra eksplisit tetap menang atas BUAYAR_EXTRA_*", () => {
    withEnv({ BUAYAR_PROVIDER: "doku", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_SNAP: "true" });
    expect(resolveConfigFromEnv({ extra: { snap: false } }).extra?.snap).toBe(false);
  });

  it("BUAYAR_EXTRA_ tanpa nama diabaikan", () => {
    withEnv({ BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "k", BUAYAR_EXTRA_: "x" });
    expect(resolveConfigFromEnv({}).extra?._).toBeUndefined();
  });
});

describe("P7 — checkTransaction: identifier tidak boleh harus dihafal per provider", () => {
  const params = { orderId: "O-1", amount: 1000, productDetails: "x", customer: { name: "T", email: "t@t.co" } };

  function captureFetch() {
    const sent: any[] = [];
    (globalThis as any).fetch = async (url: string, init: any) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return { ok: true, status: 200, json: async () => ({ transaction_status: "settlement" }), text: async () => '{"transaction_status":"settlement"}' };
    };
    return sent;
  }

  it("merchantOrderId saja tetap berfungsi (backward compatible)", async () => {
    const sent = captureFetch();
    const b = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-x" });
    const r = await b.checkTransaction({ merchantOrderId: "ORDER-1" });
    expect(r.success).toBe(true);
    expect(String(sent[0].url)).toContain("ORDER-1");
  });

  it("transactionId saja diterima untuk provider non-iPaymu", async () => {
    const sent = captureFetch();
    const b = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-x" });
    const r = await b.checkTransaction({ transactionId: "ORDER-2" });
    expect(r.success).toBe(true);
    expect(String(sent[0].url)).toContain("ORDER-2");
  });

  it("iPaymu memakai transactionId (ID dari PG), bukan orderId merchant", async () => {
    const sent = captureFetch();
    const b = new Buayar({ provider: "ipaymu", apiKey: "SANDBOXKEY", merchantCode: "0000001411234567" });
    // Nilai dari createInvoice iPaymu: TransactionId numerik milik iPaymu
    await b.checkTransaction({ transactionId: "998877" });
    expect(sent[0].body.transactionId).toBe("998877");
  });

  it("menolak dengan pesan yang bisa ditindaklanjuti bila tanpa identifier", async () => {
    const b = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-x" });
    const r = await b.checkTransaction({} as any);
    expect(r.success).toBe(false);
    expect(r.error).toContain("merchantOrderId");
    expect(r.error).toContain("transactionId");
    expect(r.error).toContain("iPaymu");
  });

  it("identifier kosong string dianggap tidak ada", async () => {
    const b = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-x" });
    const r = await b.checkTransaction({ merchantOrderId: "   ", transactionId: "" } as any);
    expect(r.success).toBe(false);
  });

  it("params asli tidak dimutasi (side-effect free)", async () => {
    captureFetch();
    const b = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-x" });
    const p = { transactionId: "X-1" };
    await b.checkTransaction(p);
    expect(p).toEqual({ transactionId: "X-1" });
  });
});
