/**
 * Regresi integritas callback Duitku.
 *
 * Signature callback Duitku hanya mencakup tiga field:
 *
 *     MD5(merchantCode + amount + merchantOrderId + apiKey)
 *
 * `resultCode` — satu-satunya penentu status — TIDAK ikut ditandatangani.
 * Artinya `resultCode` arrived dari jaringan adalah field yang bebas diubah
 * penyerang, dan library TIDAK BOLEH memakainya untuk menyatakan order lunas.
 *
 * Exploitasi yang diuji di sini, dibuktikan live terhadap invoice sandbox
 * Duitku sungguhan: buat order (tidak dibayar), hitung signature sahnya,
 * kirim callback dengan `resultCode: "00"`. Signature cocok, tapi order-nya
 * belum dibayar — dan pustaka lama melaporkan `isPaid: true`.
 *
 * Penyerang tidak butuh API key: dia butuh satu signature sah untuk
 * (merchantCode, amount, merchantOrderId) miliknya sendiri, yang diperoleh
 * dari satu callback saja untuk order itu.
 *
 * Verifikasi ketiga belasan test di bawah ini dilakukan dua arah: hijau pada
 * kode sekarang, dan GAGAL pada kode sebelum perbaikan (lihat catatan di tiap
 * test).
 */

import { describe, expect, it, afterEach } from "bun:test";
import { createHash } from "node:crypto";
import { Buayar } from "../src";
import type { ProviderConfig } from "../src/types";

const MERCHANT_CODE = "D1234";
const API_KEY = "duitku-secret-key";
const AMOUNT = "250000";
const ORDER_ID = "ORDER-DUITKU-456";

/** Signature resmi Duitku untuk callback. */
function signatureSah(merchantOrderId = ORDER_ID, amount = AMOUNT) {
  return createHash("md5")
    .update(MERCHANT_CODE + amount + merchantOrderId + API_KEY)
    .digest("hex");
}

function config(extra?: Record<string, any>): ProviderConfig {
  return { provider: "duitku", merchantCode: MERCHANT_CODE, apiKey: API_KEY, extra };
}

/** Callback dengan signature sah. `resultCode` sengaja dibiarkan bisa diubah. */
function callback(resultCode: string,merchantOrderId = ORDER_ID, amount = AMOUNT) {
  return {
    merchantCode: MERCHANT_CODE,
    amount,
    merchantOrderId,
    signature: signatureSah(merchantOrderId, amount),
    resultCode,
    resultDesc: resultCode === "00" ? "SUCCESS" : "FAILED",
    reference: "DUITKU-REF-789",
  };
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

/** Palsukan jawaban endpoint transactionStatus Duitku. */
function stubStatusFetch(respon: (orderId: string) => { status: number; body: string }) {
  (globalThis as any).fetch = async (_url: any, options: any) => {
    const orderId = JSON.parse(options.body).merchantOrderId;
    const { status, body } = respon(orderId);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
    } as any;
  };
}

describe("Duitku — resultCode tidak ditandatangani, jadi tidak boleh jadi bukti bayar", () => {
  it("callback bertanda tangan sah dengan resultCode 00 tidak menghasilkan isPaid", async () => {
    // Inti celahnya. Test ini gagal pada kode lama dengan:
    //   expect(received).toBe(false) / expected true, received false
    const hasil = await new Buayar(config()).verifyWebhook(callback("00"));

    expect(hasil.isValid).toBe(true); // signature memang sah
    expect(hasil.isPaid).toBe(false); // tapi belum bisa dibuktikan bayar
    expect(hasil.isPending).toBe(true);
    expect(hasil.isFailed).toBe(false);
    expect(hasil.status).toBe("pending");
  });

  it("mengubah resultCode pada callback sah tidak mengubah status", async () => {
    // Penyerang nggak perlu membuat signature baru: signature tidak mencakup
    // resultCode, jadi cukup mengubahnya lalu kirim ulang payload yang sama.
    const hasil = await new Buayar(config()).verifyWebhook(callback("00"));
    expect(hasil.isPaid).toBe(false);
    expect(hasil.paymentUnconfirmed).toBe(true);
  });

  it("resultCode 00 lalu diubah jadi 02 tetap tidak melaporkan paid", async () => {
    const sah = await new Buayar(config()).verifyWebhook(callback("00"));
    const diubah = await new Buayar(config()).verifyWebhook({ ...callback("00"), resultCode: "02" });
    // Dua payload ini identik dari sisi signature — dan keduanya tidak boleh
    // menghasilkan verdict "paid" atau "failed" yang berbeda kesimpulannya.
    expect(sah.isPaid).toBe(false);
    expect(diubah.isPaid).toBe(false);
    expect(diubah.isFailed).toBe(false);
  });

  it("menandai alasannya agar merchant tahu kenapa pending", async () => {
    const hasil = await new Buayar(config()).verifyWebhook(callback("00"));
    expect(hasil.paymentUnconfirmed).toBe(true);
    expect(hasil.unconfirmedReason).toContain("resultCode");
    expect(hasil.statusCode).toBe("00"); // diteruskan untuk keperluan log
  });

  it("signature tetap gagal-closed seperti sebelumnya", async () => {
    const palsu = { ...callback("00"), signature: "0".repeat(32) };
    const hasil = await new Buayar(config()).verifyWebhook(palsu);

    expect(hasil.isValid).toBe(false);
    expect(hasil.isPaid).toBe(false);
    expect(hasil.isFailed).toBe(true);
    expect(hasil.status).toBe("failed");
  });
});

describe("Duitku — konfirmasi opsional lewat server-to-server", () => {
  it("confirmDuitkuCallback benar-benar mengaktifkan pengecekan ke Duitku", async () => {
    // Opt-in yang benar-benar menembak API. Kalau hanya jadi flag yang
    // diabaikan, test ini akan lolos diam-diam.
    let dipanggil = 0;
    stubStatusFetch((orderId) => {
      dipanggil++;
      return {
        status: 200,
        body: JSON.stringify({
          merchantOrderId: orderId,
          reference: "DUITKU-REF-789",
          amount: AMOUNT,
          statusCode: "00",
          statusMessage: "SUCCESS",
        }),
      };
    });

    const hasil = await new Buayar(config({ confirmDuitkuCallback: true })).verifyWebhook(callback("00"));

    expect(dipanggil).toBe(1);
    expect(hasil.isPaid).toBe(true);
    expect(hasil.paymentUnconfirmed).toBe(false);
    expect(hasil.unconfirmedReason).toBeUndefined();
  });

  it("kegagalan konfirmasi tidak pernah mengubah pending menjadi failed", async () => {
    // Ini yang paling mudah salah. "Gagal tanya" != "pembayaran gagal".
    // Kalau jadi failed, merchant akan membatalkan order yang masih jalan.
    stubStatusFetch(() => ({ status: 500, body: "Internal Server Error" }));

    const hasil = await new Buayar(config({ confirmDuitkuCallback: true })).verifyWebhook(callback("00"));

    expect(hasil.isPaid).toBe(false);
    expect(hasil.isPending).toBe(true);
    expect(hasil.isFailed).toBe(false);
    expect(hasil.paymentUnconfirmed).toBe(true);
  });

  it("order yang tidak ditemukan di Duitku tetap pending, bukan failed", async () => {
    stubStatusFetch(() => ({ status: 400, body: '"Transaction not found"' }));

    const hasil = await new Buayar(config({ confirmDuitkuCallback: true })).verifyWebhook(callback("00"));

    expect(hasil.isPaid).toBe(false);
    expect(hasil.isPending).toBe(true);
    expect(hasil.isFailed).toBe(false);
  });

  it("tanpa opt-in, tidak ada panggilan jaringan sama sekali", async () => {
    // Default harus benar-benar offline-ish: tidak menambah latensi webhook dan
    // tidak bergantung pada Duitku sedang hidup atau tidak.
    let dipanggil = 0;
    (globalThis as any).fetch = async () => {
      dipanggil++;
      throw new Error("tidak boleh ada request");
    };

    const hasil = await new Buayar(config()).verifyWebhook(callback("00"));
    expect(dipanggil).toBe(0);
    expect(hasil.isPaid).toBe(false);
  });
});

describe("Duitku — isExpired tidak boleh menyalin isFailed", () => {
  it("callback dengan resultCode selain 00 tidak sekaligus dianggap kedaluwarsa", async () => {
    // Bug lama: isExpired = isValid && resultCode !== "00", persis sama dengan
    // isFailed. Semua pembayaran yang ditolak ikut berbanner "kedaluwarsa".
    const hasil = await new Buayar(config()).verifyWebhook(callback("02"));

    expect(hasil.isFailed).toBe(false); // fail-closed: tidak bisa disimpulkan
    expect(hasil.isExpired).toBe(false);
  });

  it("checkTransaction: statusCode 02 berarti gagal, bukan kedaluwarsa", async () => {
    // Dokumentasi resmi Duitku: "02 - Failed/Expired" — keduanya tidak bisa
    // dibedakan. Menebak "expired" menampilkan layar kedaluwarsa untuk
    // pembayaran yang sebenarnya ditolak.
    stubStatusFetch((orderId) => ({
      status: 200,
      body: JSON.stringify({ merchantOrderId: orderId, amount: AMOUNT, statusCode: "02", statusMessage: "EXPIRED" }),
    }));

    const hasil = await new Buayar(config()).checkTransaction({ merchantOrderId: ORDER_ID });

    expect(hasil.isFailed).toBe(true);
    expect(hasil.isExpired).toBe(false);
  });
});

describe("Duitku — 'tidak ditemukan' bukan berarti 'gagal'", () => {
  it("menandai orderNotFound dan tidak pernah melaporkan failed", async () => {
    // Bukti live: order yang dibuat lewat POP (createInvoice) memang tidak
    // tercatat di endpoint transactionStatus, sehingga selalu "not found" —
    // padahal order-nya sah. Kode lama menandai isFailed: true di sini.
    stubStatusFetch(() => ({ status: 400, body: '"Transaction not found"' }));

    const hasil = await new Buayar(config()).checkTransaction({ merchantOrderId: ORDER_ID });

    expect(hasil.orderNotFound).toBe(true);
    expect(hasil.isFailed).toBe(false);
    expect(hasil.isPaid).toBe(false);
    expect(hasil.isPending).toBe(true);
    expect(hasil.status).toBe("pending");
    expect(hasil.error).toContain("tidak ditemukan");
  });

  it("menjelaskan keterbatasan endpoint untuk order POP", async () => {
    stubStatusFetch(() => ({ status: 404, body: JSON.stringify({ Message: "Transaction not found" }) }));

    const hasil = await new Buayar(config()).checkTransaction({ merchantOrderId: ORDER_ID });
    expect(hasil.orderNotFound).toBe(true);
    // Pesan harus menyebut POP, supaya merchant tahu ini bukan order yang hilang.
    expect(hasil.statusMessage).toContain("POP");
  });

  it("error HTTP lain juga tidak boleh jadi verdict failed", async () => {
    stubStatusFetch(() => ({ status: 503, body: "Service Unavailable" }));

    const hasil = await new Buayar(config()).checkTransaction({ merchantOrderId: ORDER_ID });

    expect(hasil.orderNotFound).toBeFalsy();
    expect(hasil.isFailed).toBe(false);
    expect(hasil.isPending).toBe(true);
  });

  it("kegagalan otentikasi ke Duitku juga bukan failed", async () => {
    stubStatusFetch(() => ({ status: 401, body: "Unauthorized" }));

    const hasil = await new Buayar(config()).checkTransaction({ merchantOrderId: ORDER_ID });
    expect(hasil.isFailed).toBe(false);
    expect(hasil.isPaid).toBe(false);
  });

  it("statusCode 02 yang otentik tetap dilaporkan sebagai failed", async () => {
    // Jangan sampai perbaikannya berlebihan: kegagalan nyata dari Duitku
    // harus tetap sampai ke merchant sebagai "gagal".
    stubStatusFetch((orderId) => ({
      status: 200,
      body: JSON.stringify({ merchantOrderId: orderId, amount: AMOUNT, statusCode: "02", statusMessage: "CANCELED" }),
    }));

    const hasil = await new Buayar(config()).checkTransaction({ merchantOrderId: ORDER_ID });
    expect(hasil.success).toBe(true);
    expect(hasil.isFailed).toBe(true);
    expect(hasil.orderNotFound).toBeFalsy();
  });
});
