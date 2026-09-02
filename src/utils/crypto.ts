import crypto from "crypto";

/**
 * Generate MD5 hash string (lowercase)
 */
export function md5(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Generate SHA-256 hash string (lowercase)
 */
export function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Generate SHA-512 hash string (lowercase)
 */
export function sha512(data: string): string {
  return crypto.createHash("sha512").update(data).digest("hex");
}

/**
 * Generate HMAC-SHA256 hash string (lowercase hex)
 */
export function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Timing-safe string comparison menggunakan crypto.timingSafeEqual
 * untuk mencegah timing attack pada perbandingan signature.
 * Kedua string dibandingkan dalam format hex yang konsisten (tidak di-lowercase
 * di sini karena hmacSha256 sudah mengembalikan lowercase hex).
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    // Fallback: jika bukan hex valid, bandingkan sebagai string biasa
    // Ini tetap timing-safe untuk string dengan panjang sama
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}
