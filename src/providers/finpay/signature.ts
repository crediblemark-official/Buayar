import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Generate signature Finpay HMAC-SHA512
 */
export function generateFinpaySignature(
  merchantId: string,
  orderId: string,
  amount: number,
  merchantKey: string
): string {
  const data = `${merchantId}%${orderId}%${Math.round(amount)}%${merchantKey}`;
  return crypto.createHmac("sha512", merchantKey).update(data).digest("hex");
}

/**
 * Verifikasi webhook signature notifikasi Finpay
 */
export function verifyFinpaySignature(
  merchantId: string,
  orderId: string,
  amount: number,
  merchantKey: string,
  incomingSignature: string
): boolean {
  // SECURITY: Jika signature atau merchant key tidak ada → INVALID
  if (!incomingSignature || !merchantKey) return false;
  const computed = generateFinpaySignature(merchantId, orderId, amount, merchantKey);
  // hmacSha256 dan safeCompare sudah bekerja dengan hex lowercase
  return safeCompare(incomingSignature, computed);
}
