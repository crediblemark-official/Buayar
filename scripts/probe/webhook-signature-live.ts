/**
 * PROBE LIVE — verifikasi signature webhook memakai kredensial sandbox ASLI.
 *
 * Berbeda dengan `bun test` (yang memakai secret palsu), probe ini membuktikan
 * signature yang DIHITUNG dari kode kita cocok dengan algoritma resmi PG,
 * karena memakai server key / secret key asli dari sandbox.md.
 *
 * Untuk tiap provider diuji 3 skenario:
 *   1. signature BENAR  → wajib isValid: true
 *   2. signature SALAH  → wajib isValid: false
 *   3. signature ABSENT → wajib isValid: false
 *
 * Test 2 dan 3 inilah yang membuktikan fail-closed bekerja di produksi —
 * unit test dengan secret palsu tidak bisa membuktikannya.
 *
 * Pemakaian: /tmp/opencode/sbenv.sh bun run scripts/probe/webhook-signature-live.ts
 */

import { createHash, createHmac } from "crypto";
import { Buayar } from "../../src";

const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

type Row = { provider: string; scenario: string; pass: boolean; detail: string };
const rows: Row[] = [];

function record(provider: string, scenario: string, pass: boolean, detail: string) {
  rows.push({ provider, scenario, pass, detail });
  const icon = pass ? "✅" : "❌";
  console.log(`${icon} ${provider.padEnd(9)} ${scenario.padEnd(22)} ${detail}`);
}

// ─────────────────────────── MIDTRANS ───────────────────────────
// Resmi: signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)
{
  const serverKey = process.env.MIDTRANS_SERVER_KEY || "";
  const orderId = "MIDTRANS-LIVE-PROBE-001";
  const statusCode = "200";
  const grossAmount = "10000.00";
  const good = sha512(orderId + statusCode + grossAmount + serverKey);

  const base = {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    transaction_status: "capture",
    fraud_status: "accept",
  };

  const buayar = new Buayar({ provider: "midtrans", apiKey: serverKey, serverKey, sandbox: true });

  const r1 = await buayar.verifyWebhook({ ...base, signature_key: good });
  record("midtrans", "signature benar", r1.isValid && r1.isPaid, `isValid=${r1.isValid} isPaid=${r1.isPaid}`);

  // Serangan: tanda tangan tetap milik amount ASLI, tapi amount di payload diganti.
  // Ini persis yang dilakukan penyerang untuk memesan lebih murah dari yang dibayar.
  const r2 = await buayar.verifyWebhook({ ...base, gross_amount: "999.00", signature_key: good });
  record("midtrans", "amount dipalsukan", !r2.isValid && !r2.isPaid, `isValid=${r2.isValid} isPaid=${r2.isPaid}`);

  const r3 = await buayar.verifyWebhook({ ...base });
  record("midtrans", "signature absen", !r3.isValid && !r3.isPaid, `isValid=${r3.isValid} isPaid=${r3.isPaid}`);
}

// ─────────────────────────── IPAYMU ───────────────────────────
// Resmi: X-Signature = HMAC-SHA256(stringToSign, VA number)
{
  const va = process.env.IPAYMU_VIRTUAL_ACCOUNT || "";
  // Format resmi iPaymu (docs.ipaymu.com/en/docs/callback): status "berhasil",
  // status_code Integer 1. Field mengikuti contoh payload resmi.
  const payload = {
    trx_id: 12345678,
    reference_id: "IPAYMU-LIVE-PROBE-001",
    status: "berhasil",
    status_code: 1,
    transaction_status_code: 1,
    amount: "100000",
    total: "100000",
    sub_total: "100000",
    fee: "1500",
    paid_off: 98500,
    is_escrow: false,
    additional_info: [],
    buyer_email: "customer@example.com",
    via: "va",
    channel: "bca",
  };
  const { buildIpaymuCallbackString } = await import("../../src/providers/ipaymu/signature");
  const sig = createHmac("sha256", va).update(buildIpaymuCallbackString(payload)).digest("hex");

  const buayar = new Buayar({ provider: "ipaymu", apiKey: process.env.IPAYMU_API_KEY, merchantCode: va, sandbox: true });

  const r1 = await buayar.verifyWebhook(payload, { "x-signature": sig });
  record("ipaymu", "signature benar", r1.isValid && r1.isPaid, `isValid=${r1.isValid} isPaid=${r1.isPaid}`);

  // Content-type default iPaymu adalah x-www-form-urlencoded → semua nilai tiba
  // sebagai STRING, termasuk status_code. Normalisasi parseInt wajib bekerja,
  // karena iPaymu meng-hash versi Integer-nya.
  const asForm: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    asForm[k] = Array.isArray(v) ? "[]" : typeof v === "boolean" ? (v ? "1" : "0") : String(v);
  }
  delete asForm.additional_info; // sering hilang di form-urlencoded
  const sigForm = createHmac("sha256", va).update(buildIpaymuCallbackString(asForm)).digest("hex");
  const rForm = await buayar.verifyWebhook(asForm, { "x-signature": sigForm });
  record("ipaymu", "form-urlencoded", rForm.isValid && rForm.isPaid, `isValid=${rForm.isValid} isPaid=${rForm.isPaid}`);

  const r2 = await buayar.verifyWebhook(payload, { "x-signature": "a".repeat(64) });
  record("ipaymu", "signature salah", !r2.isValid && !r2.isPaid, `isValid=${r2.isValid} isPaid=${r2.isPaid}`);

  const r3 = await buayar.verifyWebhook(payload);
  record("ipaymu", "signature absen", !r3.isValid && !r3.isPaid, `isValid=${r3.isValid} isPaid=${r3.isPaid}`);
}

// ─────────────────────────── XENDIT ───────────────────────────
// Resmi: header x-callback-token dibandingkan dengan verification token
{
  const token = process.env.XENDIT_WEBHOOK_VERIFICATION_TOKEN || "";
  const payload = {
    id: "xendit_live_probe_001",
    external_id: "XENDIT-LIVE-PROBE-001",
    status: "PAID",
    amount: 10000,
    paid_amount: 10000,
    payment_method: "BCA_VA",
    transaction_type: "PAYMENT",
  };

  const buayar = new Buayar({ provider: "xendit", apiKey: process.env.XENDIT_SECRET_KEY, sandbox: true });

  const r1 = await buayar.verifyWebhook(payload, { "x-callback-token": token });
  record("xendit", "token benar", r1.isValid && r1.isPaid, `isValid=${r1.isValid} isPaid=${r1.isPaid}`);

  const r2 = await buayar.verifyWebhook(payload, { "x-callback-token": "token-palsu" });
  record("xendit", "token salah", !r2.isValid && !r2.isPaid, `isValid=${r2.isValid} isPaid=${r2.isPaid}`);

  const r3 = await buayar.verifyWebhook(payload);
  record("xendit", "token absen", !r3.isValid && !r3.isPaid, `isValid=${r3.isValid} isPaid=${r3.isPaid}`);
}

// ─────────────────────────── DOKU ───────────────────────────
// Resmi: Signature = "HMACSHA256=" + base64(HMAC-SHA256(secretKey, komponen))
// Komponen (urutan persis, dipisah \n):
//   Client-Id / Request-Id / Request-Timestamp / Request-Target / Digest
// Digest = base64(SHA-256(rawBody)). Di sini rawBody dipakai — bukan JSON.stringify —
// karena Digest harus dihitung atas byte yang benar-benar dikirim.
{
  const clientId = process.env.DOKU_CLIENT_ID || "";
  const secretKey = process.env.DOKU_SECRET_KEY || "";
  const requestTarget = "/api/payment/webhook";
  const requestId = "doku-live-probe-001";
  const timestamp = "2026-01-01T00:00:00Z";

  const payload = {
    order: { id: "DOKU-LIVE-PROBE-001", amount: 10000, status: "PAID" },
  };
  const rawBody = JSON.stringify(payload);
  const digest = createHash("sha256").update(rawBody).digest("base64");
  const component = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
  const sig = `HMACSHA256=${createHmac("sha256", secretKey).update(component).digest("base64")}`;

  const buayar = new Buayar({
    provider: "doku",
    apiKey: secretKey,
    secretKey,
    merchantCode: clientId,
    clientKey: clientId,
    sandbox: true,
  });

  const headers = {
    "Client-Id": clientId,
    "Request-Id": requestId,
    "Request-Timestamp": timestamp,
    "Request-Target": requestTarget,
    "Digest": digest,
    "Signature": sig,
  };

  const r1 = await buayar.verifyWebhook(payload, headers, { rawBody });
  record("doku", "signature benar", r1.isValid, `isValid=${r1.isValid} isPaid=${r1.isPaid}${r1.error ? " error=" + r1.error : ""}`);

  // Serangan: request-id ditukar (replay dari request lain).
  const r2 = await buayar.verifyWebhook(payload, { ...headers, "Request-Id": "request-asing" }, { rawBody });
  record("doku", "request-id ditukar", !r2.isValid, `isValid=${r2.isValid}`);

  // Serangan: `body` dipalsukan (amount diturunkan ke 1) sementara rawBody asli
  // tetap dipakai. Signature SAH — itu memang.byte yang DOKU kirim. Yang wajib
  // benar: data bisnis harus mengikuti rawBody, bukan `body` curang.
  const tampered = { order: { id: "DOKU-LIVE-PROBE-001", amount: 1, status: "PAID" } };
  const r3 = await buayar.verifyWebhook(tampered, headers, { rawBody });
  record(
    "doku",
    "body dipalsukan",
    r3.amount === 10000,
    `isValid=${r3.isValid} amount=${r3.amount} (HARUS 10000 dari rawBody, bukan 1 dari body)`
  );

  const r4 = await buayar.verifyWebhook(payload, { "Client-Id": clientId }, { rawBody });
  record("doku", "signature absen", !r4.isValid, `isValid=${r4.isValid}`);
}

// ─────────────────────────── RINGKASAN ───────────────────────────
console.log("\n" + "=".repeat(84));
const failed = rows.filter((r) => !r.pass);
console.log(`Ringkasan: ${rows.length - failed.length}/${rows.length} skenario lolos.`);
if (failed.length) {
  console.log("Gagal:");
  for (const f of failed) console.log(`  • ${f.provider} / ${f.scenario}: ${f.detail}`);
  process.exit(1);
}
console.log("=".repeat(84));
