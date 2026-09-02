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
  // SECURITY: Jika header token atau expected token tidak ada → INVALID
  if (!headerToken || !expectedToken) return false;
  return safeCompare(headerToken, expectedToken);
}
