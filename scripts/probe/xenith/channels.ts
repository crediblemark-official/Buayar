/**
 * Probe live Xenith Pay.
 *
 * Menguji integrasi langsung dengan sandbox Xenith Pay:
 *   1. Pengecekan saldo (GET /v1/balances)
 *   2. Hosted Payment Links (POST /v1/payment-links)
 *   3. Direct Pay In (POST /v1/payins) untuk QRIS dan Virtual Account
 *   4. Payout channels & account inquiry
 *   5. Verifikasi Webhook Fail-Closed (offline)
 *
 * Catatan Keamanan:
 * Xenith menerapkan IP Whitelist wajib di sandbox & production.
 * Bila IP belum terdaftar, API mengembalikan 401 UNKNOWN_IP_ADDRESS.
 *
 * Kredensial WAJIB dari environment (tidak ada default yang tertanam):
 *   XENITH_ACCESS_KEY, XENITH_SECRET_KEY, [XENITH_WEBHOOK_SECRET]
 */

import { XenithProvider } from "../../../src/providers/xenith/provider";
import { XenithClient } from "../../../src/clients/xenith";
import type { ProviderConfig, CanonicalPaymentMethod } from "../../../src/types";
import { emitProbeJson, summarize, assertProbeTargetsSandbox, type ProbeChannelResult } from "../lib";

const ACCESS_KEY = (process.env.XENITH_ACCESS_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SECRET_KEY = (process.env.XENITH_SECRET_KEY || process.env.BUAYAR_SECRET_KEY || "").trim();
const WEBHOOK_SECRET = (process.env.XENITH_WEBHOOK_SECRET || process.env.BUAYAR_WEBHOOK_SECRET || "").trim();
const SANDBOX = (process.env.XENITH_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error("❌ XENITH_ACCESS_KEY dan XENITH_SECRET_KEY wajib diset.");
  process.exit(1);
}

assertProbeTargetsSandbox({
  provider: "Xenith",
  sandbox: SANDBOX,
  apiKey: ACCESS_KEY,
});

const config: ProviderConfig = {
  provider: "xenith",
  apiKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
  webhookSecret: WEBHOOK_SECRET,
  sandbox: SANDBOX,
  callbackUrl: "https://example.com/webhook",
  returnUrl: "https://example.com/return",
};

/** Kenali blokir IP allowlist agar hasilnya bisa ditandai sebagai hambatan akun. */
function hintXenith(error: string | undefined): string | undefined {
  if (/IP Address is invalid|UNKNOWN_IP_ADDRESS|unauthorized/i.test(String(error))) {
    return "IP publik mesin ini belum didaftarkan di IP Whitelist dashboard Xenith; ini batasan akun, bukan bug SDK.";
  }
  return undefined;
}

async function main() {
  console.log("=========================================");
  console.log("🔍 Xenith Pay Sandbox Live Probe");
  console.log("=========================================");
  console.log(`Endpoint: https://openapi.sandbox.xenithpay.com`);
  console.log(`Access Key: ${ACCESS_KEY.slice(0, 10)}...`);
  console.log(`Mode: ${SANDBOX ? "sandbox" : "PRODUKSI"}`);

  const provider = new XenithProvider();
  const client = new XenithClient({ accessKey: ACCESS_KEY, secretKey: SECRET_KEY, sandbox: SANDBOX });

  const results: ProbeChannelResult[] = [];

  // 1. Saldo
  console.log("\n[1/5] Memeriksa Saldo Akun (GET /v1/balances)...");
  try {
    const balRes = await provider.checkBalance(config);
    results.push({
      method: "check_balance",
      group: "akun",
      ok: balRes.success,
      detail: balRes.success ? `${balRes.currency || "IDR"} ${balRes.balance}` : undefined,
      ...(balRes.success ? {} : { error: String(balRes.error), hint: hintXenith(balRes.error) }),
    });
    console.log(balRes.success ? `✅ Saldo: ${balRes.currency || "IDR"} ${balRes.balance}` : `❌ Gagal saldo: ${balRes.error}`);
  } catch (err: any) {
    results.push({ method: "check_balance", group: "akun", ok: false, error: err.message, hint: hintXenith(err.message) });
    console.error(`❌ Error saldo: ${err.message}`);
  }

  // 2. Hosted Payment Link
  console.log("\n[2/5] Menguji Pembuatan Hosted Payment Link...");
  try {
    const orderId = `PLR-${Date.now()}`;
    const invoiceRes = await provider.createInvoice(
      { orderId, amount: 50000, customer: { name: "Budi Santoso", email: "budi@example.com", phone: "08123456789" } },
      config,
    );
    results.push({
      method: "hosted_redirect",
      group: "Hosted Payment",
      ok: invoiceRes.success,
      detail: invoiceRes.success ? `ref=${invoiceRes.reference} url=${String(invoiceRes.paymentUrl).slice(0, 60)}…` : undefined,
      ...(invoiceRes.success ? {} : { error: String(invoiceRes.error), hint: hintXenith(invoiceRes.error) }),
    });
    console.log(invoiceRes.success ? `✅ Payment Link: ${invoiceRes.paymentUrl}` : `❌ Gagal Payment Link: ${invoiceRes.error}`);
  } catch (err: any) {
    results.push({ method: "hosted_redirect", group: "Hosted Payment", ok: false, error: err.message, hint: hintXenith(err.message) });
    console.error(`❌ Error Payment Link: ${err.message}`);
  }

  // 3. Direct Pay In
  console.log("\n[3/5] Menguji Direct Pay In (QRIS & Virtual Accounts)...");
  const testChannels: Array<{ method: CanonicalPaymentMethod; label: string }> = [
    { method: "qris", label: "QRIS" },
    { method: "bri_va", label: "BRI Virtual Account" },
    { method: "mandiri_va", label: "Mandiri Virtual Account" },
    { method: "bni_va", label: "BNI Virtual Account" },
    { method: "permata_va", label: "Permata Virtual Account" },
    { method: "cimb_va", label: "CIMB Niaga Virtual Account" },
    { method: "danamon_va", label: "Danamon Virtual Account" },
  ];

  for (const ch of testChannels) {
    try {
      const orderId = `TRX-${String(ch.method).toUpperCase()}-${Date.now()}`;
      const res = await provider.createInvoice(
        { orderId, amount: 25000, paymentMethod: ch.method, customer: { name: "Budi Santoso", email: "budi@example.com", phone: "08123456789" } },
        config,
      );
      if (res.success) {
        results.push({
          method: String(ch.method),
          group: "Direct Pay In",
          ok: true,
          detail: [res.vaNumber ? `VA=${res.vaNumber}` : "", res.qrString ? `QR=${res.qrString.slice(0, 24)}…` : "", res.paymentUrl ? `URL=${String(res.paymentUrl).slice(0, 48)}…` : ""]
            .filter(Boolean)
            .join(" | ") || `ref=${res.reference} mode=${res.mode}`,
        });
        console.log(`  ✅ [${ch.label}] ${res.vaNumber ? `VA=${res.vaNumber}` : res.paymentUrl ? `URL=${res.paymentUrl}` : "OK"}`);
      } else {
        results.push({ method: String(ch.method), group: "Direct Pay In", ok: false, error: String(res.error), hint: hintXenith(res.error) });
        console.log(`  ❌ [${ch.label}] ${res.error}`);
      }
    } catch (e: any) {
      results.push({ method: String(ch.method), group: "Direct Pay In", ok: false, error: e.message, hint: hintXenith(e.message) });
      console.log(`  ❌ [${ch.label}] Error: ${e.message}`);
    }
  }

  // 4. Payout channels & inquiry
  console.log("\n[4/5] Menguji Payout Channels & Account Inquiry (Disbursement)...");
  try {
    const channels = await client.request("GET", "/v1/payouts/channels?currency=IDR");
    const count = channels?.data?.length || 0;
    results.push({ method: "payout_channels", group: "Disbursement", ok: count > 0, detail: `${count} kanal bank aktif` });
    console.log(`  ✅ Payout channels: ${count} kanal`);
    try {
      const inq = await client.syncAccountInquiry({
        destinationPayoutMethod: "BANK_TRANSFER",
        destinationPayoutChannel: "CENAIDJA",
        destinationPayoutAccount: "1234567890",
      });
      results.push({ method: "account_inquiry", group: "Disbursement", ok: true, detail: "inquiry dijawab" });
      console.log(`  ✅ Inquiry rekening dijawab`);
    } catch (inqErr: any) {
      // INVALID_ACCOUNT = bank live menjawab, jadi ini sukses kontrak.
      const ok = /INVALID_ACCOUNT/i.test(String(inqErr.message));
      results.push({
        method: "account_inquiry",
        group: "Disbursement",
        ok,
        error: ok ? undefined : String(inqErr.message),
        hint: ok ? "bank live menjawab (INVALID_ACCOUNT sesuai harapan)" : hintXenith(inqErr.message),
      });
      console.log(`  ${ok ? "✅" : "❌"} Inquiry: ${inqErr.message}`);
    }
  } catch (e: any) {
    results.push({ method: "payout_channels", group: "Disbursement", ok: false, error: e.message, hint: hintXenith(e.message) });
    console.log(`  ❌ Payout channels error: ${e.message}`);
  }

  // 5. Webhook signature (offline)
  console.log("\n[5/5] Menguji Verifikasi Webhook Signature Kriptografis...");
  const timestamp = new Date().toISOString();
  const urlPath = "/v1/webhook";
  const dummyPayload = {
    schemaVersion: "1.0.1",
    event: "PAYIN_STATUS_UPDATED",
    data: { id: "payin-test-001", referenceCode: "TEST-01", status: "SUCCESS", paymentAmount: "50000" },
  };
  const rawBody = JSON.stringify(dummyPayload);
  const { createHmac } = await import("node:crypto");
  const dataToSign = `POST\\n${urlPath}\\n${rawBody}\\n${timestamp}`;
  const validSignature = createHmac("sha256", WEBHOOK_SECRET).update(dataToSign).digest("base64");

  const verified = await provider.verifyCallback(
    dummyPayload,
    { ...config, rawBody, extra: { urlPath } },
    { "x-xenith-signature": validSignature, "x-xenith-timestamp": timestamp },
  );
  const webhookOk = verified.isValid && verified.isPaid && verified.amount === 50000;
  results.push({
    method: "webhook_signature",
    group: "keamanan",
    ok: webhookOk,
    detail: webhookOk ? `status=${verified.status} amount=${verified.amount}` : undefined,
    ...(webhookOk ? {} : { error: String(verified.error || "webhook sah gagal diverifikasi") }),
  });
  console.log(webhookOk ? `✅ Webhook sah terverifikasi (status=${verified.status})` : `❌ Gagal verifikasi webhook sah: ${verified.error}`);

  const rejected = await provider.verifyCallback(
    dummyPayload,
    { ...config, rawBody, extra: { urlPath } },
    { "x-xenith-signature": "tampered-signature", "x-xenith-timestamp": timestamp },
  );
  const failClosed = !rejected.isValid;
  results.push({
    method: "webhook_fail_closed",
    group: "keamanan",
    ok: failClosed,
    detail: failClosed ? "signature palsu ditolak" : undefined,
    ...(failClosed ? {} : { error: "SIGNATURE PALSU LOLOS" }),
  });
  console.log(failClosed ? "✅ Fail-closed: signature palsu ditolak" : "❌ BAHAYA: signature palsu lolos");

  const summary = summarize("xenith", results, {
    source: "live",
    sideEffects: 0,
    notes: ["Xenith menerapkan IP whitelist; bila IP belum terdaftar semua panggilan API ditolak."],
  });
  emitProbeJson(summary);

  console.log("\n" + "=".repeat(41));
  console.log(`Ringkasan: ${summary.passed}/${summary.tested} lolos · ${summary.expected} diharapkan · ${summary.failed} gagal.`);
  console.log("=".repeat(41));
}

main().catch((err) => {
  console.error("❌ Probe Xenith gagal:", err?.message || err);
  process.exit(1);
});
