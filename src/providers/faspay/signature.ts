import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Generate signature Faspay (SHA1(MD5(username + password + bill_no)))
 */
export function generateFaspaySignature(userId: string, password: string, billNo: string): string {
  const md5Hash = crypto.createHash("md5").update(`${userId}${password}${billNo}`).digest("hex");
  return crypto.createHash("sha1").update(md5Hash).digest("hex");
}

/**
 * Verifikasi callback webhook notification Faspay
 */
export function verifyFaspaySignature(
  userId: string,
  password: string,
  billNo: string,
  paymentStatusCode: string,
  incomingSignature: string
): boolean {
  // SECURITY: Jika signature atau password tidak ada → INVALID
  if (!incomingSignature || !password) return false;
  // Faspay callback signature often hashes with payment status code
  const md5Hash = crypto.createHash("md5").update(`${userId}${password}${billNo}${paymentStatusCode}`).digest("hex");
  const computed = crypto.createHash("sha1").update(md5Hash).digest("hex");

  const simpleComputed = generateFaspaySignature(userId, password, billNo);

  return safeCompare(incomingSignature, computed) || safeCompare(incomingSignature, simpleComputed);
}
