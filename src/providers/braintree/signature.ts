import { createHash, createHmac } from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Verifikasi Braintree webhook signature (SHA1 HMAC dari bt_payload).
 * Header contains: bt_signature=public_key|sha1_hmac & bt_payload=base64_encoded
 */
export function verifyBraintreeWebhook(btSignature: string, btPayload: string, privateKey: string): boolean {
  if (!privateKey || !btSignature || !btPayload) return false;

  try {
    const parts = btSignature.split("|");
    if (parts.length < 2) return false;

    const providedHmac = parts[1];
    const payload = Buffer.from(btPayload, "base64").toString("utf8");

    const secretHash = createHash("sha1").update(privateKey).digest("hex");
    const expected = createHmac("sha1", secretHash).update(payload).digest("hex");
    return safeCompare(expected, providedHmac);
  } catch {
    return false;
  }
}

/**
 * Build Basic Auth untuk Braintree API (public_key:private_key)
 */
export function buildBraintreeBasicAuth(publicKey: string, privateKey: string): string {
  return Buffer.from(`${publicKey}:${privateKey}`).toString("base64");
}
