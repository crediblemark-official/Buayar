import { md5, sha256, hmacSha256, safeCompare } from "../../utils/crypto";

export function getDuitkuInquirySignatures(merchantCode: string, orderId: string, amount: number, apiKey: string) {
  const payloadSignature = md5(merchantCode + orderId + amount.toString() + apiKey);
  const timestamp = Date.now().toString();
  const headerSignature = sha256(merchantCode + timestamp + apiKey);

  return { payloadSignature, timestamp, headerSignature };
}

/**
 * Signature header Duitku **POP** (`POST /api/merchant/createInvoice`).
 *
 * Dokumentasi resmi Duitku POP:
 *   stringToSign = merchantCode + timestamp
 *   signature    = HMAC_SHA256(stringToSign, apiKey)   // hex lowercase
 *
 * Catatan penting:
 * - Body request **tidak** ikut ditandatangani (tidak ada field `signature` di body POP).
 * - `timestamp` adalah UNIX milidetik (zona Jakarta), dikirim di header `x-duitku-timestamp`.
 */
export function getDuitkuPopSignature(merchantCode: string, apiKey: string) {
  const timestamp = Date.now().toString();
  const signature = hmacSha256(`${merchantCode}${timestamp}`, apiKey);
  return { timestamp, signature };
}

/**
 * Verifikasi signature callback Duitku.
 *
 * Skema resmi terkini (changelog Apr 2026 — "signature enhancement using HMAC
 * and set obsolete md5 and sha256"):
 *
 *   stringToSign = merchantCode + amount + merchantOrderId
 *   signature    = HMAC_SHA256(stringToSign, apiKey)   // hex, lowercase
 *
 * Skema lama MD5(merchantCode + amount + merchantOrderId + apiKey) **masih
 * diterima** selama masa transisi agar callback yang belum dimigrasi (dan
 * sandbox lama) tidak tertolak. Menerima dua skema tidak melemahkan fail-closed:
 * keduanya tetap membutuhkan `apiKey` sebagai rahasia, dan `apiKey` yang kosong
 * ditolak lebih dulu.
 */
export function verifyDuitkuCallbackSignature(body: any, apiKey: string): boolean {
  const merchantCode = body.merchantCode || "";
  const amount = body.amount || "";
  const merchantOrderId = body.merchantOrderId || "";
  const signature = body.signature || "";

  if (!signature || !apiKey) return false;

  const stringToSign = merchantCode + amount + merchantOrderId;

  const hmacSignature = hmacSha256(stringToSign, apiKey);
  if (safeCompare(signature, hmacSignature)) return true;

  const legacySignature = md5(stringToSign + apiKey);
  return safeCompare(signature, legacySignature);
}

export function getDuitkuPaymentMethodsSignature(merchantCode: string, amount: number, datetime: string, apiKey: string): string {
  const stringToSign = merchantCode + amount.toString() + datetime;
  return hmacSha256(stringToSign, apiKey);
}

export function getDuitkuStatusSignatures(merchantCode: string, orderId: string, apiKey: string) {
  const timestamp = Date.now().toString();
  const headerSignature = sha256(merchantCode + timestamp + apiKey);
  const bodySignature = md5(merchantCode + orderId + apiKey);

  return { timestamp, headerSignature, bodySignature };
}
