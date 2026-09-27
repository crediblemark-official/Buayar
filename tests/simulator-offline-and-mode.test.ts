/**
 * P4 + P5 — normalisasi response & simulator offline penuh.
 *
 * P4: `mode` hanya diisi 6/21 provider, sehingga `if (inv.mode === "va")` diam-diam
 *      gagal di 15 provider lain. Manager kini mengisinya secara terpusat.
 * P5: `BUAYAR_SIMULATE=1` masih menembak jaringan di `getPaymentMethods`,
 *      `probePaymentMethods`, dan 3 operasi VA DOKU.
 *
 * Setiap test di sini bergantung pada fetch yang MELEDAKI — kalau ada satu saja
 * yang lolos ke jaringan, test gagal. Ituptnya jaminan "simulator tanpa PG".
 */
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Buayar } from "../src";
import { simulatorEngine } from "../src/simulator";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

let networkHits: string[] = [];

/** Fail keras kalau ada kode yang ternyata menembak jaringan. */
function forbidNetwork() {
  networkHits = [];
  (globalThis as any).fetch = async (url: string) => {
    networkHits.push(String(url));
    throw new Error(`NETWORK LEAK in simulate mode: ${url}`);
  };
}

beforeEach(() => {
  process.env = { NODE_ENV: "test", BUAYAR_SIMULATE: "1", BUAYAR_SANDBOX: "true" };
  forbidNetwork();
});

afterEach(() => {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
});

const CUSTOMER = { name: "Tester", email: "t@example.com" };

function active(extra: Record<string, string> = {}): Buayar {
  Object.assign(process.env, { BUAYAR_PROVIDER: "midtrans", BUAYAR_API_KEY: "SB-Mid-server-x" }, extra);
  return new Buayar();
}

describe("P4 — `mode` diisi di semua provider, bukan hanya 6", () => {
  // Dipilih method yang memang didukung provider tsb — kombinasinya nyata,
  // bukan menguji pre-flight rejection.
  const CASES: [string, Record<string, string>, any][] = [
    ["midtrans", { BUAYAR_API_KEY: "SB-Mid-server-x" }, "bca_va"],
    ["duitku", { BUAYAR_API_KEY: "k", BUAYAR_MERCHANT_CODE: "M" }, "bca_va"],
    ["xendit", { BUAYAR_API_KEY: "xnd_development_x" }, "bca_va"],
    ["doku", { BUAYAR_API_KEY: "s", BUAYAR_MERCHANT_ID: "M", BUAYAR_CLIENT_KEY: "c" }, "bca_va"],
    ["ipaymu", { BUAYAR_API_KEY: "k", BUAYAR_MERCHANT_CODE: "M" }, "bca_va"],
    ["sumopod", { BUAYAR_API_KEY: "k" }, "qris"],
    ["stripe", { BUAYAR_API_KEY: "sk_test_x" }, "credit_card"],
  ];

  for (const [provider, env, method] of CASES) {
    it(`${provider} selalu mengembalikan mode yang terisi`, async () => {
      const b = active({ BUAYAR_PROVIDER: provider, ...env });
      const res = await b.createInvoice({
        orderId: "O-1", amount: 25000, productDetails: "x",
        customer: CUSTOMER, paymentMethod: method,
      });
      expect(res.success, res.error).toBe(true);
      expect(res.mode, `${provider} harus punya mode`).toBeDefined();
      expect(typeof res.mode).toBe("string");
    });
  }

  it("pre-flight tetap menolak method yang memang tidak didukung", async () => {
    const b = active({ BUAYAR_PROVIDER: "sumopod", BUAYAR_API_KEY: "k" });
    const res = await b.createInvoice({
      orderId: "O-x", amount: 1000, productDetails: "x",
      customer: CUSTOMER, paymentMethod: "bca_va",
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("not supported");
  });

  it("tanpa paymentMethod, mode tetap terisi (kategori kanal hasil PG)", async () => {
    const b = active();
    const res = await b.createInvoice({
      orderId: "O-2", amount: 25000, productDetails: "x", customer: CUSTOMER,
    });
    expect(res.success).toBe(true);
    expect(res.mode).toBeDefined();
  });
});

describe("P5 — BUAYAR_SIMULATE=1 tidak boleh menembak jaringan", () => {
  it("getPaymentMethods offline", async () => {
    const b = active();
    const res = await b.getPaymentMethods({ amount: 10000 });
    expect(res.success).toBe(true);
    expect(res.methods.length).toBeGreaterThan(0);
    expect(networkHits).toEqual([]);
  });

  it("probePaymentMethods offline dan ditandai static", async () => {
    const b = active();
    const res = await b.probePaymentMethods();
    expect(res.success).toBe(true);
    expect(res.source).toBe("static");
    expect(res.enabled.length).toBeGreaterThan(0);
    expect(networkHits).toEqual([]);
  });

  it("probePaymentMethods offline untuk provider yang punya probe live (DOKU)", async () => {
    const b = active({ BUAYAR_PROVIDER: "doku" });
    const res = await b.probePaymentMethods();
    expect(res.success).toBe(true);
    expect(res.source).toBe("static");
    expect(networkHits).toEqual([]);
  });

  it("getPaymentMethods menandai sumber sebagai static (bukan live)", async () => {
    const b = active();
    const res = await b.getPaymentMethods({ amount: 10000 });
    expect((res.rawResponse as any).source).toBe("static");
    expect((res.rawResponse as any).simulated).toBe(true);
  });

  it("katalog simulator tidak mengarang fee atau logo", async () => {
    const b = active();
    const res = await b.getPaymentMethods({ amount: 10000 });
    for (const m of res.methods) {
      expect(m.paymentImage).toBe("");
      expect(m.totalFee).toBe("");
      expect(m.category).toBeTruthy();
    }
  });

  it("3 operasi VA (DOKU-only) jadi offline, bukan tembak API DOKU", async () => {
    const b = active({ BUAYAR_PROVIDER: "doku" });
    const upd = await b.updateVirtualAccount({ orderId: "O-3", vaNumber: "123", bank: "bca" });
    expect(upd.success).toBe(true);

    const del = await b.deleteVirtualAccount({ orderId: "O-3", vaNumber: "123" });
    expect(del.success).toBe(true);

    const val = await b.validateBankAccount({ bankCode: "BCA", accountNumber: "123456" });
    expect(val.success).toBe(true);
    expect(val.accountHolderName).toBeTruthy();

    expect(networkHits).toEqual([]);
  });

  it("createInvoice + checkTransaction + refund + balance + disburse semuanya offline", async () => {
    const b = active();
    await b.createInvoice({ orderId: "O-4", amount: 1000, productDetails: "x", customer: CUSTOMER });
    await b.checkTransaction({ merchantOrderId: "O-4" });
    await b.refund({ transactionId: "T-1", amount: 1000 });
    await b.checkBalance();
    await b.disburse({ externalId: "D-1", bankCode: "BCA", accountNumber: "1", amount: 1000 });
    expect(networkHits).toEqual([]);
  });

  it("simulate=false tetap memanggil PG (mode live tidak ikut dipotong)", async () => {
    delete process.env.BUAYAR_SIMULATE;
    // Xendit: getPaymentMethods-nya benar-benar memanggil API channel.
    const b = active({ BUAYAR_PROVIDER: "xendit", BUAYAR_API_KEY: "xnd_development_x" });
    expect(b.getConfig().simulate).toBe(false);
    (globalThis as any).fetch = async (url: string) => {
      networkHits.push(String(url));
      return { ok: true, status: 200, json: async () => [], text: async () => "[]" };
    };
    await b.getPaymentMethods({ amount: 10000 });
    expect(networkHits.length).toBeGreaterThan(0);
  });

  it("provider dengan katalog statis (Midtrans) tetap offline walau simulate=false", async () => {
    // Memastikan test di atas benar-benar membedakan "butuh network" vs "tidak".
    delete process.env.BUAYAR_SIMULATE;
    const b = active();
    (globalThis as any).fetch = async (url: string) => {
      networkHits.push(String(url));
      throw new Error("should not be called");
    };
    const res = await b.getPaymentMethods({ amount: 10000 });
    expect(res.success).toBe(true);
    expect(networkHits).toEqual([]);
  });
});

describe("P5 — simulator tidak mengarang channel", () => {
  it("getPaymentMethods simulator hanya berisi method dari katalog provider", async () => {
    const res = await simulatorEngine.getPaymentMethods(
      "sumopod",
      { amount: 1000 },
      { simulate: true } as any,
    );
    // sumopod hanya punya 5 method kanonik — jangan menambahkan yang lain
    expect(res.methods.length).toBe(5);
  });

  it("probe simulator konsisten dengan getPaymentMethods simulator", async () => {
    const methods = await simulatorEngine.getPaymentMethods("midtrans", { amount: 1 }, { simulate: true } as any);
    const probe = await simulatorEngine.probePaymentMethods("midtrans", { simulate: true } as any);
    expect(probe.enabled.sort()).toEqual(methods.methods.map((m) => m.paymentMethod).sort());
  });
});
