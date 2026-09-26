/**
 * PROBE LIVE Xendit — verifikasi payload per channel (VA, e-wallet, retail, QRIS).
 *
 * Untuk SETIAP channel yang tersedia, skrip ini memanggil `XenditProvider.createInvoice()`
 * memakai **kode kanonikal** (persis seperti yang dipakai konsumen), lalu mencatat:
 *   • payload yang BENAR-BENAR dikirim ke Xendit (hasil intersept `fetch`),
 *   • status HTTP + respons mentah,
 *   • hasil per tipe kanal (nomor VA / qr_string / kode retail / deeplink e-wallet),
 *   • error bila gateway menolak.
 *
 * Catatan penting: Xendit memakai SATU base URL (`https://api.xendit.co`); mode sandbox
 * ditentukan oleh jenis API key (`xnd_development_...`), bukan host terpisah.
 *
 * Xendit juga mencoba `GET /payment_channels` untuk daftar channel live; skrip ini
 * melaporkan apakah hasilnya benar-benar live atau jatuh ke katalog statis.
 *
 * ⚠️  PERINGATAN: membuat transaksi nyata di akun Xendit Anda (test mode tetap tercatat).
 *     Gunakan `PROBE_ONLY` / `PROBE_AMOUNT` untuk membatasi.
 *
 * Pemakaian:
 *   XENDIT_SECRET_KEY=... bun run scripts/probe-xendit-channels.ts
 *   PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe-xendit-channels.ts
 *   PROBE_API_VERSION=v2 bun run scripts/probe-xendit-channels.ts   # jalur legacy v2
 */

import { XenditProvider } from "../../src/providers/xendit/provider";
import type { ProviderConfig } from "../../src/types";
import { emitProbeJson, summarize } from "../lib";

const API_KEY = (process.env.XENDIT_SECRET_KEY || process.env.BUAYAR_API_KEY || "").trim();
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const API_VERSION = (process.env.PROBE_API_VERSION || "").trim(); // "" = v3 (default), "v2" = legacy
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const RAW = process.env.RAW === "1" || process.env.RAW === "true";
/** Jalankan matriks koreksi payload v3 (VA suffix, OTC type, OVO mobile). */
const CASES = process.env.PROBE_CASES === "1" || process.env.PROBE_CASES === "true";

if (!API_KEY) {
  console.error("❌ XENDIT_SECRET_KEY (atau BUAYAR_API_KEY) wajib diset.");
  console.error("   Contoh: XENDIT_SECRET_KEY=xnd_development_... bun run scripts/probe-xendit-channels.ts");
  process.exit(1);
}

const config: ProviderConfig = {
  provider: "xendit",
  apiKey: API_KEY,
  sandbox: true,
  returnUrl: "https://example.com/return",
  ...(API_VERSION ? { extra: { xenditApiVersion: API_VERSION } } : {}),
};

const provider = new XenditProvider();

/** Intersept fetch agar payload yang benar-benar dikirim bisa diaudit. */
const sent: Array<{ url: string; body: any }> = [];
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  sent.push({ url: String(input), body: init?.body });
  return origFetch(input, init);
}) as typeof fetch;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${TIMEOUT_MS}ms (${label})`)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function describePayload(body: any): string {
  if (typeof body !== "string") return String(body);
  try {
    const j = JSON.parse(body);
    const keys = ["channel_code", "type", "request_amount", "amount", "api-version"];
    const parts = keys.filter((k) => j[k] !== undefined).map((k) => `${k}=${JSON.stringify(j[k])}`);
    const cp = j.channel_properties || j.payment_method?.virtual_account?.channel_properties;
    if (cp) parts.push(`channel_properties=${JSON.stringify(cp)}`);
    return parts.join(" ");
  } catch {
    return body.slice(0, 140);
  }
}

function describeResult(res: any): string {
  const bits: string[] = [];
  if (res.vaNumber) bits.push(`VA=${res.vaNumber}${res.vaBank ? ` (${res.vaBank})` : ""}`);
  if (res.paymentCode) bits.push(`Code=${res.paymentCode}`);
  if (res.qrString) bits.push(`QR=${String(res.qrString).slice(0, 28)}…`);
  if (res.deeplink || res.paymentUrl) bits.push(`URL=${String(res.deeplink || res.paymentUrl).slice(0, 52)}…`);
  if (res.expiresAt) bits.push(`exp=${new Date(res.expiresAt).toISOString()}`);
  if (res.reference) bits.push(`id=${res.reference}`);
  return bits.join(" | ") || "—";
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE LIVE Xendit — payload per channel");
  console.log(`   Key     : ${API_KEY.slice(0, 18)}…${API_KEY.slice(-6)}`);
  console.log(`   Amount  : Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log(`   Versi   : ${API_VERSION === "v2" ? "v2 (legacy)" : "v3 (default, api-version 2024-11-11)"}`);
  console.log("=".repeat(96));

  // 1. Ambil daftar channel. Xendit mencoba GET /payment_channels lalu fallback statis.
  const list = await provider.getPaymentMethods({ amount: AMOUNT }, config);
  const raw = list.rawResponse;
  const isLive = Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object" && "channel_code" in raw[0];
  console.log(`\nSumber daftar channel: ${isLive ? "LIVE (GET /payment_channels)" : "STATIS (katalog SDK)"} — ${list.methods.length} channel`);
  if (RAW && Array.isArray(raw)) {
    console.log("   ── channel mentah ────────────────────────────────────────────");
    for (const ch of raw) {
      console.log(`      code="${ch.channel_code}" type=${ch.type} status=${ch.status ?? "-"} name="${ch.display_name || ch.name || ""}"`);
    }
  }

  let channels = list.methods;
  if (ONLY.length) channels = channels.filter((m: any) => ONLY.includes(m.paymentMethod.toLowerCase()));
  console.log(`Yang akan diprobe: ${channels.length}${ONLY.length ? ` (filter: ${ONLY.join(",")})` : ""}\n`);

  const results: Array<{ method: string; res: any; payload: any; ok: boolean }> = [];
  for (const m of channels as any[]) {
    const method = m.paymentMethod;
    const before = sent.length;
    let res: any;
    try {
      res = await withTimeout(
        provider.createInvoice(
          {
            orderId: `PROBE-XND-${method}-${Date.now().toString(36)}`,
            amount: AMOUNT,
            productDetails: `Probe ${method}`,
            customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
            returnUrl: "https://example.com/return",
            paymentMethod: method,
          },
          config
        ),
        method
      );
    } catch (e: any) {
      res = { success: false, error: e?.message || String(e) };
    }
    const payload = sent.length > before ? sent[sent.length - 1].body : undefined;
    results.push({ method, res, payload, ok: !!res.success });

    const label = `${m.category || "?"} / ${method}`.padEnd(34);
    console.log(`${res.success ? "✅" : "❌"} ${label}`);
    console.log(`     kirim : ${describePayload(payload)}`);
    if (res.success) {
      console.log(`     hasil : ${describeResult(res)}`);
    } else {
      const code = res.rawResponse?.error_code ? ` [${res.rawResponse.error_code}]` : "";
      console.log(`     error : ${res.error}${code}`);
    }
  }

  // 2. Matriks koreksi payload v3 (opsional) — menuntaskan semantik channel_code/type/properties.
  if (CASES) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const cases: Array<{ label: string; method: string; override: Record<string, any> }> = [
      {
        label: "VA v3 code=BCA_VIRTUAL_ACCOUNT + display_name",
        method: "bca_va",
        override: { channel_code: "BCA_VIRTUAL_ACCOUNT", channel_properties: { display_name: "Buayar Probe", expires_at: expiresAt } },
      },
      {
        label: "VA v3 code=BCA_VIRTUAL_ACCOUNT + customer_name",
        method: "bca_va",
        override: { channel_code: "BCA_VIRTUAL_ACCOUNT", channel_properties: { customer_name: "Buayar Probe", expires_at: expiresAt } },
      },
      {
        label: "OTC v3 type=REUSABLE_PAYMENT_CODE + payer_name",
        method: "alfamart",
        override: { type: "REUSABLE_PAYMENT_CODE", channel_code: "ALFAMART", channel_properties: { payer_name: "Buayar Probe" } },
      },
      {
        label: "OTC v3 type=PAY + payer_name",
        method: "alfamart",
        override: { type: "PAY", channel_code: "ALFAMART", channel_properties: { payer_name: "Buayar Probe" } },
      },
      {
        label: "OVO v3 + account_mobile_number",
        method: "ovo",
        override: {
          channel_code: "OVO",
          channel_properties: { account_mobile_number: "+6281234567890", success_return_url: "https://example.com/return", failure_return_url: "https://example.com/return" },
        },
      },
      {
        label: "OVO v3 + mobile_number",
        method: "ovo",
        override: {
          channel_code: "OVO",
          channel_properties: { mobile_number: "+6281234567890", success_return_url: "https://example.com/return", failure_return_url: "https://example.com/return" },
        },
      },
    ];
    console.log(`\n${"─".repeat(96)}\nMatriks koreksi payload v3:\n`);
    for (const c of cases) {
      const before = sent.length;
      let res: any;
      try {
        res = await withTimeout(
          provider.createInvoice(
            {
              orderId: `PROBE-XND-CASE-${Date.now().toString(36)}`,
              amount: AMOUNT,
              productDetails: `Probe case ${c.label}`,
              customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
              returnUrl: "https://example.com/return",
              paymentMethod: c.method,
              providerParams: c.override,
            },
            config
          ),
          c.label
        );
      } catch (e: any) {
        res = { success: false, error: e?.message || String(e) };
      }
      const payload = sent.length > before ? sent[sent.length - 1].body : undefined;
      console.log(`${res.success ? "✅" : "❌"} ${c.label}`);
      console.log(`     kirim : ${describePayload(payload)}`);
      console.log(`     hasil : ${res.success ? describeResult(res) : res.error}`);
    }
  }

  emitProbeJson(
    summarize(
      "xendit",
      results.map((r) => ({
        method: r.method,
        ok: r.ok,
        statusCode: r.res?.rawResponse?.status_code,
        error: r.ok ? undefined : r.res.error,
        detail: r.ok ? describeResult(r.res) : undefined,
      })),
      { source: isLive ? "live" : "static", sideEffects: results.length }
    )
  );

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Ringkasan: ${okCount}/${results.length} channel menerima payload (${API_VERSION === "v2" ? "v2" : "v3"}).`);
  if (okCount < results.length) {
    console.log("Gagal:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • ${r.method}: ${r.res.error}`);
    }
  }
  console.log(`\n⚠️  ${results.length} transaksi dibuat di akun Xendit (test mode).`);
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe gagal:", err?.message || err);
  process.exit(1);
});
