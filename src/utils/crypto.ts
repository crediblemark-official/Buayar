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
 * untuk mencegah timing attack pada perbandingan signature / token.
 * Menggunakan SHA-256 digest untuk memastikan kedua buffer selalu berukuran 32 bytes,
 * mencegah kebocoran informasi panjang string dan mengatasi penanganan string non-hex / ganjil oleh Buffer.from.
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!a && !b) return true;
  if (!a || !b) return false;

  // Jika kedua string adalah hex dengan panjang sama, normalkan ke lowercase
  const isHexA = /^[0-9a-fA-F]+$/.test(a);
  const isHexB = /^[0-9a-fA-F]+$/.test(b);
  let strA = a;
  let strB = b;
  if (isHexA && isHexB && a.length === b.length) {
    strA = a.toLowerCase();
    strB = b.toLowerCase();
  }

  const hashA = crypto.createHash("sha256").update(strA).digest();
  const hashB = crypto.createHash("sha256").update(strB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}
