import { safeCompare } from "../../utils/crypto";
import { generateSnapSymmetricSignature, snapTimestamp } from "../../utils/snap";

/**
 * DOKU SNAP (Standard Open API Pembayaran) helpers.
 *
 * SNAP adalah API standar Bank Indonesia yang juga diimplementasikan DOKU.
 * Berbeda dari flow legacy Jokul v2 (HMAC request-target), SNAP memakai:
 *
 * 1. Get B2B Access Token (ASIMETRIS):
 *    POST /authorization/v1/access-token/b2b
 *    X-SIGNATURE = Base64( SHA256withRSA( privateKey, clientId + "|" + X-TIMESTAMP ) )
 *    → accessToken (Bearer), expiresIn ~900s
 *
 * 2. Transaksi (SIMETRIS):
 *    stringToSign =
 *      HTTPMethod + ":" + EndpointUrl + ":" + AccessToken + ":" +
 *      Lowercase(HexEncode( SHA-256( minify(requestBody) ) )) + ":" + X-TIMESTAMP
 *    X-SIGNATURE = HMAC-SHA512( clientSecret, stringToSign )
 *    Headers: X-PARTNER-ID, X-EXTERNAL-ID, X-TIMESTAMP, CHANNEL-ID, Authorization: Bearer
 *
 * Rumus signature-nya generik lintas PJP, sehingga primitifnya hidup di
 * `src/utils/snap.ts` dan dipakai bersama adapter SNAP provider lain (Midtrans).
 */

export {
  snapTimestamp,
  snapUtcTimestamp,
  minifyJson,
  sha256Hex,
  generateSnapSymmetricSignature,
  generateSnapAsymmetricSignature,
  normalizeSnapPem,
  snapExternalId,
} from "../../utils/snap";

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
