import { createHmac } from "crypto";

/**
 * Verifikasi Razorpay webhook signature (HMAC-SHA256).
 * Header: X-Razorpay-Signature
 */
export function verifyRazorpayWebhook(rawBody: string, signature: string, webhookSecret: string): boolean {
  if (!webhookSecret || !signature || !rawBody) return false;

  try {
    const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    return expected === signature;
  } catch {
    return false;
  }
}

/**
 * Buat Basic Auth header untuk Razorpay (key_id:key_secret)
 */
export function buildRazorpayBasicAuth(keyId: string, keySecret: string): string {
  return Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}
