import { createHash, createHmac } from "crypto";

/**
 * Build 2Checkout API Authentication header.
 * Format: code=MERCHANT_CODE date=DATE hash=HMAC-SHA256(MERCHANT_CODE + date + secretKey)
 */
export function buildTwoCheckoutAuth(merchantCode: string, secretKey: string): { header: string; date: string } {
  const date = Math.floor(Date.now() / 1000).toString();
  const raw = merchantCode + date;
  const hmac = createHmac("sha256", secretKey).update(raw).digest("hex");
  const header = `code="${merchantCode}" date="${date}" hash="${hmac}"`;
  return { header, date };
}

/**
 * Verifikasi 2Checkout IPN/webhook (MD5 hash).
 * hash = MD5(secretWord + saleId + productId + invoiceId)
 */
export function verifyTwoCheckoutWebhook(
  secretWord: string,
  saleId: string,
  productId: string,
  invoiceId: string,
  providedHash: string
): boolean {
  if (!secretWord || !providedHash) return false;

  try {
    const raw = secretWord + saleId + productId + invoiceId;
    const expected = createHash("md5").update(raw).digest("hex").toUpperCase();
    return expected === (providedHash || "").toUpperCase();
  } catch {
    return false;
  }
}
