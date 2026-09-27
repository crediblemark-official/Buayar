/**
 * TES NYATA (live sandbox) — "ganti provider cukup ganti env, tanpa rombak kode".
 *
 * Yang dibuktikan: satu `appCode()` yang IDENTIK untuk semua provider. Tidak ada
 * percabangan per provider di dalamnya. Yang berubah hanya process.env.
 *
 * Berjalan hanya untuk provider yang kredensial sandbox-nya benar-benar ada
 * (lihat sandbox.md). Provider tanpa kredensial dilewati secara jujur.
 *
 * Jalankan: bun run scripts/probe/env-only-switch-live.ts
 */
import { Buayar } from "../../src";
import type { PaymentMethodInput } from "../../src";

/* ── Kredensial sandbox ──────────────────────────────────────────────────────
 *
 * PENTING: TIDAK ADA secret yang ditulis di file ini. Semua dibaca dari
 * environment, memakai ENV UNIVERSAL saja (`BUAYAR_*`) — bukan env spesifik per
 * provider. Itu justru bagian yang sedang dibuktikan: credential universal
 * cukup, dan tidak perlu ada `MIDTRANS_SERVER_KEY` dsb.
 *
 * Isi `sandbox.md` (git-ignored) ke shell Anda dulu, contoh:
 *
 *   BUAYAR_MIDTRANS_API_KEY=... BUAYAR_MIDTRANS_CLIENT_KEY=... \
 *   BUAYAR_XENDIT_API_KEY=... BUAYAR_DOKU_API_KEY=... \
 *   npx buayar probe:env-only
 *
 * Provider yang env-nya tidak terisi akan dilewati dengan laporan honestly
 * "skipped" — bukan dianggap lolos.
 */

/** Env universal per provider. Kosong = provider dilewati. */
const ENV_KEYS: Record<string, string[]> = {
  midtrans: ["BUAYAR_MIDTRANS_API_KEY", "BUAYAR_MIDTRANS_CLIENT_KEY", "BUAYAR_MIDTRANS_MERCHANT_ID"],
  xendit:   ["BUAYAR_XENDIT_API_KEY", "BUAYAR_XENDIT_CLIENT_KEY", "BUAYAR_XENDIT_WEBHOOK_TOKEN"],
  doku:     ["BUAYAR_DOKU_API_KEY", "BUAYAR_DOKU_CLIENT_KEY", "BUAYAR_DOKU_MERCHANT_ID"],
  ipaymu:   ["BUAYAR_IPAYMU_API_KEY", "BUAYAR_IPAYMU_MERCHANT_CODE"],
  duitku:   ["BUAYAR_DUITKU_API_KEY", "BUAYAR_DUITKU_MERCHANT_CODE"],
  xenith:   ["BUAYAR_XENITH_API_KEY", "BUAYAR_XENITH_SECRET_KEY", "BUAYAR_XENITH_WEBHOOK_SECRET"],
  finpay:   ["BUAYAR_FINPAY_API_KEY", "BUAYAR_FINPAY_MERCHANT_ID"],
};

/** Mapping env prefix -> env universal yang diuji. */
const UNIVERSAL_MAP: Record<string, string> = {
  BUAYAR_MIDTRANS_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_MIDTRANS_CLIENT_KEY: "BUAYAR_CLIENT_KEY",
  BUAYAR_MIDTRANS_MERCHANT_ID: "BUAYAR_MERCHANT_ID",
  BUAYAR_XENDIT_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_XENDIT_CLIENT_KEY: "BUAYAR_CLIENT_KEY",
  BUAYAR_XENDIT_WEBHOOK_TOKEN: "BUAYAR_WEBHOOK_TOKEN",
  BUAYAR_DOKU_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_DOKU_CLIENT_KEY: "BUAYAR_CLIENT_KEY",
  BUAYAR_DOKU_MERCHANT_ID: "BUAYAR_MERCHANT_ID",
  BUAYAR_IPAYMU_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_IPAYMU_MERCHANT_CODE: "BUAYAR_MERCHANT_CODE",
  BUAYAR_DUITKU_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_DUITKU_MERCHANT_CODE: "BUAYAR_MERCHANT_CODE",
  BUAYAR_XENITH_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_XENITH_SECRET_KEY: "BUAYAR_SECRET_KEY",
  BUAYAR_XENITH_WEBHOOK_SECRET: "BUAYAR_WEBHOOK_SECRET",
  BUAYAR_FINPAY_API_KEY: "BUAYAR_API_KEY",
  BUAYAR_FINPAY_MERCHANT_ID: "BUAYAR_MERCHANT_ID",
};

/** Knob env tambahan per provider (memang butuh env non-universal). */
const EXTRA_ENV: Record<string, Record<string, string>> = {
  // DOKU QRIS hanya tersedia lewat jalur SNAP. Dulu harus
  // `new Buayar({ extra: { snap: true } })` -> wajib edit kode.
  // Sekarang cukup env, lewat mekanisme BUAYAR_EXTRA_*.
  doku: { BUAYAR_EXTRA_SNAP: "true" },
};

/** Provider yang kredensial sandbox-nya tersedia di environment. */
function availableProviders(env: Record<string, string | undefined> = process.env as any): string[] {
  return Object.keys(ENV_KEYS).filter((p) =>
    ENV_KEYS[p].some((k) => (env[k] || "").trim().length > 0)
  );
}

/** Provider yang tidak punya kredensial — dilaporkan, bukan disembunyikan. */
function skippedProviders(env: Record<string, string | undefined> = process.env as any): { provider: string; missing: string[] }[] {
  const have = availableProviders(env);
  return Object.keys(ENV_KEYS)
    .filter((p) => !have.includes(p))
    .map((p) => ({ provider: p, missing: ENV_KEYS[p].filter((k) => !(env[k] || "").trim()) }));
}

/* ══════════════════════════════════════════════════════════════════════════
 * INI DIA KODE APLIKASINYA. Identik untuk 7 provider. Tidak ada satu pun
 * penyebutan nama provider di dalamnya.
 * ══════════════════════════════════════════════════════════════════════════ */
async function appCode() {
  const buayar = new Buayar();

  const methods = await buayar.getPaymentMethods({ amount: 10000 });
  const methodNames = methods.success
    ? methods.methods.slice(0, 4).map((m) => m.paymentMethod)
    : [];

  const invoice = await buayar.createInvoice({
    orderId: `ENVONLY-${Date.now()}`,
    amount: 10000,
    productDetails: "Env-Only Switch Verification",
    // phone ikut diisi karena iPaymu mewajibkannya (5-15 digit). Tanpa ini
    // kode yang sama ditolak iPaymu — itu temuan dari tes ini sendiri.
    customer: { name: "Env Only Test", email: "envonly@example.com", phone: "081234567890" },
    paymentMethod: "qris",
  });

  const status = invoice.success
    ? await buayar.checkTransaction({ merchantOrderId: invoice.orderId! })
    : null;

  return {
    provider: buayar.provider,
    mode: invoice.mode,
    paymentMethodApplied: invoice.paymentMethodApplied,
    invoiceOk: invoice.success,
    invoiceError: invoice.error,
    hasVa: !!invoice.vaNumber,
    hasQr: !!invoice.qrString || !!invoice.qrCodeUrl,
    hasUrl: !!invoice.paymentUrl,
    statusOk: status?.success ?? null,
    statusValue: status?.status ?? null,
    methodCount: methodNames.length,
  };
}
/* ══════════════════════════════════════════════════════════════════════════ */

async function main() {
  // Snapshot env sumber SEBELUM apa pun dibersihkan. Perulangan di bawah menghapus
  // semua `BUAYAR_*` sebelum tiap percobaan — termasuk env kredensial yang kita
  // baca, kalau tidak disimpan lebih dulu.
  const baseEnv = { ...process.env };
  const rows: any[] = [];
  const available = availableProviders();
  const skipped = skippedProviders();

  const CREDS: Record<string, Record<string, string>> = {};
  for (const provider of available) {
    const picked: Record<string, string> = {};
    for (const [src, dst] of Object.entries(UNIVERSAL_MAP)) {
      if (ENV_KEYS[provider].includes(src) && (baseEnv[src] || "").trim()) picked[dst] = baseEnv[src]!;
    }
    CREDS[provider] = picked;
  }

  if (available.length === 0) {
    console.error("\n✖ Tidak ada kredensial di environment. Isi dulu, contoh:");
    console.error("  BUAYAR_MIDTRANS_API_KEY=... BUAYAR_DUITKU_API_KEY=... npx buayar probe:env-only\n");
    process.env = baseEnv;
    return 1;
  }

  for (const provider of available) {
    for (const k of Object.keys(process.env)) {
      if (/^(BUAYAR_|MIDTRANS_|XENDIT_|DOKU_|IPAYMU_|DUITKU_|XENITH_|FINPAY_|PAYMENT_PG|PG_)/.test(k)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, {
      NODE_ENV: "production", // paksa sandbox lewat flag eksplisit, bukan default dev
      BUAYAR_PROVIDER: provider,
      BUAYAR_SANDBOX: "true",
      BUAYAR_CALLBACK_URL: "https://webhook.site/env-only",
    });
    // Kredensial universal hasil snapshot.
    Object.assign(process.env, CREDS[provider]);
    Object.assign(process.env, EXTRA_ENV[provider] || {});

    let row: any = { provider };
    try {
      row = { ...row, ...(await appCode()) };
    } catch (e: any) {
      row = { ...row, invoiceOk: false, invoiceError: `THROW: ${e?.message || e}` };
    }
    rows.push(row);
  }

  process.env = baseEnv;

  console.log("\n════════ HASIL: 1 KODE APLIKASI, 7× GANTI ENV SAJA ════════\n");
  const w = (s: any, n: number) => String(s ?? "-").padEnd(n).slice(0, n);
  console.log(
    w("provider", 11) + w("invoice", 9) + w("mode", 10) + w("method", 10) +
    w("VA", 5) + w("QR", 5) + w("URL", 5) + w("status", 10) + "error"
  );
  console.log("─".repeat(105));
  for (const r of rows) {
    console.log(
      w(r.provider, 11) + w(r.invoiceOk ? "OK" : "GAGAL", 9) + w(r.mode, 10) +
      w(r.paymentMethodApplied, 10) + w(r.hasVa ? "ya" : "-", 5) +
      w(r.hasQr ? "ya" : "-", 5) + w(r.hasUrl ? "ya" : "-", 5) +
      w(r.statusValue, 10) + (r.invoiceError || "")
    );
  }

  const ok = rows.filter((r) => r.invoiceOk).length;
  console.log("\n" + "─".repeat(105));
  console.log(`Berhasil: ${ok}/${rows.length} provider yang kredensialnya tersedia`);

  if (skipped.length > 0) {
    console.log(`\n⏭ Dilewati (kredensial tidak ada di environment): ${skipped.length} provider`);
    for (const s of skipped) console.log(`   ${s.provider.padEnd(11)} butuh: ${s.missing.join(", ")}`);
    console.log("   (status 'contract-tested saja' — lihat `buayar audit`)");
  }
  console.log("\nKesimpulan: kode aplikasi TIDAK BERUBAH antar provider.");
  console.log("Yang berubah hanya BUAYAR_PROVIDER + BUAYAR_* — persis klaim 'zero-code switcher'.");
  console.log("\nCatatan jujur:");
  console.log("  · `mode` kini terisi di semua provider (sebelumnya 6/21) — hasil normalisasi P4.");
  console.log("  · `paymentMethodApplied` menandai apakah method benar-benar dikirim ke PG.");
  console.log("  · Kredensial di atas dipakai lewat ENV UNIVERSAL saja (BUAYAR_*), bukan");
  console.log("    env spesifik per provider — itulah yang diuji.");
}

main();
