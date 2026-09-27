/**
 * PROBE LIVE Finpay — verifikasi payload API resmi per kanal (VA, QRIS, retail, e-wallet, kartu).
 *
 * Untuk SETIAP kanal, skrip ini memanggil `FinpayProvider.createInvoice()` memakai
 * **kode kanonikal** (jalur konsumen), lalu mencatat:
 *   • payload yang BENAR-BENAR dikirim ke `POST /pg/payment/card/initiate` (intersept `fetch`),
 *   • header `Authorization: Basic ...` (tanpa membocorkan nilainya),
 *   • status HTTP + respons mentah,
 *   • hasil per kanal (nomor VA / QR / kode retail / redirect URL),
 *   • error bila gateway menolak.
 *
 * Skrip ini memverifikasi kontrak hasil audit FP-1 terhadap dokumentasi resmi
 * (https://docs.finpay.id/api-reference/finpay-pg/):
 *   • base URL `https://devo.finnet.co.id` (sandbox),
 *   • body bersarang `{ order, customer, url, sourceOfFunds }`,
 *   • kode sukses `responseCode === "2000000"`,
 *   • SOF ID resmi (`vabca`, `qris`, `idm`, `cc`, …),
 *   • status check `GET /pg/payment/card/check/{orderId}`.
 *
 * ⚠️  PERINGATAN: skrip ini MEMBUAT TRANSAKSI SANDBOX nyata di akun Finpay Anda.
 *     Finpay menyediakan Cancel/Void, tetapi belum diimplementasikan di Buayar,
 *     jadi transaksi akan kedaluwarsa sendiri.
 *
 * Pemakaian:
 *   FINPAY_MERCHANT_ID=... FINPAY_MERCHANT_KEY=... bun run scripts/probe/finpay/channels.ts
 *   PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe/finpay/channels.ts
 *   PROBE_VOID=<orderId> ...   # mode fokus: verifikasi Void atas order yang sudah dibayar
 *   FINPAY_SANDBOX=false ...   # hanya jika benar-benar ingin menembak produksi (diblokir guard)
 */

import { FinpayProvider } from "../../../src/providers/finpay/provider";
import { generateFinpaySignature } from "../../../src/providers/finpay/signature";
import { toFinpayPaymentMethod } from "../../../src/core/canonical";
import type { ProviderConfig } from "../../../src/types";
import {
  emitProbeJson,
  summarize,
  assertProbeTargetsSandbox,
  type ProbeChannelResult,
} from "../lib";

const MERCHANT_ID = (process.env.FINPAY_MERCHANT_ID || process.env.BUAYAR_MERCHANT_CODE || "").trim();
const MERCHANT_KEY = (process.env.FINPAY_MERCHANT_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.FINPAY_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
/** Set `PROBE_NO_CANCEL=1` untuk mempertahankan transaksi (default: langsung dibatalkan). */
const NO_CANCEL = process.env.PROBE_NO_CANCEL === "1" || process.env.PROBE_NO_CANCEL === "true";
// Mode fokus: verifikasi Void atas satu order yang SUDAH dibayar/authorized.
// Sandbox Finpay tidak menyediakan simulator pembayaran, jadi order harus dibayar
// dulu (mis. via transfer bank / e-wallet sandbox), lalu dicek di sini.
const VOID_ORDER = (process.env.PROBE_VOID || "").trim();

if (!MERCHANT_ID || !MERCHANT_KEY) {
  console.error("❌ FINPAY_MERCHANT_ID dan FINPAY_MERCHANT_KEY wajib diset.");
  console.error(
    "   Contoh: FINPAY_MERCHANT_ID=<merchant-id> FINPAY_MERCHANT_KEY=<merchant-key> bun run scripts/probe/finpay/channels.ts",
  );
  process.exit(1);
}

// Probe ini membuat transaksi sandbox nyata. Kalau dijalankan tanpa sengaja ke
// akun produksi, transaksi muncul di dashboard merchant dan laporan bulanan
// ikut kotor. Guard fail-closed mencegah itu.
// Merchant Key Finpay tidak punya prefix baku, jadi hanya flag `sandbox` yang
// bisa diandalkan.
assertProbeTargetsSandbox({
  provider: "Finpay",
  sandbox: SANDBOX,
  apiKey: MERCHANT_KEY,
});

const config: ProviderConfig = {
  provider: "finpay",
  merchantCode: MERCHANT_ID,
  apiKey: MERCHANT_KEY,
  sandbox: SANDBOX,
  returnUrl: "https://example.com/return",
  callbackUrl: "https://example.com/callback",
};

const provider = new FinpayProvider();

/** Kanal kanonikal yang diprobe beserta grupnya (lihat CANONICAL_TO_FINPAY). */
const CHANNELS: Array<{ method: string; group: string }> = [
  { method: "bca_va", group: "Virtual Account" },
  { method: "bni_va", group: "Virtual Account" },
  { method: "bri_va", group: "Virtual Account" },
  { method: "mandiri_va", group: "Virtual Account" },
  { method: "permata_va", group: "Virtual Account" },
  { method: "qris", group: "QRIS" },
  { method: "alfamart", group: "Retail / Gerai" },
  { method: "indomaret", group: "Retail / Gerai" },
  { method: "ovo", group: "E-Wallet" },
  { method: "dana", group: "E-Wallet" },
  { method: "shopeepay", group: "E-Wallet" },
  { method: "linkaja", group: "E-Wallet" },
  { method: "credit_card", group: "Kartu Kredit" },
];

/** Intersept fetch agar payload + header yang benar-benar dikirim bisa diaudit. */
const sent: Array<{ url: string; method: string; auth: string; body: any }> = [];
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  sent.push({
    url: String(input),
    method: String(init?.method || "GET").toUpperCase(),
    auth: String(init?.headers?.Authorization || ""),
    body: init?.body,
  });
  return origFetch(input, init);
}) as typeof fetch;

/** Batas waktu per panggilan, biar probe tidak menggantung tanpa henti. */
async function denganBatas<T>(kerja: () => Promise<T>, label: string): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      kerja(),
      new Promise<never>((_, tolak) => {
        timer = setTimeout(() => tolak(new Error(`timeout ${TIMEOUT_MS}ms (${label})`)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function ringkasInvoice(res: any): string {
  const bits: string[] = [];
  if (res.vaNumber) bits.push(`VA=${res.vaNumber} (${res.vaBank})`);
  if (res.paymentCode) bits.push(`Code=${res.paymentCode}`);
  if (res.qrString) bits.push(`QR=${String(res.qrString).slice(0, 28)}…`);
  if (res.qrCodeUrl) bits.push(`QRimg=${String(res.qrCodeUrl).slice(0, 48)}…`);
  if (res.paymentUrl) bits.push(`URL=${String(res.paymentUrl).slice(0, 52)}…`);
  if (res.expiresAt) bits.push(`exp=${new Date(res.expiresAt).toISOString()}`);
  if (res.reference) bits.push(`ref=${res.reference}`);
  return bits.join(" | ") || "—";
}

function describeSof(body: any): string {
  if (typeof body !== "string") return "—";
  try {
    const j = JSON.parse(body);
    return j.sourceOfFunds?.type ? `sof=${j.sourceOfFunds.type}` : "sof=(hosted)";
  } catch {
    return "—";
  }
}

/** Petunjuk bila kanal ditolak — membedakan masalah akun dari payload yang salah. */
function hintFinpayError(statusText: string, error: string): string | undefined {
  if (/context deadline|timeout|forbidden|not.?registered|not.?allowed|aktif/i.test(error)) {
    return "Kanal mungkin belum diaktifkan untuk akun merchant ini (aktivasi via Dashboard Finpay).";
  }
  if (/unauthorized|401|invalid.*(key|credential)/i.test(error) || statusText === "401") {
    return "Periksa Merchant ID/Key dan pastikan header Basic auth base64(merchantId:merchantKey) benar.";
  }
  return undefined;
}

async function probeChannel(method: string, group: string): Promise<{ res: any; body: any; orderId: string }> {
  const orderId = `PROBE-FINPAY-${method.toUpperCase()}-${Date.now().toString(36)}`;
  const before = sent.length;

  let res: any;
  try {
    res = await denganBatas(
      () =>
        provider.createInvoice(
          {
            orderId,
            amount: AMOUNT,
            productDetails: `Probe Finpay ${method}`,
            customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
            returnUrl: config.returnUrl!,
            callbackUrl: config.callbackUrl!,
            paymentMethod: method as any,
          },
          config,
        ),
      method,
    );
  } catch (e: any) {
    res = { success: false, error: `${e?.name || "Error"}: ${e?.message || e}` };
  }

  const body = sent.length > before ? sent[sent.length - 1].body : undefined;
  return { res, body, orderId };
}

/**
 * Verifikasi Void live atas satu order: status sebelum → void → status sesudah.
 *
 * Void hanya berlaku untuk transaksi yang sudah diotorisasi/dibayar (sebelum
 * settlement). Order yang belum dibayar dijawab `4030015 Transaction Not Permitted`.
 */
async function verifyVoidLive(orderId: string) {
  const before = await denganBatas(
    () => provider.checkTransaction({ merchantOrderId: orderId }, config),
    `status before ${orderId}`,
  );
  const voided = await denganBatas(() => provider.voidTransaction(orderId, config), `void ${orderId}`);
  const after = await denganBatas(
    () => provider.checkTransaction({ merchantOrderId: orderId }, config),
    `status after ${orderId}`,
  );
  return { before, voided, after };
}

/**
 * Batalkan transaksi probe segera setelah dibuat (Cancel Order resmi, GET
 * `/pg/payment/card/cancel/{orderId}`). Transaksi yang belum dibayar akan
 * berstatus cancelled dan tidak bisa dibayar lagi.
 */
async function cancelOrder(orderId: string): Promise<{ ok: boolean; expected: boolean; detail: string }> {
  const cancel = await denganBatas(() => provider.cancelTransaction(orderId, config), `cancel ${orderId}`);
  const msg = `${cancel.message ?? ""} ${cancel.error ?? ""}`;
  // QRIS/e-wallet belum membentuk sesi provider, sehingga Cancel Order menolak
  // dengan 4040100 "Invalid Transaction Status". Itu batasan kanal, bukan bug;
  // dihitung sebagai hasil yang diharapkan.
  const expected = !cancel.success && (cancel.statusCode === "4040100" || /Invalid Transaction Status/i.test(msg));
  return {
    ok: cancel.success,
    expected,
    detail: `${cancel.statusCode}${cancel.message ? ` — ${cancel.message}` : ""}${
      cancel.error ? ` (${cancel.error.slice(0, 80)})` : ""
    }`,
  };
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE LIVE Finpay — payload resmi per kanal (sourceOfFunds)");
  console.log(`   Merchant : ${MERCHANT_ID}`);
  console.log(`   Amount   : Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log(`   Mode     : ${SANDBOX ? "sandbox (devo.finnet.co.id)" : "PRODUKSI (live.finnet.co.id)"}`);
  console.log("=".repeat(96));

  // ── 0. Mode fokus Void (PROBE_VOID=<orderId>) ─────────────────────────────
  if (VOID_ORDER) {
    console.log(`\nMODE VOID — order ${VOID_ORDER}\n`);
    const { before, voided, after } = await verifyVoidLive(VOID_ORDER);
    // `4030015 Transaction Not Permitted` = order belum dibayar → belum layak
    // di-void. Itu hasil yang diharapkan, bukan kegagalan probe.
    const expected = !voided.success && voided.statusCode === "4030015";
    const results: ProbeChannelResult[] = [
      {
        method: "void",
        group: "after-payment",
        ok: voided.success,
        ...(expected ? { expected: true } : {}),
        statusCode: voided.statusCode,
        detail:
          `status ${before.statusCode || before.status} → void ${voided.statusCode}` +
          `${voided.message ? ` (${voided.message})` : ""} → status ${after.statusCode || after.status}`,
        ...(voided.success || expected
          ? {}
          : { error: voided.error || "void gagal" }),
      },
    ];
    console.log(`   status sebelum : ${before.status} (${before.statusCode})`);
    console.log(`   void           : ${voided.success ? "OK" : "DITOLAK"} ${voided.statusCode} ${voided.message ?? ""}`);
    console.log(`   status sesudah : ${after.status} (${after.statusCode})`);
    if (expected) console.log("   → Order belum dibayar; Void belum berlaku (bukan kegagalan).");

    const summary = summarize("finpay", results, {
      source: "live",
      sideEffects: voided.success ? 0 : 1,
      notes: [
        "Mode PROBE_VOID: memverifikasi Void atas order yang diberikan.",
        "Sandbox Finpay tidak menyediakan simulator pembayaran; bayar dulu order-nya (transfer/e-wallet) sebelum menjalankan ini.",
      ],
    });
    emitProbeJson(summary);
    console.log(
      `\nRingkasan: ${summary.passed}/${summary.tested} lolos · ${summary.expected} diharapkan · ${summary.failed} gagal.`,
    );
    return;
  }

  const results: ProbeChannelResult[] = [];
  let dibuat = 0;
  let dibatalkan = 0;
  let gagalBatal = 0;
  let batalDiharapkan = 0;
  const cancelGagal: string[] = [];

  // ── 1. Daftar kanal (statis — Finpay tidak menyediakan endpoint daftar kanal) ──
  const daftar = await provider.getPaymentMethods({ amount: AMOUNT }, config);
  results.push({
    method: "list_channels",
    group: "katalog",
    ok: daftar.success && daftar.methods.length > 0,
    detail: `${daftar.methods.length} kanal (statis, SOF ID resmi)`,
  });
  console.log(`\nKatalog kanal (statis): ${daftar.methods.length} kanal\n`);

  // ── 2. Satu invoice per kanal (Core API / Hosted Payment) ─────────────────
  let kanal = CHANNELS;
  if (ONLY.length) {
    kanal = kanal.filter((c) => ONLY.includes(c.method) || ONLY.includes(toFinpayPaymentMethod(c.method) || ""));
  }

  for (const c of kanal) {
    const sof = toFinpayPaymentMethod(c.method);
    const { res, body, orderId } = await probeChannel(c.method, c.group);
    const label = `${c.method} (${sof})`.padEnd(24);

    if (res.success) {
      dibuat++;
      // Bersihkan segera agar dashboard sandbox tidak menumpuk.
      let cancelDetail = "";
      if (!NO_CANCEL) {
        const c2 = await cancelOrder(orderId);
        cancelDetail = ` · cancel=${c2.ok ? "OK" : c2.expected ? "n/a" : "GAGAL"}`;
        if (c2.ok) dibatalkan++;
        else if (c2.expected) batalDiharapkan++;
        else {
          gagalBatal++;
          cancelGagal.push(`${c.method}: ${c2.detail}`);
        }
      }
      results.push({
        method: c.method,
        group: c.group,
        ok: true,
        detail: `${describeSof(body)} | ${ringkasInvoice(res)}${cancelDetail}`,
      });
      console.log(`✅ ${label} ${describeSof(body)} | ${ringkasInvoice(res)}${cancelDetail}`);
    } else {
      const error = String(res.error ?? "").slice(0, 150);
      // "Feature Not Allowed" = kanal belum diaktifkan untuk akun merchant ini,
      // bukan payload yang salah. Dihitung sebagai "diharapkan", bukan gagal.
      const expected = /Feature Not Allowed/i.test(error);
      results.push({
        method: c.method,
        group: c.group,
        ok: false,
        ...(expected ? { expected: true } : {}),
        error,
        hint: hintFinpayError(res.rawResponse?.responseCode, error),
      });
      console.log(`${expected ? "⏭️ " : "❌"} ${label} ${error.slice(0, 110)}`);
    }
  }

  // ── 3. Hosted Payment (tanpa paymentMethod) ───────────────────────────────
  const beforeHosted = sent.length;
  const orderHosted = `PROBE-FINPAY-HOSTED-${Date.now().toString(36)}`;
  const hosted = await denganBatas(
    () =>
      provider.createInvoice(
        {
          orderId: orderHosted,
          amount: AMOUNT,
          productDetails: "Probe Finpay Hosted",
          customer: { name: "Buayar Probe", email: "probe@buayar.test" },
          returnUrl: config.returnUrl!,
          callbackUrl: config.callbackUrl!,
        },
        config,
      ),
    "hosted",
  );
  const hostedBody = sent.length > beforeHosted ? sent[sent.length - 1].body : undefined;
  if (hosted.success) {
    dibuat++;
    let cancelDetail = "";
    if (!NO_CANCEL) {
      const c2 = await cancelOrder(orderHosted);
      cancelDetail = ` · cancel=${c2.ok ? "OK" : c2.expected ? "n/a" : "GAGAL"}`;
      if (c2.ok) dibatalkan++;
      else if (c2.expected) batalDiharapkan++;
      else {
        gagalBatal++;
        cancelGagal.push(`hosted_redirect: ${c2.detail}`);
      }
    }
    results.push({
      method: "hosted_redirect",
      group: "Hosted Payment",
      ok: true,
      detail: `${describeSof(hostedBody)} | ${ringkasInvoice(hosted)}${cancelDetail}`,
    });
    console.log(`\n✅ hosted_redirect          ${describeSof(hostedBody)} | ${ringkasInvoice(hosted)}${cancelDetail}`);
  } else {
    results.push({
      method: "hosted_redirect",
      group: "Hosted Payment",
      ok: false,
      error: String(hosted.error ?? "").slice(0, 150),
    });
    console.log(`\n❌ hosted_redirect          ${String(hosted.error ?? "").slice(0, 110)}`);
  }

  // ── 4. Header Basic auth & normalisasi telepon yang benar-benar dikirim ──
  {
    const last = sent.find((s) => String(s.body || "").includes("order")) || sent[sent.length - 1];
    const expectedAuth = "Basic " + Buffer.from(`${MERCHANT_ID}:${MERCHANT_KEY}`).toString("base64");
    const authOk = last?.auth === expectedAuth;
    results.push({
      method: "auth_header",
      group: "keamanan",
      ok: authOk,
      detail: authOk ? "Authorization: Basic base64(merchantId:merchantKey) sesuai dokumen" : "header tidak sesuai",
      ...(authOk ? {} : { error: "Authorization header tidak cocok dengan dokumen resmi" }),
    });
    console.log(`\n${authOk ? "✅" : "❌"} auth_header              base64(merchantId:merchantKey) ${authOk ? "OK" : "TIDAK COCOK"}`);

    // Finpay menolak nomor format lokal ("0812…"); SDK harus mengirim E.164.
    let sentPhone = "";
    try {
      sentPhone = JSON.parse(String(last?.body || "{}")).customer?.mobilePhone || "";
    } catch {}
    const phoneOk = sentPhone === "+6281234567890";
    results.push({
      method: "phone_normalization",
      group: "keamanan",
      ok: phoneOk,
      detail: `customer.mobilePhone terkirim = ${sentPhone || "(kosong)"}`,
      ...(phoneOk ? {} : { error: "nomor lokal tidak dinormalisasi ke E.164 +62" }),
    });
    console.log(`${phoneOk ? "✅" : "❌"} phone_normalization      "081234567890" → "${sentPhone || "(kosong)"}"`);
  }

  // ── 5. Status check (GET /pg/payment/card/check/{orderId}) ────────────────
  if (hosted.success || results.some((r) => r.ok && r.group === "Virtual Account")) {
    const checkOrder = orderHosted;
    const check = await denganBatas(
      () => provider.checkTransaction({ merchantOrderId: checkOrder }, config),
      "status-check",
    );
    const lastReq = sent[sent.length - 1];
    const pakaiGet = lastReq?.method === "GET" && /\/pg\/payment\/card\/check\//.test(lastReq.url);
    // Status "not found" tetap sah sebagai bukti endpoint GET dipanggil dengan benar.
    const ok = pakaiGet && (check.success || /not.?found/i.test(String(check.statusMessage ?? "")));
    results.push({
      method: "status_check",
      group: "after-payment",
      ok,
      detail: `GET ${pakaiGet ? "OK" : "SALAH"} | status=${check.status} code=${check.statusCode}`,
      ...(ok ? {} : { error: String(check.error ?? check.statusMessage ?? "status check gagal") }),
    });
    console.log(
      `\n${ok ? "✅" : "❌"} status_check             GET /pg/payment/card/check/{orderId} · status=${check.status} (${check.statusCode})`,
    );
  } else {
    results.push({
      method: "status_check",
      group: "after-payment",
      ok: false,
      expected: true,
      error: "dilewati: tidak ada invoice yang berhasil dibuat",
    });
  }

  // ── 6. Integritas signature callback (offline, tanpa network) ─────────────
  {
    const fields = {
      customer: { id: "probe@buayar.test" },
      order: { id: "PROBE-FINPAY-CB", reference: "PROBE-REF", amount: AMOUNT, currency: "IDR" },
      result: { payment: { amount: AMOUNT, status: "PAID", channel: "014" } },
    };
    const signature = generateFinpaySignature(fields, MERCHANT_KEY);

    const sah = await provider.verifyCallback({ ...fields, signature }, config);
    const palsu = await provider.verifyCallback(
      { ...fields, result: { payment: { amount: AMOUNT, status: "PAID" } }, signature: "deadbeef" },
      config,
    );

    const signatureOk = signature.length === 128;
    const terimaSah = sah.isValid === true && sah.isPaid === true;
    const tolakPalsu = palsu.isValid === false && palsu.isPaid === false && palsu.status === "failed";
    const aman = signatureOk && terimaSah && tolakPalsu;
    results.push({
      method: "callback_signature",
      group: "keamanan",
      ok: aman,
      detail: `sig=${signature.length} char · sah→isValid=${sah.isValid} isPaid=${sah.isPaid} · palsu→isValid=${palsu.isValid} isPaid=${palsu.isPaid}`,
      ...(aman ? {} : { error: "verifikasi signature callback tidak sesuai dokumen/fail-closed" }),
    });
    console.log(`\n${"-".repeat(96)}`);
    console.log("INTEGRITAS CALLBACK — HMAC-SHA512(json_encode(body − signature), Merchant Key)");
    console.log(`   panjang signature   : ${signature.length} (harus 128)`);
    console.log(`   callback sah        : isValid=${sah.isValid} isPaid=${sah.isPaid}`);
    console.log(`   callback palsu      : isValid=${palsu.isValid} isPaid=${palsu.isPaid}`);
    console.log(aman ? "   → AMAN: signature sah diterima, signature palsu ditolak." : "   → BAHAYA: verifikasi signature tidak sesuai.");
    console.log("-".repeat(96));
  }

  // ── 7. Pembersihan: laporkan cancel sebagai hasil tersendiri ──────────────
  if (!NO_CANCEL && dibuat > 0) {
    results.push({
      method: "cleanup_cancel",
      group: "after-payment",
      ok: gagalBatal === 0,
      detail: `${dibatalkan}/${dibuat} dibatalkan · ${batalDiharapkan} kanal belum bisa cancel (QRIS/e-wallet)`,
      ...(gagalBatal ? { error: `gagal batal: ${cancelGagal.slice(0, 3).join("; ")}` } : {}),
    });
    console.log(
      `\n${gagalBatal === 0 ? "✅" : "❌"} cleanup_cancel            ${dibatalkan}/${dibuat} dibatalkan · ${batalDiharapkan} belum bisa cancel`,
    );
  }

  const summary = summarize("finpay", results, {
    source: "live",
    // Side-effect = transaksi yang MASIH tertinggal (belum dibatalkan).
    sideEffects: NO_CANCEL ? dibuat : gagalBatal,
    notes: [
      "Katalog kanal bersifat statis (Finpay tidak menyediakan endpoint daftar kanal).",
      NO_CANCEL
        ? "PROBE_NO_CANCEL=1 — transaksi sengaja tidak dibatalkan."
        : `Cancel Order menengahi ${dibatalkan}/${dibuat} transaksi; ${batalDiharapkan} kanal belum bisa cancel (QRIS/e-wallet); ${gagalBatal} gagal dibatalkan.`,
    ],
  });

  emitProbeJson(summary);

  console.log("=".repeat(96));
  console.log(
    `Ringkasan: ${summary.passed}/${summary.tested} lolos · ${summary.expected} diharapkan · ${summary.failed} gagal.`,
  );
  const gagal = results.filter((r) => !r.ok && !r.expected);
  if (gagal.length) {
    console.log("Gagal:");
    for (const g of gagal) console.log(`  • ${g.method}: ${g.error ?? "—"}`);
  }
  console.log(
    NO_CANCEL
      ? `\n⚠️  ${dibuat} transaksi sandbox dibuat (PROBE_NO_CANCEL=1 — dibiarkan kedaluwarsa).`
      : `\n⚠️  ${dibuat} transaksi sandbox dibuat; ${dibatalkan} dibatalkan, ${batalDiharapkan} belum bisa cancel (QRIS/e-wallet), ${gagalBatal} gagal dibatalkan.`,
  );
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe Finpay gagal:", err?.message || err);
  process.exit(1);
});
