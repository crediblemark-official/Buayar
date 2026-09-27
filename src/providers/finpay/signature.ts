import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Signature notifikasi (callback) Finpay.
 *
 * Sumber otoritatif — docs resmi Finpay, "Notification Callback":
 *   https://docs.finpay.id/api-reference/finpay-pg/after-payment/notification-callback.md
 *
 *   hash_hmac("sha512", json_encode($fields), $key);
 *
 * Catatan penting dari dokumen:
 *   • `$fields` adalah SELURUH body callback TANPA field `signature`.
 *   • `$key` adalah **Merchant Key** (bukan Merchant ID).
 *   • Hasilnya hex 128 karakter (512 bit).
 *
 * Finpay mengirim callback dalam bentuk object bersarang:
 *   { customer, order: { id, amount, ... }, result: { payment: { status, ... } }, signature }
 * sehingga hashing harus dilakukan atas JSON yang utuh (urutan key
 * dipertahankan oleh `JSON.parse`), bukan atas gabungan string buatan sendiri.
 *
 * PHP `json_encode` secara default meng-escape `/` menjadi `\/` dan karakter
 * non-ASCII menjadi `\uXXXX`. Untuk itu verifier menerima dua bentuk
 * serialisasi (plain dan gaya PHP) selama HMAC-nya cocok — ini tidak melemahkan
 * keamanan karena penyerang tetap harus mengetahui Merchant Key.
 */

/** Serialisasi gaya PHP `json_encode` default (escape `/` dan non-ASCII). */
function phpJsonEncode(value: unknown): string {
  return JSON.stringify(value)
    .replace(/[\u007f-\uffff]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"))
    .replace(/\//g, "\\/");
}

/** Salinan body tanpa field `signature` (sesuai `$fields` di dokumen Finpay). */
function fieldsWithoutSignature(fields: unknown): unknown {
  if (!fields || typeof fields !== "object") return fields;
  if (Array.isArray(fields)) return fields.map((v) => fieldsWithoutSignature(v));
  const clone: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
  delete clone.signature;
  return clone;
}

/**
 * Hasilkan signature callback Finpay (hex HMAC-SHA512).
 *
 * `fields` adalah body callback lengkap; field `signature` di dalamnya akan
 * diabaikan/dibuang sebelum dihitung, sesuai dokumen resmi.
 */
export function generateFinpaySignature(fields: unknown, merchantKey: string): string {
  const clean = fieldsWithoutSignature(fields);
  return crypto.createHmac("sha512", merchantKey).update(JSON.stringify(clean)).digest("hex");
}

/**
 * Verifikasi signature callback Finpay. Fail-closed:
 * tanpa signature atau merchant key → `false` (tidak pernah melempar).
 */
export function verifyFinpaySignature(
  fields: unknown,
  merchantKey: string,
  incomingSignature: string,
): boolean {
  if (!incomingSignature || !merchantKey) return false;

  const clean = fieldsWithoutSignature(fields);
  const plain = JSON.stringify(clean);
  const php = phpJsonEncode(clean);

  const candidates = new Set<string>([
    crypto.createHmac("sha512", merchantKey).update(plain).digest("hex"),
  ]);
  if (php !== plain) {
    candidates.add(crypto.createHmac("sha512", merchantKey).update(php).digest("hex"));
  }

  for (const candidate of candidates) {
    if (safeCompare(incomingSignature, candidate)) return true;
  }
  return false;
}
