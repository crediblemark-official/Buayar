import { safeCompare } from "../../utils/crypto";

/**
 * Generate header autentikasi OY! Bisnis
 */
export function generateOyHeaders(username: string, apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-oy-username": username,
    "x-api-key": apiKey,
  };
}

/**
 * Verifikasi webhook callback OY! Bisnis
 */
export function verifyOyWebhook(
  headers: Record<string, string | string[] | undefined>,
  expectedUsername: string
): boolean {
  // SECURITY: Jika expectedUsername tidak dikonfigurasi atau header username tidak ada → INVALID
  if (!expectedUsername) return false;
  const username = (headers["x-oy-username"] || headers["X-Oy-Username"] || "") as string;
  if (!username) return false;
  return safeCompare(username.toLowerCase(), expectedUsername.toLowerCase());
}
