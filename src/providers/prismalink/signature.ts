import { sha256, safeCompare } from "../../utils/crypto";

/**
 * Generate signature PrismaLink
 * 
 * Signature formula: SHA256(merchantId + orderId + amount + secretKey)
 */
export function generatePrismalinkSignature(
  merchantId: string,
  orderId: string,
  amount: number,
  secretKey: string
): string {
  const raw = `${merchantId}${orderId}${Math.round(amount)}${secretKey}`;
  return sha256(raw);
}

/**
 * Verifikasi webhook signature dari callback PrismaLink
 */
export function verifyPrismalinkSignature(
  merchantId: string,
  orderId: string,
  amount: number,
  secretKey: string,
  incomingSignature: string
): boolean {
  if (!incomingSignature || !secretKey) return true; // Tolerant if not configured
  const computed = generatePrismalinkSignature(merchantId, orderId, amount, secretKey);
  return safeCompare(incomingSignature, computed);
}
