import crypto from "crypto";

/**
 * Primitif generik Standar Nasional Open API Pembayaran (BI-SNAP / ASPI).
 *
 * Modul ini memuat rumus signature yang **sama** untuk semua PJP yang
 * mengimplementasikan BI-SNAP (DOKU, Midtrans, dst.), sehingga tidak
 * diduplikasi di tiap adapter:
 *
 * 1. Get B2B Access Token (ASIMETRIS, `SHA256withRSA`):
 *      stringToSign = clientId + "|" + X-TIMESTAMP
 *      X-SIGNATURE  = Base64( sign(privateKey, stringToSign) )
 *
 * 2. Transaksi / Query (SIMETRIS, `HMAC_SHA512`):
 *      stringToSign = HTTPMethod + ":" + EndpointUrl + ":" + AccessToken + ":" +
 *                     Lowercase(HexEncode(SHA-256(minify(RequestBody)))) + ":" + X-TIMESTAMP
 *      X-SIGNATURE  = Base64( HMAC-SHA512(clientSecret, stringToSign) )
 *
 * Referensi: ASPI "Komponen Struktur Format Header" (dipakai Midtrans & DOKU).
 */

/** `YYYY-MM-DDTHH:mm:ss+07:00` (WIB) — format X-TIMESTAMP yang dipakai Midtrans/DOKU. */
export function snapTimestamp(date: Date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 19) + "+07:00";
}

/** `YYYY-MM-DDTHH:mm:ssZ` (UTC+0) — dipakai sebagian PJP untuk Get Token B2B. */
export function snapUtcTimestamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 19) + "Z";
}

/** Compact (minified) JSON — whitespace dihapus, dipakai sebagai input signature. */
export function minifyJson(obj: any): string {
  return JSON.stringify(obj);
}

/** Lowercase hex SHA-256 dari body (string mentah atau objek JSON). */
export function sha256Hex(body: any): string {
  const raw = typeof body === "string" ? body : minifyJson(body);
  return crypto.createHash("sha256").update(raw).digest("hex").toLowerCase();
}

/**
 * Signature simetris (HMAC-SHA512) untuk seluruh request transaksi SNAP.
 *
 * @param clientSecret Client secret / secret key PJP.
 * @param method       HTTP method, mis. "POST".
 * @param endpointUrl  Request-target path (tanpa host), mis. "/v1.0/qr/qr-mpm-generate".
 * @param accessToken  B2B access token TANPA prefix "Bearer ".
 * @param body         Body request (objek atau string mentah).
 * @param timestamp    Nilai X-TIMESTAMP yang dipakai di header.
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
  const stringToSign = `${method.toUpperCase()}:${endpointUrl}:${accessToken}:${hash}:${timestamp}`;
  return crypto.createHmac("sha512", clientSecret).update(stringToSign).digest("base64");
}

/**
 * Signature asimetris (SHA256withRSA) untuk Get B2B Access Token.
 *
 * @param privateKey RSA private key (PEM utuh, atau body base64 tanpa header).
 * @param clientId   Client ID dari PJP.
 * @param timestamp  Nilai X-TIMESTAMP yang dipakai di header.
 */
export function generateSnapAsymmetricSignature(
  privateKey: string,
  clientId: string,
  timestamp: string
): string {
  const stringToSign = `${clientId}|${timestamp}`;
  const key = crypto.createPrivateKey(normalizeSnapPem(privateKey));
  return crypto.sign("RSA-SHA256", Buffer.from(stringToSign, "utf8"), key).toString("base64");
}

/**
 * Normalisasi string private key menjadi PEM block yang valid agar
 * `crypto.createPrivateKey` menerimanya.
 */
export function normalizeSnapPem(key: string): string {
  const trimmed = (key || "").trim();
  if (trimmed.includes("-----BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") || trimmed;
  return ["-----BEGIN PRIVATE KEY-----", body, "-----END PRIVATE KEY-----"].join("\n");
}

/** Generate X-EXTERNAL-ID numerik unik (dipakai PJP yang mewajibkan format angka). */
export function snapExternalId(prefix = ""): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}
