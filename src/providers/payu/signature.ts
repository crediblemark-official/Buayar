import { createHash, createHmac } from "crypto";

/**
 * Verifikasi PayU webhook signature (MD5 atau SHA-256 dari OpenPayU-Signature header).
 * Format header: sender=checkout;signature=<md5_hash>;algorithm=MD5;version=2.1
 */
export function verifyPayuWebhook(rawBody: string, signatureHeader: string, md5Key: string): boolean {
  if (!md5Key || !signatureHeader || !rawBody) return false;

  try {
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(";")) {
      const [k, v] = part.split("=");
      if (k && v) parts[k.trim()] = v.trim();
    }

    const providedSig = parts["signature"];
    const algorithm = (parts["algorithm"] || "MD5").toUpperCase();

    if (algorithm === "MD5") {
      const expected = createHash("md5").update(rawBody + md5Key).digest("hex");
      return expected === providedSig;
    } else if (algorithm === "SHA-256") {
      const expected = createHash("sha256").update(rawBody + md5Key).digest("hex");
      return expected === providedSig;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Build Basic Auth untuk PayU Token endpoint
 */
export function buildPayuBasicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}
