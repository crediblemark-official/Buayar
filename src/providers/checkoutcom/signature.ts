import { createHmac } from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Verifikasi Checkout.com webhook signature (HMAC-SHA256).
 * Header: Cko-Signature: sha256=<hex_digest>
 */
export function verifyCheckoutComWebhook(body: string, signatureHeader: string, secret: string): boolean {
  if (!secret || !signatureHeader || !body) return false;

  try {
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const provided = signatureHeader.replace(/^sha256=/, "");
    return safeCompare(expected, provided);
  } catch {
    return false;
  }
}
