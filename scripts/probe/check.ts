/**
 * Cek daftar channel pembayaran yang **tersedia** untuk setiap provider.
 *
 * Pemakaian:
 *   bun run scripts/check-payment-channels.ts                 # semua provider
 *   bun run scripts/check-payment-channels.ts ipaymu xendit   # provider tertentu
 *   LIVE_PROBE=1 bun run scripts/check-payment-channels.ts midtrans
 *   RAW=1 bun run scripts/check-payment-channels.ts ipaymu    # dump kode channel mentah
 *
 * Untuk mem-verifikasi payload per channel (bukan hanya daftar kanal) jalankan
 * probe terpadu: `bun run probe` (semua provider, ringkasan JSON) atau skrip
 * `scripts/probe-<provider>-channels.ts`.
 *
 * Kredensial dibaca dari environment variable (BUAYAR_* atau format spesifik PG),
 * sama seperti runtime Buayar. Lihat `sandbox.md` untuk contoh nilai sandbox.
 *
 * Catatan: `getPaymentMethods` selalu aman (read-only). `probePaymentMethods`
 * hanya dijalankan bila `LIVE_PROBE=1`, karena sebagian provider melakukan
 * pembuatan transaksi nyata (walau langsung dibatalkan) untuk membuktikan
 * channel benar-benar aktif di akun merchant.
 */

import { Buayar } from "../../src";

const SUPPORTED = ["midtrans", "ipaymu", "xendit", "doku"] as const;
type Provider = (typeof SUPPORTED)[number];

const CREDENTIAL_HINTS: Record<Provider, string[]> = {
  midtrans: ["BUAYAR_API_KEY / MIDTRANS_SERVER_KEY"],
  ipaymu: ["BUAYAR_API_KEY / IPAYMU_API_KEY", "BUAYAR_MERCHANT_CODE / IPAYMU_VA"],
  xendit: ["BUAYAR_API_KEY / XENDIT_SECRET_KEY"],
  doku: ["BUAYAR_API_KEY / DOKU_SECRET_KEY", "BUAYAR_CLIENT_KEY / DOKU_CLIENT_ID"],
};

/** Mode "live channel list" yang didukung tiap provider (hasil audit fidelity). */
const LIVE_CHANNEL_SUPPORT: Record<Provider, string> = {
  midtrans: "probe per-channel via Core API /charge (M-13) — butuh LIVE_PROBE=1; charge-probe: bun run probe midtrans",
  ipaymu: "GET /api/v2/payment-channels (read-only) — charge-probe per channel: bun run probe ipaymu",
  xendit: "GET /payment_channels (live bila berhasil, fallback statis) — charge-probe per channel: bun run probe xendit",
  doku: "DOKU MCP get_merchant_payment_methods (source live via extra.mcpApiKey/DOKU_API_KEY; fallback statis) — charge-probe: bun run probe doku",
};

function hasCredentials(provider: Provider, config: Record<string, any>): boolean {
  switch (provider) {
    case "ipaymu":
      return Boolean((config.merchantCode || config.merchantId) && config.apiKey);
    default:
      return Boolean(config.apiKey);
  }
}

/**
 * Dump kode channel MENTAH dari respons provider. Penting untuk memastikan
 * pemetaan kanonikal kita cocok dengan apa yang benar-benar dikirim PG
 * (mis. iPaymu bisa memakai kode yang berbeda dari tabel dokumentasi).
 */
function printRawChannels(raw: any): void {
  const groups = Array.isArray(raw?.Data) ? raw.Data : Array.isArray(raw) ? raw : null;
  if (!groups) {
    console.log(`   raw: ${JSON.stringify(raw)?.slice(0, 300)}`);
    return;
  }

  const looksLikeIpaymu = Array.isArray(raw?.Data);
  for (const group of groups) {
    if (looksLikeIpaymu) {
      console.log(`   ▸ group.Code="${group.Code}" name="${group.Name || group.Description || ""}"`);
      for (const ch of group.Channels || []) {
        console.log(
          `        channel.Code="${ch.Code}" name="${ch.Name || ""}" ` +
            `feature=${ch.FeatureStatus ?? "-"} health=${ch.HealthStatus ?? "-"}`
        );
      }
    } else {
      console.log(`   • code="${group.code ?? group.paymentMethod}" name="${group.paymentName}"`);
    }
  }
}

async function checkProvider(provider: Provider, liveProbe: boolean, raw: boolean): Promise<void> {
  const buayar = new Buayar({ provider, sandbox: true });
  const config = buayar.getConfig() as Record<string, any>;

  console.log(`\n${"=".repeat(78)}`);
  console.log(`📦 ${provider.toUpperCase()}`);
  console.log(`   Kredensial dibutuhkan : ${CREDENTIAL_HINTS[provider].join(", ")}`);
  console.log(`   Sumber daftar channel : ${LIVE_CHANNEL_SUPPORT[provider]}`);
  console.log(`${"=".repeat(78)}`);

  if (!hasCredentials(provider, config)) {
    console.log(`   ⚠️  Kredensial belum diset — daftar live tidak bisa diambil.`);
  }

  // 1. Daftar channel (statis atau live, tergantung provider).
  const methods = await buayar.getPaymentMethods();
  if (!methods.success) {
    console.log(`   ❌ getPaymentMethods gagal: ${methods.error}`);
  } else {
    console.log(`   ✅ getPaymentMethods: ${methods.methods.length} channel`);
    for (const [category, items] of Object.entries(methods.categories || {})) {
      const codes = items.map((m: any) => m.code || m.paymentMethod).join(", ");
      console.log(`      • ${category} (${items.length}): ${codes}`);
    }
    if (raw) {
      console.log(`   ── kode channel MENTAH ───────────────────────────────────────────`);
      printRawChannels(methods.rawResponse);
    }
  }

  // 2. Probe channel yang benar-benar aktif (opsional).
  if (liveProbe) {
    const probe = await buayar.probePaymentMethods();
    const source = (probe as any).source || "live";
    console.log(
      `   ${probe.success ? "✅" : "❌"} probePaymentMethods (source: ${source}): ` +
        `${probe.enabled.length} channel AKTIF${probe.error ? ` — ${probe.error}` : ""}`
    );
    if (probe.success) console.log(`      aktif: ${probe.enabled.join(", ")}`);

    // Diagnosa per-channel (khusus provider yang menyediakannya), agar channel
    // yang tidak aktif bisa dibedakan dari payload/kredensial yang salah.
    const provider = buayar.getProvider() as any;
    if (typeof provider.probePaymentMethodsDetailed === "function") {
      const detailed = await provider.probePaymentMethodsDetailed(config);
      const failed = detailed.results.filter((r: any) => !r.enabled);
      console.log(`   ── diagnosa per-channel (${detailed.results.length} diuji) ──────────────────`);
      for (const r of detailed.results) {
        console.log(
          `      ${r.enabled ? "✅" : "❌"} ${r.method.padEnd(12)} ` +
            `${r.enabled ? `status ${r.statusCode}` : `status ${r.statusCode ?? "-"} — ${r.error ?? "tidak aktif"}`}`
        );
        if (r.hint) console.log(`         ↳ ${r.hint}`);
      }
      console.log(`      ➡️  ${detailed.enabled.length} aktif, ${failed.length} tidak aktif`);
    }
  } else {
    console.log(`   ℹ️  probePaymentMethods dilewati (set LIVE_PROBE=1 untuk menjalankan).`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = (args.length ? args : [...SUPPORTED]).map((a) => a.toLowerCase()) as Provider[];

  const invalid = targets.filter((t) => !SUPPORTED.includes(t));
  if (invalid.length) {
    console.error(`❌ Provider tidak dikenal: ${invalid.join(", ")}`);
    console.error(`   Pilihan: ${SUPPORTED.join(", ")}`);
    process.exit(1);
  }

  const liveProbe = process.env.LIVE_PROBE === "1" || process.env.LIVE_PROBE === "true";
  const raw = process.env.RAW === "1" || process.env.RAW === "true";
  console.log(`🔎 Memeriksa ${targets.length} provider (live probe: ${liveProbe ? "AKTIF" : "nonaktif"})`);

  for (const provider of targets) {
    try {
      await checkProvider(provider, liveProbe, raw);
    } catch (err: any) {
      console.log(`   ❌ Error: ${err?.message || err}`);
    }
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log("Selesai.");
}

main().catch((err) => {
  console.error("❌ Gagal menjalankan pemeriksaan:", err);
  process.exit(1);
});
