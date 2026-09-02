import { sha256, safeCompare } from "../../utils/crypto";

/**
 * Format date ke format Nicepay: YYYYMMDDHHmmss (14 karakter)
 */
export function formatNicepayTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Generate merchantToken Nicepay: SHA256(timeStamp + iMid + referenceNo + amt + merchantKey)
 */
export function generateNicepayToken(
  timeStamp: string,
  iMid: string,
  referenceNo: string,
  amt: number | string,
  merchantKey: string
): string {
  const raw = `${timeStamp}${iMid}${referenceNo}${Math.round(Number(amt))}${merchantKey}`;
  return sha256(raw);
}

/**
 * Verifikasi webhook callback signature dari dbProcessUrl Nicepay
 */
export function verifyNicepayWebhook(
  timeStamp: string,
  iMid: string,
  referenceNo: string,
  amt: number | string,
  merchantKey: string,
  incomingToken: string
): boolean {
  // SECURITY: Jika token atau merchant key tidak ada → INVALID
  if (!incomingToken || !merchantKey) return false;
  const computed = generateNicepayToken(timeStamp, iMid, referenceNo, amt, merchantKey);
  // safeCompare menggunakan timingSafeEqual, sha256 sudah menghasilkan lowercase hex
  return safeCompare(incomingToken, computed);
}
