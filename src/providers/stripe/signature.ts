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
 * Verifikasi webhook signature Stripe (stripe-signature header).
 *
 * Format header: t=1492774577,v1=5257a869e7ecebeda32affa62cd323fa9d214e1b50613e039f08f6362ced773d
 *
 * Keamanan:
 * - Jika signatureHeader atau webhookSecret tidak ada → return false (TIDAK pernah return true).
 *   Gunakan flag `skipVerification: true` secara eksplisit di kode test jika ingin bypass.
 * - Pemeriksaan timestamp (replay attack protection): jika selisih antara
 *   timestamp header dan waktu sekarang melebihi `toleranceSeconds`, return false.
 * - Perbandingan signature menggunakan `safeCompare` (timing-safe via crypto.timingSafeEqual).
 *
 * @param rawPayload  Body request mentah (string atau object; jika object akan di-JSON.stringify)
 * @param signatureHeader  Nilai header `stripe-signature`
 * @param webhookSecret   Webhook Signing Secret dari dashboard Stripe (`whsec_...`)
 * @param toleranceSeconds  Toleransi selisih timestamp (default: 300 detik / 5 menit)
 * @returns true jika signature valid dan timestamp dalam toleransi; false selainnya
 */
export function verifyStripeWebhook(
  rawPayload: string | any,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds: number = 300
): boolean {
  // ─── SECURITY: Jangan pernah return true jika header/secret tidak ada ───
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const items = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const item of items) {
    const eqIdx = item.indexOf("=");
    if (eqIdx === -1) continue;
    const key = item.slice(0, eqIdx).trim();
    const value = item.slice(eqIdx + 1).trim();
    if (key === "t") {
      timestamp = value;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  // ─── SECURITY: Validasi timestamp (replay attack protection) ─────────────
  const tsNum = Number(timestamp);
  if (Number.isNaN(tsNum) || tsNum <= 0) {
    return false;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > toleranceSeconds) {
    // Timestamp terlalu lama atau terlalu jauh di masa depan → kemungkinan replay/forged
    return false;
  }

  const payloadString = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);
  const signedPayload = `${timestamp}.${payloadString}`;
  const expectedSignature = hmacSha256(signedPayload, webhookSecret);

  // ─── Periksa apakah salah satu v1 signature cocok ────────────────────────
  // safeCompare menggunakan crypto.timingSafeEqual — kedua nilai sudah lowercase hex dari hmacSha256
  return signatures.some((sig) => safeCompare(sig, expectedSignature));
}
