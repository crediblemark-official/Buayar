import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * DOKU SNAP (Standard Open API Pembayaran) helpers.
 *
 * SNAP is the Bank Indonesia standardized API that DOKU implements.
 * It differs from the legacy Jokul v2 HMAC flow:
 *
 * 1. Get B2B Access Token (ASYMETRIC):
 *    POST /authorization/v1/access-token/b2b
 *    X-SIGNATURE = Base64( SHA256withRSA( privateKey, clientId + "|" + X-TIMESTAMP ) )
 *    → accessToken (Bearer), expiresIn ~900s
 *
 * 2. Transaction (e.g. Create VA / Generate QRIS / e-Wallet) (SYMETRIC):
 *    stringToSign =
 *      HTTPMethod + ":" + EndpointUrl + ":" + AccessToken + ":" +
 *      Lowercase(HexEncode( SHA-256( minify(requestBody) ) )) + ":" + X-TIMESTAMP
 *    X-SIGNATURE = HMAC-SHA512( clientSecret, stringToSign )
 *    Headers: X-PARTNER-ID, X-EXTERNAL-ID, X-TIMESTAMP, CHANNEL-ID, Authorization: Bearer
 *
 * 3. Notification / webhook verification (SYMETRIC, same formula as #2 with
 *    AccessToken = "" and EndpointUrl = merchant notification path).
 */

/** YYYY-MM-DDTHH:mm:ss+07:00 (DOKU accepts +07:00 offset) */
export function snapTimestamp(date: Date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 19) + "+07:00";
}

/**
 * UTC ISO8601 timestamp (UTC+0, `Z` suffix) required by the SNAP
 * Get Token B2B/B2B2C (asymmetric signature) calls. The `stringToSign`
 * for get-token uses this exact UTC value: `clientId + "|" + X-TIMESTAMP`.
 */
export function snapUtcTimestamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19) + "Z";
}

/** Compact (minified) JSON — whitespace removed, used as signature input. */
export function minifyJson(obj: any): string {
  return JSON.stringify(obj);
}

/** Lowercase hex SHA-256 of a minified JSON body. */
export function sha256Hex(body: any): string {
  const raw = typeof body === "string" ? body : minifyJson(body);
  return crypto.createHash("sha256").update(raw).digest("hex").toLowerCase();
}

/**
 * Symmetric signature (HMAC-SHA512) used for all SNAP transaction requests
 * and for verifying incoming DOKU notifications.
 *
 * @param clientSecret  The DOKU Secret Key (`SK-...`).
 * @param method        HTTP method, e.g. "POST".
 * @param endpointUrl   Request-target path (no host), e.g. "/virtual-accounts/..."
 * @param accessToken   B2B access token WITHOUT the "Bearer " prefix.
 * @param body          request body object or raw string.
 * @param timestamp     X-TIMESTAMP value (must match).
 */
export function generateSnapSymmetricSignature(
  clientSecret: string,
  method: string,
  endpointUrl: string,
  accessToken: string,
  body: any,
  timestamp: string
): string {
  const hash = sha256Hex(body);
  const stringToSign = `${method}:${endpointUrl}:${accessToken}:${hash}:${timestamp}`;
  return crypto.createHmac("sha512", clientSecret).update(stringToSign).digest("base64");
}

/**
 * Asymmetric signature (SHA256withRSA) used to obtain the B2B access token.
 *
 * @param privateKey  RSA private key (PEM or base64 raw).
 * @param clientId    Client ID (`doku_key_...`).
 * @param timestamp   X-TIMESTAMP value (must match).
 * @returns Base64 signature.
 */
export function generateSnapAsymmetricSignature(
  privateKey: string,
  clientId: string,
  timestamp: string
): string {
  const stringToSign = `${clientId}|${timestamp}`;
  const key = crypto.createPrivateKey(normalizePem(privateKey));
  return crypto.sign("RSA-SHA256", Buffer.from(stringToSign, "utf8"), key).toString("base64");
}

/**
 * Normalize a private key string into a proper PEM block so
 * `crypto.createPrivateKey` accepts it.
 */
function normalizePem(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }
  return [
    "-----BEGIN PRIVATE KEY-----",
    trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") || trimmed,
    "-----END PRIVATE KEY-----",
  ].join("\n");
}

/** Generate a unique X-EXTERNAL-ID (numeric request id, unique per day). */
export function snapExternalId(prefix = ""): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Verify an incoming DOKU SNAP webhook notification signature.
 *
 * @param headers       Incoming request headers (canonical keys assumed).
 * @param body          Parsed request body.
 * @param clientSecret  DOKU Secret Key.
 * @param endpointUrl   Your notification URL request-target, e.g. "/payments/notifications".
 * @returns true when the X-SIGNATURE matches.
 */
export function verifySnapWebhookSignature(
  headers: Record<string, string | string[] | undefined>,
  body: any,
  clientSecret: string,
  endpointUrl: string = "/api/payment/webhook"
): boolean {
  if (!clientSecret) return false;
  const incoming = (
    headers["x-signature"] ||
    headers["X-SIGNATURE"] ||
    headers["signature"] ||
    headers["Signature"] ||
    ""
  ) as string;
  if (!incoming) return false;

  const timestamp = (
    headers["x-timestamp"] ||
    headers["X-TIMESTAMP"] ||
    headers["timestamp"] ||
    headers["Timestamp"] ||
    snapTimestamp()
  ) as string;

  // SNAP notifications sign with AccessToken = "" (empty).
  const computed = generateSnapSymmetricSignature(
    clientSecret,
    "POST",
    endpointUrl,
    "",
    body,
    timestamp
  );

  return safeCompare(incoming, computed);
}

/**
 * Map a DOKU SNAP error (responseMessage/responseCode) to an actionable hint
 * for developers, so config gaps (missing BIN / merchantId / keys) are obvious.
 */
export function snapErrorHint(message: string, code?: string): string | undefined {
  const m = (message || "").toLowerCase();
  const c = (code || "").toLowerCase();

  if (m.includes("unknown client") || c.includes("4017300") || c.includes("4017400")) {
    return "Client ID tidak dikenali DOKU. Pastikan clientId benar & kanal SNAP aktif untuk akun ini.";
  }
  if (m.includes("signature") || c.startsWith("401")) {
    return "Signature ditolak DOKU. Pastikan (a) Merchant Public Key yang di-upload sesuai dengan private key yang dipakai, dan (b) Get Token memakai timestamp UTC (Z).";
  }
  if (m.includes("bin") || (m.includes("not configured") && m.includes("identifier"))) {
    return "Akun belum punya BIN/partnerServiceId VA yang aktif. Sediakan nilai di config.extra.partnerServiceId (atau DOKU_PARTNER_SERVICE_ID) setelah di-assign di dashboard/sales.";
  }
  if (m.includes("merchantid") || m.includes("merchant id")) {
    return "QRIS/e-Wallet butuh merchantId. Isi config.extra.merchantId (atau DOKU_MERCHANT_ID) dari dashboard.";
  }
  if (m.includes("partner service id") || m.includes("partnerServiceId")) {
    return "partnerServiceId tidak valid. Harus 8 karakter left-padded (BIN/company code DOKU).";
  }
  if (m.includes("customer no") || m.includes("customerno")) {
    return "customerNo tidak valid (maks 20 digit unik). Cek config.extra.customerNo.";
  }
  return undefined;
}
