/**
 * PROBE LIVE Midtrans — verifikasi payload Core API per channel (VA, e-wallet, retail, QRIS, paylater).
 *
 * Untuk SETIAP channel, skrip ini memanggil `MidtransProvider.createInvoice()` memakai
 * **kode kanonikal** (jalur konsumen), lalu mencatat:
 *   • payload yang BENAR-BENAR dikirim ke `POST /v2/charge` (intersept `fetch`),
 *   • status HTTP + respons mentah,
 *   • hasil per tipe kanal (nomor VA / QR / kode retail / deeplink e-wallet),
 *   • error + petunjuk aktivasi channel (via `hintMidtransProbeError`).
 *
 * Transaksi yang BERHASIL langsung dibatalkan (`/{order_id}/cancel`) agar tidak menumpuk
 * di dashboard sandbox. Set `PROBE_NO_CANCEL=1` untuk mempertahankannya.
 *
 * ⚠️  Channel yang belum diaktifkan di akun mendapat 400 generik
 *     ("One or more parameters in the payload is invalid.") — itu batasan akun, bukan payload.
 *
 * Pemakaian:
 *   MIDTRANS_SERVER_KEY=... bun run scripts/probe-midtrans-channels.ts
 *   PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe-midtrans-channels.ts
 */

import { MidtransProvider } from "../../src/providers/midtrans/provider";
import { hintMidtransProbeError } from "../../src/providers/midtrans/methods";
import type { ProviderConfig } from "../../src/types";
import { emitProbeJson, summarize } from "../lib";

const API_KEY = (process.env.MIDTRANS_SERVER_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.MIDTRANS_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const NO_CANCEL = process.env.PROBE_NO_CANCEL === "1" || process.env.PROBE_NO_CANCEL === "true";
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!API_KEY) {
  console.error("❌ MIDTRANS_SERVER_KEY (atau BUAYAR_API_KEY) wajib diset.");
  process.exit(1);
}

const config: ProviderConfig = {
  provider: "midtrans",
  apiKey: API_KEY,
  serverKey: API_KEY,
  sandbox: SANDBOX,
  returnUrl: "https://example.com/return",
};

const provider = new MidtransProvider();

/** Kanal Core API yang dipetakan dari kode kanonikal (lihat CANONICAL_TO_MIDTRANS). */
const MIDTRANS_CHANNELS: Array<{ method: string; group: string }> = [
  { method: "bca_va", group: "Virtual Account" },
  { method: "bni_va", group: "Virtual Account" },
  { method: "bri_va", group: "Virtual Account" },
  { method: "cimb_va", group: "Virtual Account" },
  { method: "danamon_va", group: "Virtual Account" },
  { method: "bsi_va", group: "Virtual Account" },
  { method: "seabank_va", group: "Virtual Account" },
  { method: "mandiri_va", group: "Virtual Account" },
  { method: "permata_va", group: "Virtual Account" },
  { method: "qris", group: "QRIS" },
  { method: "gopay", group: "E-Wallet" },
  { method: "shopeepay", group: "E-Wallet" },
  { method: "ovo", group: "E-Wallet" },
  { method: "dana", group: "E-Wallet" },
  { method: "linkaja", group: "E-Wallet" },
  { method: "alfamart", group: "Retail / Gerai" },
  { method: "indomaret", group: "Retail / Gerai" },
  { method: "akulaku", group: "Paylater / Cicilan" },
  { method: "kredivo", group: "Paylater / Cicilan" },
];

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
    const keys = ["payment_type", "gross_amount"];
    const parts = keys.filter((k) => j[k] !== undefined).map((k) => `${k}=${JSON.stringify(j[k])}`);
    const nested = ["bank_transfer", "echannel", "qris", "gopay", "shopeepay", "ovo", "dana", "linkaja", "cstore", "kredivo", "akulaku"];
    for (const k of nested) if (j[k]) parts.push(`${k}=${JSON.stringify(j[k])}`);
    return parts.join(" ");
  } catch {
    return body.slice(0, 140);
  }
}

function describeResult(res: any): string {
  const bits: string[] = [];
  if (res.vaNumber) bits.push(`VA=${res.vaNumber}${res.vaBank ? ` (${res.vaBank})` : ""}`);
  if (res.paymentCode) bits.push(`Code=${res.paymentCode}`);
  if (res.qrString) bits.push(`QR=${String(res.qrString).slice(0, 24)}…`);
  if (res.deeplink || res.paymentUrl) bits.push(`URL=${String(res.deeplink || res.paymentUrl).slice(0, 46)}…`);
  if (res.expiresAt) {
    const d = new Date(res.expiresAt);
    bits.push(`exp=${isNaN(d.getTime()) ? String(res.expiresAt) : d.toISOString()}`);
  }
  if (res.reference) bits.push(`trx=${res.reference}`);
  return bits.join(" | ") || "—";
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE LIVE Midtrans — payload Core API per channel");
  console.log(`   Sandbox : ${SANDBOX}`);
  console.log(`   Amount  : Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log(`   Cancel  : ${NO_CANCEL ? "tidak (transaksi dipertahankan)" : "ya (transaksi sukses dibatalkan)"}`);
  console.log("=".repeat(96));

  let channels = MIDTRANS_CHANNELS;
  if (ONLY.length) channels = channels.filter((c) => ONLY.includes(c.method));
  console.log(`Yang akan diprobe: ${channels.length}${ONLY.length ? ` (filter: ${ONLY.join(",")})` : ""}\n`);

  const client = provider.getClient(config);
  const results: Array<{ method: string; group: string; ok: boolean; error?: string; hint?: string; res?: any }> = [];

  for (const ch of channels) {
    const orderId = `PROBE-${ch.method}-${Date.now().toString(36)}`;
    const before = sent.length;
    let res: any;
    try {
      res = await withTimeout(
        provider.createInvoice(
          {
            orderId,
            amount: AMOUNT,
            productDetails: `Probe ${ch.method}`,
            customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
            returnUrl: "https://example.com/return",
            paymentMethod: ch.method,
          },
          config
        ),
        ch.method
      );
    } catch (e: any) {
      res = { success: false, error: e?.message || String(e) };
    }

    const body = sent.length > before ? sent[sent.length - 1].body : undefined;
    const statusCode = String(res?.rawResponse?.status_code ?? "");
    const error = res.success ? undefined : res.error;
    const hint =
      res.success ? undefined : hintMidtransProbeError(ch.method.replace(/_va$/, ""), error, statusCode);

    results.push({ method: ch.method, group: ch.group, ok: !!res.success, error, hint, res });

    console.log(`${res.success ? "✅" : "❌"} ${`${ch.group} / ${ch.method}`.padEnd(36)}`);
    console.log(`     kirim : ${describePayload(body)}`);
    if (res.success) {
      console.log(`     hasil : ${describeResult(res)}`);
      if (!NO_CANCEL) {
        try {
          await withTimeout(client.cancelTransaction(res.orderId || orderId), `cancel ${orderId}`);
          console.log(`     cancel: OK`);
        } catch (e: any) {
          console.log(`     cancel: gagal — ${e?.message || e}`);
        }
      }
    } else {
      console.log(`     error : ${error}`);
      if (hint) console.log(`     ↳ ${hint}`);
    }
  }

  emitProbeJson(
    summarize(
      "midtrans",
      results.map((r) => ({
        method: r.method,
        group: r.group,
        ok: r.ok,
        statusCode: r.res?.rawResponse?.status_code,
        error: r.error,
        hint: r.hint,
        detail: r.ok ? describeResult(r.res) : undefined,
      })),
      { source: "live", sideEffects: results.filter((r) => r.ok).length }
    )
  );

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Ringkasan: ${okCount}/${results.length} channel menerima payload Core API.`);
  if (okCount < results.length) {
    console.log("Gagal:");
    for (const r of results.filter((x) => !x.ok)) console.log(`  • ${r.method}: ${r.error}`);
  }
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe gagal:", err?.message || err);
  process.exit(1);
});
