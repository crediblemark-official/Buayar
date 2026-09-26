/**
 * RECEIVER WEBHOOK DOKU — penerima Notification URL lokal untuk uji manual VA.
 *
 * Jalankan server ini, ekspos ke internet (mis. `localhost.run`:
 *   ssh -R 80:localhost:4571 nokey@localhost.run
 * ), lalu isi URL hasil ekspos ke DOKU Back Office:
 *   Settings → Payment Settings → Virtual Account SNAP → CONFIGURE → Notification URL.
 *
 * Setiap notifikasi diverifikasi memakai `DokuProvider.verifyCallback` (fail-closed)
 * dengan raw body asli, dan dicatat lengkap ke `doku-notifications.log` (JSONL).
 *
 * Pemakaian:
 *   DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... bun run scripts/receive-doku-notification.ts
 *   PORT=4571 DOKU_... bun run scripts/receive-doku-notification.ts
 *
 * Uji cepat tanpa DOKU (notifikasi SNAP VA ber-signature valid + palsu, dikirim lokal):
 *   DOKU_SECRET_KEY=SK-... bun run scripts/receive-doku-notification.ts --selftest
 */

import { createServer } from "http";
import { appendFileSync, readFileSync, existsSync } from "fs";
import { Buayar, generateSnapSymmetricSignature } from "../../../src";

const PORT = Number(process.env.PORT || 4571);
const CLIENT_ID = (process.env.DOKU_CLIENT_ID || "").trim();
const SECRET_KEY = (process.env.DOKU_SECRET_KEY || process.env.DOKU_API_KEY || "").trim();
const LOG_FILE = process.env.NOTIF_LOG_FILE || "doku-notifications.log";
const SELFTEST = process.argv.includes("--selftest");

const buayar = new Buayar({
  provider: "doku",
  merchantCode: CLIENT_ID || "BRN-0268-1789326133127",
  apiKey: SECRET_KEY || "SK-secret",
  sandbox: true,
  extra: { snap: true, notificationPath: "/payments/notifications" },
});

function line(): string {
  return "-".repeat(96);
}

async function handle(req: any, res: any) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");

  let body: any = null;
  try {
    body = JSON.parse(raw);
  } catch {}

  // Verifikasi fail-closed via SDK — raw body asli dipakai untuk digest HMAC.
  const result = await buayar.verifyWebhook(body ?? {}, { ...req.headers }, { rawBody: raw });

  const record = {
    receivedAt: new Date().toISOString(),
    path: url.pathname,
    method: req.method,
    headers: req.headers,
    body,
    verify: {
      isValid: result.isValid,
      isPaid: result.isPaid,
      status: result.status,
      orderId: result.orderId,
      amount: result.amount,
      statusCode: result.statusCode,
      provider: result.provider,
    },
  };
  appendFileSync(LOG_FILE, JSON.stringify(record) + "\n");

  const verdict = result.isValid ? (result.isPaid ? "✅ VALID + PAID" : "✅ VALID") : "❌ INVALID (ditolak)";
  console.log(`\n${line()}`);
  console.log(`📬 ${new Date().toISOString()}  ${req.method} ${url.pathname}`);
  console.log(`   Verifikasi : ${verdict}`);
  console.log(`   Order      : ${result.orderId || "-"} · Amount: ${result.amount || "-"} · Status: ${result.status}${result.statusCode ? ` (${result.statusCode})` : ""}`);
  if (body?.virtualAccountNo) console.log(`   VA         : ${String(body.virtualAccountNo).trim()}`);
  if (body?.channel?.id) console.log(`   Channel    : ${body.channel.id}`);
  console.log(`   Tercatat   : ${LOG_FILE}`);

  // DOKU SNAP menganggap HTTP 200 sebagai ack (body respons opsional).
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ responseCode: "2002500", responseMessage: "Success" }));
}

/** Kirim 2 notifikasi uji: signature valid & palsu — harus VALID dan INVALID. */
async function selftest() {
  const post = async (trxId: string, sig: string) => {
    const body = {
      partnerServiceId: "   95962",
      customerNo: "60000000043838",
      virtualAccountNo: "   9596260000000043838",
      virtualAccountName: "Selftest",
      trxId,
      paidAmount: { value: "10000.00", currency: "IDR" },
    };
    const raw = JSON.stringify(body);
    return fetch(`http://localhost:${PORT}/payments/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TIMESTAMP": "2026-09-26T09:00:00.000Z", "X-SIGNATURE": sig },
      body: raw,
    });
  };

  const bodyValid = JSON.stringify({
    partnerServiceId: "   95962",
    customerNo: "60000000043838",
    virtualAccountNo: "   9596260000000043838",
    virtualAccountName: "Selftest",
    trxId: "SELFTEST-VALID",
    paidAmount: { value: "10000.00", currency: "IDR" },
  });
  const sigValid = generateSnapSymmetricSignature(
    SECRET_KEY || "SK-secret",
    "POST",
    "/payments/notifications",
    "",
    bodyValid,
    "2026-09-26T09:00:00.000Z"
  );

  const r1 = await post("SELFTEST-VALID", sigValid);
  const r2 = await post("SELFTEST-FORGED", "aW52YWxpZHNpZ25hdHVyZWZha2s9");

  await new Promise((r) => setTimeout(r, 200)); // beri waktu append log
  const tail = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").trim().split("\n").slice(-2) : [];
  console.log(`\n${line()}`);
  console.log(`🧪 SELFTEST — HTTP valid=${r1.status} forged=${r2.status}`);
  for (const l of tail) {
    const rec = JSON.parse(l);
    console.log(`   ${rec.body?.trxId}: isValid=${rec.verify.isValid} isPaid=${rec.verify.isPaid} status=${rec.verify.status}`);
  }
  console.log(line());
  process.exit(0);
}

const server = createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error("❌ Error handler:", e?.message || e);
    res.writeHead(500);
    res.end(JSON.stringify({ responseCode: "5000000", responseMessage: "Internal error" }));
  });
});

server.listen(PORT, () => {
  console.log(line());
  console.log(`📬 Receiver notifikasi DOKU berjalan di http://localhost:${PORT}`);
  console.log(`   Log        : ${LOG_FILE}`);
  console.log(`   Kredensial : ${CLIENT_ID ? CLIENT_ID : "(default)"} / ${SECRET_KEY ? "***diset***" : "(default, WAJIB diset untuk verifikasi asli)"}`);
  console.log(line());
  if (SELFTEST) {
    selftest().catch((e) => {
      console.error("❌ Selftest gagal:", e?.message || e);
      process.exit(1);
    });
    return;
  }
  console.log("Langkah uji manual:");
  console.log("  1. Ekspos ke internet, contoh localhost.run:");
  console.log(`       ssh -R 80:localhost:${PORT} nokey@localhost.run`);
  console.log("  2. Buka hasil URL ke DOKU Back Office → Settings → Payment Settings");
  console.log("     → Virtual Account SNAP → CONFIGURE → Notification URL (per bank).");
  console.log("  3. Bayar VA lewat kanal bank asli (lihat howToPayPage tiap VA).");
  console.log("  4. Notifikasi masuk di sini & tercatat — verifikasi signature otomatis.");
  console.log(line());
});
