/**
 * Probe live Duitku.
 *
 * Duitku adalah satu-satunya provider yang kredensial sandbox-nya sudah
 * disiapkan tapi TIDAK punya probe — jadi semua yang diklaim pustaka tentang
 * Duitku sampai sebelum probe ini dibuat belum pernah diuji terhadap Duitku
 * sungguhan. Padahal Duitku punya dua karakteristik yang tidak dimiliki
 * provider lain:
 *
 *   1. Dua jalur invoice berbeda dengan skema signature berbeda:
 *      POP (createInvoice, signature HMAC-SHA256 di header) dan
 *      Direct Inquiry (webapi/v2/inquiry, signature MD5 di body).
 *
 *   2. Signature callback-nya TIDAK mencakup `resultCode`, yaitu satu-satunya
 *      field yang menentukan status. Ini yang membuat callback Duitku tidak
 *      bisa dipakai untuk menyatakan "lunas" tanpa dicek ulang ke Duitku —
 *      bagian bawah probe ini membuktikannya dengan kredensial asli.
 *
 * Pemakaian:
 *   DUITKU_MERCHANT_CODE=... DUITKU_API_KEY=... bun run scripts/probe/duitku/channels.ts
 *   PROBE_ONLY=bc,ab,va  untuk membatasi kanal
 */

import { createHash } from "node:crypto";
import { DuitkuProvider } from "../../../src/providers/duitku/provider";
import type { ProviderConfig } from "../../../src/types";
import { emitProbeJson, summarize, assertProbeTargetsSandbox, type ProbeChannelResult } from "../lib";

const MERCHANT_CODE = (process.env.DUITKU_MERCHANT_CODE || process.env.PAYMENT_MERCHANT_CODE || "").trim();
const API_KEY = (process.env.DUITKU_API_KEY || process.env.PAYMENT_API_KEY || "").trim();
// src/core/config.ts resolve lewat facade, tapi probe ini memanggil provider
// secara langsung, jadi mode sandbox harus ditetapkan sendiri di sini.
const SANDBOX = (process.env.DUITKU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!MERCHANT_CODE || !API_KEY) {
  console.error("❌ DUITKU_MERCHANT_CODE (atau PAYMENT_MERCHANT_CODE) dan DUITKU_API_KEY wajib diset.");
  console.error(
    "   Contoh: DUITKU_MERCHANT_CODE=DS35829 DUITKU_API_KEY=... bun run scripts/probe/duitku/channels.ts",
  );
  process.exit(1);
}

// Duitku tidak punya prefix kredensial baku yang bisa dicek, jadi andalkan flag
// sandbox saja. Prefix produksi tidak bisa dibedakan dari kunci sandbox tanpa
// menebak-nebak, dan menebak-nebak di sini justru bisa memblokir probe yang
// sebenarnya benar.
assertProbeTargetsSandbox({
  provider: "Duitku",
  sandbox: SANDBOX,
  apiKey: API_KEY,
});

const config: ProviderConfig = {
  provider: "duitku",
  merchantCode: MERCHANT_CODE,
  apiKey: API_KEY,
  sandbox: SANDBOX,
  returnUrl: "https://example.com/return",
  callbackUrl: "https://example.com/callback",
};

const provider = new DuitkuProvider();
const notes: string[] = [];

/** Batas waktu per panggilan, biar probe tidak menggantung tanpa henti. */
async function denganBatas<T>(ms: number, kerja: () => Promise<T>): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      kerja(),
      new Promise<never>((_, tolak) => {
        timer = setTimeout(() => tolak(new Error(`Timeout ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function ringkasInvoice(res: any): string {
  const bits: string[] = [];
  if (res.vaNumber) bits.push(`VA=${res.vaNumber}`);
  if (res.paymentCode) bits.push(`Code=${res.paymentCode}`);
  if (res.qrString) bits.push(`QR=${String(res.qrString).slice(0, 28)}…`);
  if (res.qrCodeUrl) bits.push(`QRimg=${String(res.qrCodeUrl).slice(0, 48)}…`);
  if (res.paymentUrl) bits.push(`URL=${String(res.paymentUrl).slice(0, 52)}…`);
  if (res.reference) bits.push(`ref=${res.reference}`);
  return bits.join(" | ") || "—";
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE LIVE Duitku — payload per kanal + integritas callback");
  console.log(`   Merchant: ${MERCHANT_CODE}`);
  console.log(`   Amount  : Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log(`   Mode    : ${SANDBOX ? "sandbox" : "PRODUKSI"}`);
  console.log("=".repeat(96));

  // ── 1. Daftar kanal live ──────────────────────────────────────────────
  const daftar = await denganBatas(30000, () => provider.getPaymentMethods({ amount: AMOUNT }, config));
  if (!daftar.success) {
    console.error(`❌ Gagal mengambil daftar kanal: ${daftar.error}`);
    emitProbeJson(
      summarize("duitku", [], { source: "live", skipped: true, reason: daftar.error, notes }),
    );
    process.exit(1);
  }
  let kanal = daftar.methods;
  if (ONLY.length) kanal = kanal.filter((m: any) => ONLY.includes(String(m.paymentMethod).toLowerCase()));
  console.log(`\nKanal dari Duitku: ${daftar.methods.length} · yang diprobe: ${kanal.length}\n`);

  // ── 2. Satu invoice per kanal (Direct Inquiry) ─────────────────────────
  const results: ProbeChannelResult[] = [];
  let dibuat = 0;

  for (const m of kanal as any[]) {
    const kode = String(m.paymentMethod);
    // Kode Duitku adalah kode internal provider (BC, AB, SP, …), bukan kode
    // kanonik. Pakai escape hatch resminya supaya niatnya jelas di code review.
    let res: any;
    try {
      res = await denganBatas(40000, () =>
        provider.createInvoice(
          {
            orderId: `PROBE-DUITKU-${Date.now()}-${kode}`,
            amount: AMOUNT,
            productDetails: "Buayar probe",
            customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
            returnUrl: config.returnUrl!,
            callbackUrl: config.callbackUrl!,
            paymentMethod: { raw: kode, providerOnly: true },
          },
          config,
        ),
      );
    } catch (e: any) {
      results.push({ method: kode, ok: false, error: `${e.name}: ${e.message}` });
      continue;
    }

    if (res.success) {
      dibuat++;
      results.push({ method: kode, group: String(m.category ?? ""), ok: true, detail: ringkasInvoice(res) });
      console.log(`✅ ${kode.padEnd(10)} ${ringkasInvoice(res)}`);
    } else {
      // Kanal yang tidak diaktifkan di akun ini memang gagal; itu informasi,
      // bukan bug pustaka.
      results.push({ method: kode, ok: false, error: String(res.error ?? "").slice(0, 140) });
      console.log(`❌ ${kode.padEnd(10)} ${String(res.error ?? "").slice(0, 110)}`);
    }
  }

  // ── 3. Jalur POP (tanpa paymentMethod) ─────────────────────────────────
  // POP dan Direct Inquiry adalah dua API berbeda; kalau hanya salah satu yang
  // diuji, separuh kemampuan Duitku tidak pernah terbukti jalan.
  const orderPop = `PROBE-DUITKU-POP-${Date.now()}`;
  const pop = await denganBatas(40000, () =>
    provider.createInvoice(
      {
        orderId: orderPop,
        amount: AMOUNT,
        productDetails: "Buayar probe POP",
        customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
        returnUrl: config.returnUrl!,
        callbackUrl: config.callbackUrl!,
      },
      config,
    ),
  );
  if (pop.success) {
    dibuat++;
    results.push({ method: "pop_redirect", group: "POP", ok: true, detail: ringkasInvoice(pop) });
    console.log(`\n✅ pop_redirect  ${ringkasInvoice(pop)}`);
  } else {
    results.push({ method: "pop_redirect", group: "POP", ok: false, error: String(pop.error ?? "").slice(0, 140) });
    console.log(`\n❌ pop_redirect  ${String(pop.error ?? "").slice(0, 110)}`);
  }

  // ── 4. Integritas callback: resultCode tidak tertandatangani ──────────
  //
  // Ini bagian yang paling penting. Ambil order di atas, hitung signature sahnya,
  // lalu kirim callback yang menyatakan "00" (lunas) padahal order-nya belum
  // dibayar. Kalau pustaka melaporkan isPaid, berarti ada yang salah.
  const orderId = `PROBE-DUITKU-INT-${Date.now()}`;
  const nominal = 12345;
  const invoice = await denganBatas(40000, () =>
    provider.createInvoice(
      {
        orderId,
        amount: nominal,
        productDetails: "Buayar probe integritas",
        customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
        returnUrl: config.returnUrl!,
        callbackUrl: config.callbackUrl!,
        paymentMethod: { raw: kanal[0] ? String(kanal[0].paymentMethod) : "BC", providerOnly: true },
      },
      config,
    ),
  );

  if (invoice.success) {
    dibuat++;
    const signature = createHash("md5")
      .update(MERCHANT_CODE + String(nominal) + orderId + API_KEY)
      .digest("hex");

    const palsu = await provider.verifyCallback(
      {
        merchantCode: MERCHANT_CODE,
        amount: String(nominal),
        merchantOrderId: orderId,
        signature,
        resultCode: "00",
        resultDesc: "SUCCESS",
        reference: invoice.reference ?? "PROBE",
      },
      config,
    );

    // Status sebenarnya dari Duitku, supaya perbandingannya jujur.
    const nyata = await provider.checkTransaction({ merchantOrderId: orderId }, config);

    const aman = palsu.isValid === true && palsu.isPaid === false && palsu.paymentUnconfirmed === true;
    results.push({
      method: "callback_integritas",
      group: "keamanan",
      ok: aman,
      statusCode: `palsu=${palsu.status} nyata=${nyata.status}`,
      detail: `isValid=${palsu.isValid} isPaid=${palsu.isPaid} unconfirmed=${palsu.paymentUnconfirmed === true}`,
      ...(aman ? {} : { error: `Callback palsu dilaporkan isPaid=${palsu.isPaid}` }),
    });
    console.log(`\n${"-".repeat(96)}`);
    console.log("INTEGRITAS CALLBACK — order dibuat, TIDAK dibayar, lalu diklaim lunas");
    console.log(`   orderId nyata      : ${orderId}`);
    console.log(`   callback palsu     : resultCode=00, signature sah`);
    console.log(`   verdict pustaka    : isValid=${palsu.isValid} isPaid=${palsu.isPaid} status=${palsu.status}`);
    console.log(`   unconfirmed        : ${palsu.paymentUnconfirmed === true}`);
    console.log(`   status dari Duitku : ${nyata.statusCode} -> ${nyata.status} (orderNotFound=${nyata.orderNotFound === true})`);
    console.log(aman ? "   → AMAN: callback tak bisa menandai order belum bayar sebagai lunas." : "   → BAHAYA: isPaid=true untuk order yang belum dibayar.");
    console.log("-".repeat(96));
  } else {
    notes.push(`integritas callback dilewati: order gagal dibuat (${pop.error ?? invoice.error})`);
  }

  const summary = summarize("duitku", results, {
    source: "live",
    sideEffects: dibuat,
    notes: [
      ...notes,
      "Order POP tidak tercatat di endpoint transactionStatus Duitku, jadi statusnya tidak bisa dikonfirmasi lewat API.",
    ],
  });

  emitProbeJson(summary);

  console.log("=".repeat(96));
  console.log(
    `Ringkasan: ${summary.passed}/${summary.tested} lolos · ${summary.expected} diharapkan gagal · ${summary.failed} gagal.`,
  );
  const gagal = results.filter((r) => !r.ok && !r.expected);
  if (gagal.length) {
    console.log("Gagal:");
    for (const g of gagal) console.log(`  • ${g.method}: ${g.error ?? "—"}`);
  }
  console.log(`\n⚠️  ${dibuat} transaksi sandbox dibuat. Duitku tidak menyediakan pembatalan seragam.`);
  console.log("=".repeat(96));
}

main().catch((e) => {
  console.error("Probe Duitku gagal:", e);
  process.exit(1);
});
