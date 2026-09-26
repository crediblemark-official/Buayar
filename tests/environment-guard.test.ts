/**
 * Regresi untuk fail-safe "sandbox: true" pada provider yang tidak memisahkan
 * test dan live lewat hostname.
 *
 * Xendit dan Stripe memakai **satu host** untuk keduanya:
 *
 *   Xendit · `api.xendit.co`  → `xnd_development_…` vs `xnd_production_…`
 *   Stripe · `api.stripe.com` → `sk_test_…`        vs `sk_live_…`
 *
 * Artinya `sandbox: true` **tidak mengubah satu byte pun** dari request yang
 * dikirim ke kedua provider itu. Merchant yang menyalakan `sandbox: true` sambil
 * menempelkan kunci `sk_live_…` akan tetap menagih kartu sungguhan tanpa satu
 * pun peringatan, dan karena tagihan tetap masuk, webhook tetap terkirim,
 * kegagalan ini nyaris tak terdeteksi belakangan.
 *
 * Guard yang diuji menolak konfigurasi itu SEBELUM request apa pun keluar —
 * dibuktikan dengan `requestDikirim` yang harus tetap 0.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { Buayar } from "../src";
import { assertKeyMatchesEnvironment, STRIPE_KEY_RULE, XENDIT_KEY_RULE } from "../src/utils/environment";

const ORIGINAL_FETCH = globalThis.fetch;

/** Berapa kali request benar-benar keluar ke jaringan. */
let requestDikirim = 0;

function mockFetch() {
  requestDikirim = 0;
  globalThis.fetch = (async () => {
    requestDikirim++;
    return new Response(JSON.stringify({ status: "200", data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

const PEMBELI = { name: "T", email: "t@example.com", phone: "08123456789" };

/**
 * PENTING: guard ini melempar exception, bukan mengembalikan `{success:false}`.
 *
 * Itu disengaja dan konsisten dengan pre-flight K5 (payment method tidak
 * didukung) yang juga melempar. Alasannya: kesalahan konfigurasi berlaku untuk
 * SETIAP request berikutnya, bukan cuma yang satu ini. Kalau dikembalikan
 * sebagai `success: false`, pemanggil yang hanya memeriksa status HTTP yang
 * mereka bangun sendiri akan tetap menganggap transaksi berjalan — dan untuk
 * `sk_live_` yang berarti menagih kartu sungguhan berulang kali.
 */
async function buatInvoice(config: any, paymentMethod: string) {
  const buayar = new Buayar(config);
  return buayar.createInvoice({
    orderId: "ENV-GUARD-1",
    amount: 10000,
    // Midtrans mewajibkan productDetails; tanpa ini error-nya datang dari
    // Midtrans, bukan dari guard yang sedang diuji.
    productDetails: "ENV-GUARD-TEST",
    paymentMethod,
    customer: PEMBELI,
  } as any);
}

/** Hasil pemanggilan yang memisahkan "lempar" dari "kembalikan". */
async function coba(config: any, paymentMethod: string) {
  try {
    return { threw: false as const, result: (await buatInvoice(config, paymentMethod)) as any };
  } catch (e: any) {
    return { threw: true as const, error: e };
  }
}

describe("Guard environment — Stripe & Xendit hanya beda lewat API key", () => {
  // ── Harus DITOLAK: flag sandbox bertentangan dengan kunci ────────────────
  const harusDitolak: Array<[string, any, string]> = [
    ["Stripe: sandbox: true + sk_live_", { provider: "stripe", apiKey: "sk_live_abc123", sandbox: true }, "credit_card"],
    ["Stripe: sandbox: true + rk_live_ (restricted key)", { provider: "stripe", apiKey: "rk_live_abc123", sandbox: true }, "credit_card"],
    ["Stripe: sandbox: false + sk_test_", { provider: "stripe", apiKey: "sk_test_abc123", sandbox: false }, "credit_card"],
    ["Xendit: sandbox: true + xnd_production_", { provider: "xendit", apiKey: "xnd_production_abc123", sandbox: true }, "bca_va"],
    ["Xendit: sandbox: false + xnd_development_", { provider: "xendit", apiKey: "xnd_development_abc123", sandbox: false }, "bca_va"],
  ];

  for (const [label, config, paymentMethod] of harusDitolak) {
    it(`menolak ${label}`, async () => {
      mockFetch();
      const { threw, error } = await coba(config, paymentMethod);
      expect(threw).toBe(true);
      expect(error.message).toBeTruthy();
      // Yang paling penting: tidak ada request yang sempat keluar.
      expect(requestDikirim).toBe(0);
    });
  }

  // ── Harus LOLOS: flag dan kunci sudah cocok ──────────────────────────────
  const harusLolos: Array<[string, any, string]> = [
    ["Stripe: sandbox: true + sk_test_", { provider: "stripe", apiKey: "sk_test_abc123", sandbox: true }, "credit_card"],
    ["Stripe: sandbox: true + rk_test_", { provider: "stripe", apiKey: "rk_test_abc123", sandbox: true }, "credit_card"],
    ["Stripe: sandbox: false + sk_live_", { provider: "stripe", apiKey: "sk_live_abc123", sandbox: false }, "credit_card"],
    ["Xendit: sandbox: true + xnd_development_", { provider: "xendit", apiKey: "xnd_development_abc123", sandbox: true }, "bca_va"],
    ["Xendit: sandbox: false + xnd_production_", { provider: "xendit", apiKey: "xnd_production_abc123", sandbox: false }, "bca_va"],
  ];

  for (const [label, config, paymentMethod] of harusLolos) {
    it(`melewatkan ${label}`, async () => {
      mockFetch();
      const { threw, error } = await coba(config, paymentMethod);
      expect(threw).toBe(false);
      expect(requestDikirim).toBeGreaterThan(0);
    });
  }
});

describe("Guard environment — jangan menolak integrasi yang sah", () => {
  it("kunci tanpa prefix baku (proxy / reseller) tetap diteruskan", async () => {
    // Kunci dari proxy atau self-hosted gateway tidak punya prefix Stripe/Xendit
    // yang baku. Menolaknya akan mematikan integrasi yang sah — jadi prefix
    // yang tidak dikenal harus dibiarkan lewat.
    mockFetch();
    const { threw } = await coba(
      { provider: "stripe", apiKey: "kunci-proxy-saya", sandbox: true },
      "credit_card",
    );
    expect(threw).toBe(false);
    expect(requestDikirim).toBeGreaterThan(0);
  });

  it("prefix yang dikenal tapi cocok dengan flag tidak ditolak", async () => {
    expect(() =>
      assertKeyMatchesEnvironment("Stripe", "sk_test_x", true, STRIPE_KEY_RULE),
    ).not.toThrow();
    expect(() =>
      assertKeyMatchesEnvironment("Stripe", "sk_live_x", false, STRIPE_KEY_RULE),
    ).not.toThrow();
  });

  it("kunci kosong atau sandbox tidak ditentukan tidak ditebak-tebak", async () => {
    expect(() => assertKeyMatchesEnvironment("Stripe", "", true, STRIPE_KEY_RULE)).not.toThrow();
    expect(() =>
      assertKeyMatchesEnvironment("Stripe", "sk_live_x", undefined, STRIPE_KEY_RULE),
    ).not.toThrow();
  });

  it("provider yang punya host sandbox sendiri tidak ikut terpengaruh", async () => {
    // Midtrans/Prismalink memisahkan lewat hostname, jadi flag sudah cukup dan
    // tidak ada prefix yang perlu diperiksa.
    mockFetch();
    const { threw } = await coba(
      { provider: "midtrans", apiKey: "apapun", sandbox: true },
      "qris",
    );
    expect(threw).toBe(false);
    expect(requestDikirim).toBeGreaterThan(0);
  });
});

describe("Guard environment — pesan error harus bisa ditindaklanjuti", () => {
  it("menyebut provider, kedua environment, dan cara memperbaiki", () => {
    let pesan = "";
    try {
      assertKeyMatchesEnvironment("Stripe", "sk_live_RAHASIA", true, STRIPE_KEY_RULE);
    } catch (e: any) {
      pesan = e.message;
    }
    expect(pesan).toContain("Stripe");
    expect(pesan).toContain("sandbox: true");
    expect(pesan).toContain("test");
    // Tidak boleh membocorkan kunci ke log.
    expect(pesan).not.toContain("RAHASIA");
    expect(pesan).not.toContain("sk_live_RAHASIA");
  });

  it("memberi tahu bahwa uang sungguhan akan bergerak", () => {
    let pesan = "";
    try {
      assertKeyMatchesEnvironment("Xendit", "xnd_production_RAHASIA", true, XENDIT_KEY_RULE);
    } catch (e: any) {
      pesan = e.message;
    }
    expect(pesan).toContain("Xendit");
    expect(pesan).not.toContain("RAHASIA");
  });
});

describe("Guard environment — berlaku di operasi selain createInvoice", () => {
  it("checkTransaction juga menolak kunci yang bertentangan", async () => {
    mockFetch();
    const buayar = new Buayar({
      provider: "stripe",
      apiKey: "sk_live_abc123",
      sandbox: true,
    });
    let dilempar = false;
    try {
      await buayar.checkTransaction({ merchantOrderId: "pi_123" } as any);
    } catch {
      dilempar = true;
    }
    expect(dilempar).toBe(true);
    expect(requestDikirim).toBe(0);
  });

  it("checkTransaction Xendit juga menolak", async () => {
    mockFetch();
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_production_abc123",
      sandbox: true,
    });
    let dilempar = false;
    try {
      await buayar.checkTransaction({ merchantOrderId: "inv_123" } as any);
    } catch {
      dilempar = true;
    }
    expect(dilempar).toBe(true);
    expect(requestDikirim).toBe(0);
  });
});
