/**
 * Fail-safe untuk provider yang TIDAK memisahkan test dan live lewat hostname.
 *
 * Sebagian besar provider punya dua host: `api-sandbox.…` untuk test dan
 * `api.…` untuk produksi, jadi `sandbox: true` sudah cukup menentukan tujuan
 * jaringan. Tapi sebagian kecil tidak — Xendit dan Stripe memakai **satu host
 * yang sama** untuk keduanya; yang membedakan hanya API key:
 *
 *   Xendit · `api.xendit.co`  → `xnd_development_…` vs `xnd_production_…`
 *   Stripe · `api.stripe.com` → `sk_test_…`        vs `sk_live_…`
 *
 * Akibatnya pada dua provider itu `sandbox: true` **bukan** sakelar
 * keamanan — dia tidak mengubah satu byte pun dari request yang dikirim. Kalau
 * merchant mengisi kunci live sambil menyalakan `sandbox: true`, library ini
 * akan tetap Lorenaah menagih kartu sungguhan tanpa satu pun peringatan. Itu
 * kegagalan yang mahal dan sangat sulit dideteksi belakangan, karena tagihan
 * tetap masuk dan webhook tetap terkirim.
 *
 * Yang dikembalikan helper ini adalah error yang menolak SEBELUM request
 * apa pun keluar. Prinsipnya:
 *
 *   • Prefix dikenali dan bertentangan dengan flag  → tolak keras.
 *   • Prefix tidak dikenali                            → biarkan lewat.
 *
 * Baris kedua penting. Kunci dari proxy, reseller, atau self-hosted gateway
 * tidak punya prefix Stripe/Xendit yang baku; menolaknya akan mematikan
 * integrasi yang sah. Yang salah di sini adalah *prefix yang jelas-jelas milik
 * environment lain*, bukan bentuk kuncinya.
 *
 * Catatan keamanan: pesan error sengaja hanya menyebut prefix, tidak pernah
 * kunci penuh, supaya tidak bocor ke log.
 */

/** Aturan pemetaan prefix API key ke environment. */
export interface KeyEnvironmentRule {
  /** Prefix kunci untuk mode test/sandbox. */
  testPrefixes: readonly string[];
  /** Prefix kunci untuk mode produksi. */
  livePrefixes: readonly string[];
  /** Nama environment produksi untuk pesan error. */
  liveLabel: string;
  /** Nama environment test untuk pesan error. */
  testLabel: string;
}

/** Aturan untuk Stripe. Restricted key (`rk_`) juga dipakai di produksi. */
export const STRIPE_KEY_RULE: KeyEnvironmentRule = {
  testPrefixes: ["sk_test_", "rk_test_"],
  livePrefixes: ["sk_live_", "rk_live_"],
  testLabel: "test",
  liveLabel: "live",
};

/** Aturan untuk Xendit. */
export const XENDIT_KEY_RULE: KeyEnvironmentRule = {
  testPrefixes: ["xnd_development_"],
  livePrefixes: ["xnd_production_"],
  testLabel: "development (test)",
  liveLabel: "production",
};

/**
 * Menolak konfigurasi yang menyalakan `sandbox: true` dengan kunci produksi
 * (atau sebaliknya) untuk provider yang hanya memisahkan lewat kunci.
 *
 * Tidak melempar apa pun bila:
 *   • `sandbox` tidak ditentukan — menebak environment lebih buruk daripada
 *     membiarkan provider yang memutuskan, dan flag mungkin sengaja diabaikan.
 *   • Kunci kosong — itu urusan validasi kredensial lain.
 *   • Prefix kunci tidak dikenal — lihat catatan di atas soal proxy/reseller.
 */
export function assertKeyMatchesEnvironment(
  provider: string,
  apiKey: string | undefined,
  sandbox: boolean | undefined,
  rule: KeyEnvironmentRule,
): void {
  if (typeof sandbox !== "boolean" || !apiKey) return;

  const isTest = rule.testPrefixes.some((prefix) => apiKey.startsWith(prefix));
  const isLive = rule.livePrefixes.some((prefix) => apiKey.startsWith(prefix));

  // Prefix tidak dikenal -> biarkan lewat.
  if (isTest === isLive) return;

  const keyLooksLive = isLive;
  const mismatched = sandbox === keyLooksLive;

  if (!mismatched) return;

  const keyIs = keyLooksLive ? rule.liveLabel : rule.testLabel;
  const flagIs = sandbox ? "sandbox: true" : "sandbox: false";
  const wanted = sandbox ? rule.testLabel : rule.liveLabel;

  throw new Error(
    `${provider}: API key bertanda '${keyIs}' tapi konfigurasi memakai ${flagIs}. ` +
      `${provider} memakai satu host untuk test dan produksi, jadi host tidak bisa ` +
      `membedakan keduanya — yang membedakan hanya API key. Permintaan ini akan ` +
      `${keyLooksLive ? "menagih ENVIRONMENT ASLI" : "ditolak provider"}` +
      `${keyLooksLive ? " dan uang sungguhan akan bergerak" : ""}. ` +
      `Gunakan API key ${wanted}, atau set ${flagIs === "sandbox: true" ? "sandbox: false" : "sandbox: true"} untuk mencocokkan kuncinya.`,
  );
}
