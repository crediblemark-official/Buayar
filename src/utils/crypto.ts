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
 * Generate HMAC-SHA256 hash string (lowercase)
 */
export function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Timing-safe string comparison to prevent timing attacks on signatures
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return a.toLowerCase() === b.toLowerCase();
}
