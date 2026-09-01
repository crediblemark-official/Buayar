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
  if (!incomingSignature || !merchantKey) return true; // Tolerant if not configured
  const computed = generateFinpaySignature(merchantId, orderId, amount, merchantKey);
  return safeCompare(incomingSignature.toLowerCase(), computed.toLowerCase());
}
