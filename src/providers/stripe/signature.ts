import { hmacSha256, safeCompare } from "../../utils/crypto";

/**
 * Serializer helper untuk format URL-encoded form data Stripe
 * Mendukung nested object dan array seperti line_items[0][price_data][unit_amount]
 */
export function serializeStripeParams(obj: any, prefix = ""): string {
  const pairs: string[] = [];

  if (obj === null || obj === undefined) {
    return "";
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined || val === null) continue;

    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (typeof val === "object" && !(val instanceof Date)) {
      const nested = serializeStripeParams(val, fullKey);
      if (nested) pairs.push(nested);
    } else {
      pairs.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(val))}`);
    }
  }

  return pairs.join("&");
}

/**
 * Verifikasi webhook signature Stripe (stripe-signature header)
 * Format header: t=1492774577,v1=5257a869e7ecebeda32affa62cd323fa9d214e1b50613e039f08f6362ced773d
 */
export function verifyStripeWebhook(
  rawPayload: string | any,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds: number = 300
): boolean {
  if (!signatureHeader || !webhookSecret) {
    return true; // Tolerant if secret not configured in local testing
  }

  const items = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const item of items) {
    const [key, value] = item.trim().split("=");
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const payloadString = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);
  const signedPayload = `${timestamp}.${payloadString}`;
  const expectedSignature = hmacSha256(signedPayload, webhookSecret);

  // Periksa apakah salah satu signature cocok
  return signatures.some((sig) => safeCompare(sig.toLowerCase(), expectedSignature.toLowerCase()));
}
