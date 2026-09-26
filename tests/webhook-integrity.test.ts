/**
 * Regresi untuk dua bug keamanan yang ditemukan lewat probe kredensial sandbox
 * (lihat scripts/probe/webhook-signature-live.ts). Keduanya TIDAK bisa ditangkap
 * unit test biasa karena butuh kredensial asli atau kombinasi body+rawBody.
 *
 * BUG 1 — rawBody/body desync (semua provider yang verifikasi HMAC atas raw body)
 *   Signature dihitung atas `rawBody`, tapi data bisnis (orderId, amount, status)
 *   dibaca dari `body` yang terpisah. Kalau keduanya berbeda, penyerang bisa
 *   mengirim rawBody asli yang sah — signature lolos — sambil menyodorkan `body`
 *   pilihan mereka. Order diteruskan, jumlah dan status dikendalikan penyerang.
 *
 * BUG 2 — Xendit webhook token dibaca dari sumber yang salah
 *   `BUAYAR_WEBHOOK_SECRET` (nama yang dipakai README/sandbox.md) mengisi
 *   `extra.webhookSecret`, sementara Xendit membaca `extra.webhookToken`. Akibatnya
 *   `webhookToken` jatuh ke fallback API key dan 100% webhook ditolak.
 *
 * Semua test di sini offline dan deterministik.
 */

import { describe, it, expect } from "bun:test";
import { createHash, createHmac } from "crypto";
import { Buayar } from "../src";

const DOKU_CLIENT_ID = "BRN-TEST-0001";
const DOKU_SECRET_KEY = "SK-TEST-DOKU-KEY-0001";
const DOKU_REQUEST_TARGET = "/api/payment/webhook";
const XENDIT_TOKEN = "xendit-token-untuk-regresi";

/** Header DOKU yang sah untuk `rawBody` tertentu. */
function dokuHeadersFor(rawBody: string, overrides: Record<string, string> = {}) {
  const requestId = "req-regresi-001";
  const timestamp = "2026-01-01T00:00:00Z";
  const digest = createHash("sha256").update(rawBody).digest("base64");
  const component =
    `Client-Id:${DOKU_CLIENT_ID}\n` +
    `Request-Id:${requestId}\n` +
    `Request-Timestamp:${timestamp}\n` +
    `Request-Target:${DOKU_REQUEST_TARGET}\n` +
    `Digest:${digest}`;
  const signature = `HMACSHA256=${createHmac("sha256", DOKU_SECRET_KEY).update(component).digest("base64")}`;
  return {
    "Client-Id": DOKU_CLIENT_ID,
    "Request-Id": requestId,
    "Request-Timestamp": timestamp,
    "Request-Target": DOKU_REQUEST_TARGET,
    "Digest": digest,
    "Signature": signature,
    ...overrides,
  };
}

describe("rawBody / body desync — data bisnis wajib mengikuti byte yang ditandatangani", () => {
  // Bentuk notifikasi resmi DOKU Jokul: order.invoice_number + transaction.status.
  const authentic = {
    order: { invoice_number: "ORD-ASLI-001", amount: 10000 },
    transaction: { status: "SUCCESS" },
  };
  const rawBody = JSON.stringify(authentic);

  it("DOKU: body dipalsukan tidak boleh mengubah amount yang dilaporkan", async () => {
    const buayar = new Buayar({
      provider: "doku",
      apiKey: DOKU_SECRET_KEY,
      secretKey: DOKU_SECRET_KEY,
      merchantCode: DOKU_CLIENT_ID,
      clientKey: DOKU_CLIENT_ID,
      sandbox: true,
    });

    // Penyerang: rawBody asli (signature sah) + body palsu berisi amount 1.
    const forged = {
      order: { invoice_number: "ORD-ASLI-001", amount: 1 },
      transaction: { status: "SUCCESS" },
    };
    const res = await buayar.verifyWebhook(forged, dokuHeadersFor(rawBody), { rawBody });

    expect(res.amount).toBe(10000);
    expect(res.orderId).toBe("ORD-ASLI-001");
  });

  it("DOKU: body dipalsukan tidak boleh mengubah status yang dilaporkan", async () => {
    const buayar = new Buayar({
      provider: "doku",
      apiKey: DOKU_SECRET_KEY,
      secretKey: DOKU_SECRET_KEY,
      merchantCode: DOKU_CLIENT_ID,
      clientKey: DOKU_CLIENT_ID,
      sandbox: true,
    });

    // Tanpa perbaikan, byte aslinya (SUCCESS) akan dibaca sebagai PENDING dari body palsu.
    const forged = {
      order: { invoice_number: "ORD-ASLI-001", amount: 10000 },
      transaction: { status: "PENDING" },
    };
    const res = await buayar.verifyWebhook(forged, dokuHeadersFor(rawBody), { rawBody });

    expect(res.isPaid).toBe(true); // status sebenarnya SUCCESS — ikut rawBody
  });

  it("DOKU: rawBody yang tidak cocok dengan header Digest tetap ditolak", async () => {
    const buayar = new Buayar({
      provider: "doku",
      apiKey: DOKU_SECRET_KEY,
      secretKey: DOKU_SECRET_KEY,
      merchantCode: DOKU_CLIENT_ID,
      clientKey: DOKU_CLIENT_ID,
      sandbox: true,
    });

    // Headers sah untuk rawBody A, tapi rawBody yang dikirim adalah B.
    const headers = dokuHeadersFor(rawBody);
    const otherRaw = JSON.stringify({
      order: { invoice_number: "ORD-LAIN", amount: 1 },
      transaction: { status: "SUCCESS" },
    });
    const res = await buayar.verifyWebhook(JSON.parse(otherRaw), headers, { rawBody: otherRaw });

    expect(res.isValid).toBe(false);
    expect(res.isPaid).toBe(false);
  });

  it("Square: body dipalsukan tidak boleh mengubah amount yang dilaporkan", async () => {
    const signatureKey = "sim_square_sigkey_123";
    const notificationUrl = "https://merchant.example.com/webhook";
    const authentic = {
      id: "sq-001",
      type: "payment.updated",
      data: { object: { id: "sq-001", amount_money: { amount: 10000, currency: "IDR" } } },
    };
    const sqRaw = JSON.stringify(authentic);
    const signature = createHmac("sha256", signatureKey)
      .update(notificationUrl + sqRaw)
      .digest("base64");

    const buayar = new Buayar({
      provider: "square",
      apiKey: "sandbox-sq-token",
      callbackUrl: notificationUrl,
      sandbox: true,
      extra: {
        webhookSignatureKey: signatureKey,
        signatureHeader: "x-square-hmacsha256-signature",
      },
    });

    const forged = {
      id: "sq-001",
      type: "payment.updated",
      data: { object: { id: "sq-001", amount_money: { amount: 1, currency: "IDR" } } },
    };
    const res = await buayar.verifyWebhook(
      forged,
      { "x-square-hmacsha256-signature": signature, "content-type": "application/json" },
      { rawBody: sqRaw }
    );

    expect(res.isValid).toBe(true); // signature memang mengesahkan rawBody asli
    expect(res.amount).toBe(10000); // …tapi angka harus dari rawBody
  });

  it("tanpa rawBody, provider berbasis-HMAC tetap menolak (fail-closed)", async () => {
    const buayar = new Buayar({
      provider: "doku",
      apiKey: DOKU_SECRET_KEY,
      secretKey: DOKU_SECRET_KEY,
      merchantCode: DOKU_CLIENT_ID,
      clientKey: DOKU_CLIENT_ID,
      sandbox: true,
    });

    const res = await buayar.verifyWebhook(authentic, dokuHeadersFor(rawBody));
    expect(res.isValid).toBe(false);
    expect(res.isPaid).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe("Xendit — webhook token dibaca dari sumber yang benar", () => {
  const payload = {
    id: "inv-001",
    external_id: "ORD-XENDIT-001",
    status: "PAID",
    amount: 10000,
    payment_method: "BCA_VA",
  };

  it("webhookToken eksplisit dipakai langsung", async () => {
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_development_secret",
      webhookToken: XENDIT_TOKEN,
      sandbox: true,
    });
    const res = await buayar.verifyWebhook(payload, { "x-callback-token": XENDIT_TOKEN });
    expect(res.isValid).toBe(true);
    expect(res.isPaid).toBe(true);
  });

  it("webhookSecret TIDAK boleh dipakai sebagai webhookToken", async () => {
    // Kontrak penting: secret key dan verification token adalah nilai BERBEDA
    // di dashboard Xendit. Kalau keduanya dicampur, verifikasi diam-diam rusak.
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_development_secret",
      secretKey: "xnd_development_secret",
      sandbox: true,
    });
    const res = await buayar.verifyWebhook(payload, { "x-callback-token": "xnd_development_secret" });
    expect(res.isValid).toBe(false);
  });

  it("token absen ditolak, dan error menyebut konfigurasi", async () => {
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_development_secret",
      webhookToken: XENDIT_TOKEN,
      sandbox: true,
    });
    const res = await buayar.verifyWebhook(payload);
    expect(res.isValid).toBe(false);
    expect(res.isPaid).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe("ProviderConfig — webhookToken/webhookSecret bisa dipakai tanpa cast", () => {
  it("keduanya bertipe string dan masuk ke extra", () => {
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_development_secret",
      webhookToken: "token-a",
      webhookSecret: "secret-b",
      sandbox: true,
    });
    const extra = (buayar.getConfig() as { extra?: Record<string, unknown> }).extra;
    expect(extra?.webhookToken).toBe("token-a");
    expect(extra?.webhookSecret).toBe("secret-b");
  });
});
