import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

export interface BuildXenithSignatureParams {
  secretKey: string;
  method: string;
  path: string;
  timestamp: string;
  body?: string | null;
}

/**
 * Membangun signature otentikasi request keluar ke Xenith API.
 * Sesuai dokumentasi resmi https://docs.xenithpay.com/reference/build-signature-and-set-headers
 *
 * Payload:
 * `${method}\n${uri}\n${timestamp}\n${body}`
 * (Delimiter adalah newline byte '\n')
 */
export function buildXenithRequestSignature(params: BuildXenithSignatureParams): string {
  const { secretKey, method, path, timestamp, body } = params;
  const bodyStr = body !== undefined && body !== null ? body : "";
  const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyStr}`;

  return crypto
    .createHmac("sha256", secretKey)
    .update(payload)
    .digest("base64");
}

export interface VerifyXenithWebhookParams {
  secret: string;
  method?: string;
  urlPath?: string;
  rawBody: string;
  timestamp: string;
  signature: string;
  toleranceSeconds?: number;
}

/**
 * Memverifikasi signature webhook masuk dari Xenith.
 * Sesuai dokumentasi resmi https://docs.xenithpay.com/reference/check-webhook-signature
 * dan https://docs.xenithpay.com/reference/webhook-signature-example
 *
 * Catatan penting resmi Xenith:
 * Delimiter antar elemen adalah DUA KARAKTER LITERAL '\\n' (bukan newline byte!).
 * Format: `${method}\\n${urlPath}\\n${rawBody}\\n${timestamp}`
 */
export function verifyXenithWebhookSignature(params: VerifyXenithWebhookParams): boolean {
  const {
    secret,
    method = "POST",
    urlPath = "/v1/webhook",
    rawBody,
    timestamp,
    signature,
    toleranceSeconds = 300,
  } = params;

  if (!secret || !rawBody || !timestamp || !signature) {
    return false;
  }

  // Cek batas toleransi waktu replay attack jika disetel
  if (toleranceSeconds > 0) {
    const tsMillis = Date.parse(timestamp);
    if (isNaN(tsMillis)) {
      return false;
    }
    const currentMillis = Date.now();
    if (Math.abs(currentMillis - tsMillis) > toleranceSeconds * 1000) {
      return false;
    }
  }

  try {
    // Delimiter literal '\n'
    const stringToSign = `${method.toUpperCase()}\\n${urlPath}\\n${rawBody}\\n${timestamp}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(stringToSign)
      .digest("base64");

    return safeCompare(signature, expected);
  } catch {
    return false;
  }
}
