/**
 * PROBE LIVE iPaymu — verifikasi payload Direct Payment per channel.
 *
 * Untuk SETIAP channel yang dilaporkan aktif oleh `GET /api/v2/payment-channels`,
 * skrip ini memanggil `IpaymuProvider.createInvoice()` memakai **kode kanonikal**
 * (persis seperti yang akan dipakai konsumen SDK), lalu mencatat:
 *   • payload yang BENAR-BENAR dikirim ke iPaymu (hasil intersept `fetch`),
 *   • status HTTP + respons mentah,
 *   • mode hasil (va / qris / retail / ewallet) dan nomor/nilai yang dikembalikan,
 *   • error bila gateway menolak.
 *
 * Ini membuktikan apakah tabel `CANONICAL_TO_IPAYMU` + aturan expiry/redirect
 * di provider benar-benar diterima gateway per channel (bukan hanya cocok di kertas).
 *
 * ⚠️  PERINGATAN: skrip ini MEMBUAT TRANSAKSI SANDBOX nyata di akun iPaymu Anda.
 *     Tidak ada endpoint pembatalan di iPaymu v2, jadi transaksi akan kedaluwarsa
 *     sendiri (default dikirim `expired: 1` jam bila channel mengizinkan).
 *
 * Pemakaian:
 *   IPAYMU_VA=... IPAYMU_API_KEY=... bun run scripts/probe-ipaymu-channels.ts
 *   PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe-ipaymu-channels.ts
 *   PROBE_ALIASES=1 bun run scripts/probe-ipaymu-channels.ts   # uji alias (rpx, kredivo)
 */

import { IpaymuProvider } from "../../../src/providers/ipaymu/provider";
import { toIpaymuPaymentMethod } from "../../../src/core/canonical";
import type { ProviderConfig } from "../../../src/types";
import { emitProbeJson, summarize, assertProbeTargetsSandbox } from "../lib";

const VA = (process.env.IPAYMU_VA || process.env.IPAYMU_MERCHANT_CODE || process.env.BUAYAR_MERCHANT_CODE || "").trim();
const API_KEY = (process.env.IPAYMU_API_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.IPAYMU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
/** Override `expired` (jam). Kosong = pakai default provider (clamp per bank). */
const EXPIRY_HOURS = process.env.PROBE_EXPIRY_HOURS ? Number(process.env.PROBE_EXPIRY_HOURS) : undefined;
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const ALIASES = process.env.PROBE_ALIASES === "1" || process.env.PROBE_ALIASES === "true";
const COD_SHIPPING = process.env.PROBE_COD_SHIPPING === "1" || process.env.PROBE_COD_SHIPPING === "true";
/** Kasus uji bebas: PROBE_CHANNELS="cod:rpx,cc:debitonline" (method:channel). */
const CUSTOM = (process.env.PROBE_CHANNELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((spec) => {
    const [method, channel] = spec.split(":").map((s) => s.trim());
    return { method, channel: channel || undefined, expect: "kasus kustom" };
  });

if (!VA || !API_KEY) {
  console.error("❌ IPAYMU_VA (atau IPAYMU_MERCHANT_CODE) dan IPAYMU_API_KEY wajib diset.");
  console.error("   Contoh: IPAYMU_VA=0000001995100401 IPAYMU_API_KEY=SANDBOX... bun run scripts/probe-ipaymu-channels.ts");
  process.exit(1);
}

// iPaymu tidak punya prefix kredensial baku yang bisa dicek, jadi flag
// sandbox saja yang jadi penentu. Probe ini membuat puluhan transaksi.
assertProbeTargetsSandbox({
  provider: "iPaymu",
  sandbox: SANDBOX,
  apiKey: API_KEY,
});

const config: ProviderConfig = {
  provider: "ipaymu",
  merchantCode: VA,
  apiKey: API_KEY,
  sandbox: SANDBOX,
};

const provider = new IpaymuProvider();

/** Intersept fetch agar payload yang benar-benar dikirim bisa diaudit. */
const sent: Array<{ url: string; body: any }> = [];
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  sent.push({ url: String(input), body: init?.body });
  return origFetch(input, init);
}) as typeof fetch;

interface LiveChannel {
  group: string;
  groupName: string;
  code: string;
  name: string;
  canonical: string;
  feature: string;
  health: string;
}

/**
 * Kode kanonikal dari satu channel — disalin dari logika `getPaymentMethods`
 * provider supaya probe menguji jalur yang sama dengan yang dilihat konsumen.
 */
function canonicalOf(groupCode: string, chCode: string): string {
  if (groupCode === "va") {
    return chCode === "bag" ? "bag_va" : chCode === "bmi" ? "muamalat_va" : `${chCode}_va`;
  }
  if (groupCode === "cc") return "credit_card";
  if (groupCode === "qris") return "qris";
  return chCode;
}

function isAvailable(ch: any): boolean {
  const feature = String(ch?.FeatureStatus ?? "").toLowerCase();
  const health = String(ch?.HealthStatus ?? "").toLowerCase();
  return !((feature !== "" && feature !== "active") || (health !== "" && health !== "online"));
}

function extractChannels(raw: any): LiveChannel[] {
  const groups = Array.isArray(raw?.Data) ? raw.Data : [];
  const out: LiveChannel[] = [];
  for (const group of groups) {
    const groupCode = String(group.Code || "").toLowerCase();
    for (const ch of group.Channels || []) {
      if (!isAvailable(ch)) continue;
      const chCode = String(ch.Code || "").toLowerCase();
      out.push({
        group: groupCode,
        groupName: group.Name || group.Description || "",
        code: chCode,
        name: ch.Name || "",
        canonical: canonicalOf(groupCode, chCode),
        feature: String(ch.FeatureStatus ?? ""),
        health: String(ch.HealthStatus ?? ""),
      });
    }
  }
  return out;
}

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

/** Ringkas body payload agar mudah dibaca di terminal. */
function describePayload(body: any): string {
  if (typeof body !== "string") return String(body);
  try {
    const j = JSON.parse(body);
    const keys = ["paymentMethod", "paymentChannel", "expired", "expiredType", "amount", "successUrl", "cancelUrl", "account"];
    const parts = keys.filter((k) => j[k] !== undefined).map((k) => `${k}=${JSON.stringify(j[k])}`);
    return parts.join(" ");
  } catch {
    return body.slice(0, 120);
  }
}

function describeResult(res: any): string {
  const bits: string[] = [];
  if (res.vaNumber) bits.push(`VA=${res.vaNumber} (${res.vaBank})`);
  if (res.paymentCode) bits.push(`Code=${res.paymentCode}`);
  if (res.qrString) bits.push(`QR=${String(res.qrString).slice(0, 28)}…`);
  if (res.deeplink || res.paymentUrl) bits.push(`URL=${String(res.deeplink || res.paymentUrl).slice(0, 48)}…`);
  if (res.expiresAt) bits.push(`exp=${res.expiresAt.toISOString()}`);
  if (res.reference) bits.push(`trxId=${res.reference}`);
  return bits.join(" | ") || "—";
}

async function probeChannel(ch: LiveChannel): Promise<{ channel: LiveChannel; res: any; payload: any; ok: boolean }> {
  const orderId = `PROBE-${ch.group}-${ch.code}-${Date.now().toString(36)}`;
  const before = sent.length;

  let res: any;
  try {
    res = await withTimeout(
      provider.createInvoice(
        {
          orderId,
          amount: AMOUNT,
          productDetails: `Probe ${ch.group}/${ch.code}`,
          customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
          returnUrl: "https://example.com/return",
          callbackUrl: "https://example.com/callback",
          paymentMethod: { raw: ch.canonical, providerOnly: true },
          ...(EXPIRY_HOURS !== undefined ? { extra: { expiredHours: EXPIRY_HOURS } } : {}),
        },
        config
      ),
      `${ch.group}/${ch.code}`
    );
  } catch (e: any) {
    // Satu channel yang timeout/error TIDAK boleh menghentikan sisa probe.
    res = { success: false, error: e?.message || String(e) };
  }

  const payload = sent.length > before ? sent[sent.length - 1].body : undefined;
  return { channel: ch, res, payload, ok: !!res.success };
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE LIVE iPaymu — payload Direct Payment per channel");
  console.log(`   VA      : ${VA}`);
  console.log(`   Sandbox : ${SANDBOX}`);
  console.log(`   Amount  : Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log("=".repeat(96));

  // 1. Ambil daftar channel LIVE (read-only).
  const list = await provider.getPaymentMethods({ amount: AMOUNT }, config);
  if (!list.success) {
    console.error(`❌ Gagal mengambil daftar channel: ${list.error}`);
    process.exit(1);
  }

  let channels = extractChannels(list.rawResponse);
  if (ONLY.length) channels = channels.filter((c) => ONLY.includes(c.canonical) || ONLY.includes(c.code));

  console.log(`\nChannel AKTIF menurut GET /payment-channels: ${extractChannels(list.rawResponse).length}`);
  console.log(`Yang akan diprobe: ${channels.length}${ONLY.length ? ` (filter: ${ONLY.join(",")})` : ""}\n`);

  const results: Array<{ channel: LiveChannel; res: any; payload: any; ok: boolean }> = [];
  for (const ch of channels) {
    const r = await probeChannel(ch);
    results.push(r);
    const tag = r.ok ? "✅" : "❌";
    const label = `${ch.group}/${ch.code}`.padEnd(18);
    console.log(`${tag} ${label} canonical=${ch.canonical.padEnd(14)}`);
    console.log(`     kirim : ${describePayload(r.payload)}`);
    if (r.ok) {
      console.log(`     hasil : mode=${r.res.mode || "?"} ${describeResult(r.res)}`);
    } else {
      console.log(`     error : ${r.res.error}`);
    }
  }

  // 2. Kasus kustom / tepi — memverifikasi varian payload yang tidak muncul di
  //    daftar channel live (mis. COD pakai `rpx`, debit online, alias, fallback).
  const edge: Array<{ method: string; channel?: string; expect: string }> = [];
  if (ALIASES) {
    edge.push({ method: "rpx", channel: "rpx", expect: "alias COD → paymentChannel rpx" });
    edge.push({ method: "kredivo", expect: "fallback Semi-Integrasi (bukan direct)" });
  }
  edge.push(...CUSTOM);

  if (edge.length) {
    console.log(`\n${"─".repeat(96)}\nKasus kustom / tepi${COD_SHIPPING ? " (+ field pengiriman COD)" : ""}:\n`);
    for (const { method, channel, expect } of edge) {
      const before = sent.length;
      const label = `${method}${channel ? `:${channel}` : ""}`;
      let res: any;
      try {
        res = await withTimeout(
          provider.createInvoice(
            {
              orderId: `PROBE-EDGE-${label}-${Date.now().toString(36)}`,
              amount: AMOUNT,
              productDetails: `Probe edge ${label}`,
              customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
              returnUrl: "https://example.com/return",
              callbackUrl: "https://example.com/callback",
              paymentMethod: { raw: method, providerOnly: true },
              ...(EXPIRY_HOURS !== undefined ? { extra: { expiredHours: EXPIRY_HOURS } } : {}),
              providerParams: {
                paymentMethod: method,
                ...(channel ? { paymentChannel: channel } : {}),
                ...(COD_SHIPPING
                  ? {
                      weight: [1],
                      width: [10],
                      length: [10],
                      height: [5],
                      deliveryArea: "80231",
                      deliveryAddress: "Jl. Probe No. 1, Denpasar",
                      shipping: "SICEPAT",
                      shippingService: "REG",
                    }
                  : {}),
              },
            },
            config
          ),
          `edge/${label}`
        );
      } catch (e: any) {
        res = { success: false, error: e?.message || String(e) };
      }
      const raw = sent.length > before ? String(sent[sent.length - 1].body || "{}") : "{}";
      const parsed = JSON.parse(raw);
      const isHosted = "product" in parsed && !("paymentMethod" in parsed);
      console.log(`${res.success ? "✅" : "❌"} ${label.padEnd(22)} mode=${isHosted ? "semi-integrasi" : "direct"}${expect ? ` — ${expect}` : ""}`);
      console.log(`     kirim : ${isHosted ? "hosted page payload (product/qty/price)" : describePayload(raw)}`);
      console.log(`     hasil : ${res.success ? describeResult(res) : res.error}`);
    }
  }

  emitProbeJson(
    summarize(
      "ipaymu",
      results.map((r) => ({
        method: r.channel.canonical,
        group: `${r.channel.group}/${r.channel.code}`,
        ok: r.ok,
        error: r.ok ? undefined : r.res.error,
        detail: r.ok ? describeResult(r.res) : undefined,
      })),
      { source: "live", sideEffects: results.length }
    )
  );

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Ringkasan: ${okCount}/${results.length} channel menerima payload Direct Payment.`);
  if (okCount < results.length) {
    console.log("Gagal:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  • ${r.channel.group}/${r.channel.code} (canonical=${r.channel.canonical}): ${r.res.error}`);
    }
  }
  console.log(`\n⚠️  ${results.length} transaksi sandbox dibuat (tanpa pembatalan; kedaluwarsa otomatis).`);
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe gagal:", err?.message || err);
  process.exit(1);
});
