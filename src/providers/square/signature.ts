import { createHmac } from "crypto";

/**
 * Verifikasi Square webhook signature (HMAC-SHA256).
 * Header: x-square-hmacsha256-signature
 * Signature = Base64(HMAC-SHA256(signatureKey, notificationUrl + body))
 */
export function verifySquareWebhook(
  rawBody: string,
  signatureHeader: string,
  signatureKey: string,
  notificationUrl: string
): boolean {
  if (!signatureKey || !signatureHeader || !rawBody) return false;

  try {
    const payload = notificationUrl + rawBody;
    const expected = createHmac("sha256", signatureKey).update(payload).digest("base64");
    return expected === signatureHeader;
  } catch {
    return false;
  }
}
