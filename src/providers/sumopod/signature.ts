import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Memverifikasi signature webhook Svix dari SumoPod.
 *
 * SumoPod menyertakan tiga header HTTP:
 * - `svix-id`: ID unik pesan webhook
 * - `svix-timestamp`: Unix timestamp (detik) saat webhook dikirim
 * - `svix-signature`: Satu atau lebih signature "v1,<base64>" dipisahkan spasi
 *
 * @param secret Secret signing dari tab Settings (dimulai dengan "whsec_")
 * @param svixId Nilai header `svix-id`
 * @param svixTimestamp Nilai header `svix-timestamp`
 * @param svixSignature Nilai header `svix-signature`
 * @param rawBody Request body mentah / unparsed string
 * @param toleranceSeconds Toleransi replay attack dalam detik (default 300 detik = 5 menit). Set 0 untuk nonaktifkan.
 */
export function verifySumopodSvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
  toleranceSeconds: number = 300
): boolean {
  if (!secret || !svixId || !svixTimestamp || !svixSignature || rawBody === undefined || rawBody === null) {
    return false;
  }

  // Cek replay attack berdasarkan timestamp jika toleranceSeconds > 0
  if (toleranceSeconds > 0) {
    const timestampSec = Number(svixTimestamp);
    if (isNaN(timestampSec)) {
      return false;
    }
    const currentSec = Math.floor(Date.now() / 1000);
    if (Math.abs(currentSec - timestampSec) > toleranceSeconds) {
      return false;
    }
  }

  try {
    const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const secretBytes = Buffer.from(cleanSecret, "base64");
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;

    const expectedSignature = crypto
      .createHmac("sha256", secretBytes)
      .update(signedContent)
      .digest("base64");

    // Header svix-signature dapat memuat beberapa signature terpisah spasi (misal saat rotasi key)
    const signatures = svixSignature
      .split(" ")
      .map((s) => (s.includes(",") ? s.split(",")[1] : s))
      .filter(Boolean);

    return signatures.some((sig) => safeCompare(sig, expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Memverifikasi header `x-webhook-token` SumoPod secara timing-safe.
 *
 * Alternatif yang lebih sederhana dari verifikasi signature HMAC:
 * bandingkan token proyek langsung dengan header `x-webhook-token`.
 *
 * @param expectedToken Token rahasia webhook (mis. "whtok_...")
 * @param receivedToken Nilai header `x-webhook-token` yang diterima
 */
export function verifySumopodToken(expectedToken: string, receivedToken: string): boolean {
  if (!expectedToken || !receivedToken) return false;
  return safeCompare(expectedToken.trim(), receivedToken.trim());
}
