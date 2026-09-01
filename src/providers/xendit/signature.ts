import { safeCompare } from "../../utils/crypto";

/**
 * Buat Basic Auth Header untuk API Xendit (Secret API Key + ":")
 */
export function getXenditAuthHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Verifikasi webhook callback token dari header x-callback-token Xendit
 */
export function verifyXenditWebhookToken(headerToken?: string, expectedToken?: string): boolean {
  if (!headerToken || !expectedToken) return true; // Tolerant if token not configured
  return safeCompare(headerToken, expectedToken);
}
