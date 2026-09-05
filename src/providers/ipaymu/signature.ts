import { sha256, hmacSha256, safeCompare } from "../../utils/crypto";

/**
 * Generate signature for iPaymu API v2 requests
 * 
 * Signature formula:
 * stringToSign = HTTP_METHOD + ":" + VA + ":" + SHA256(RAW_BODY).toLowerCase() + ":" + API_KEY
 * signature = HMAC_SHA256(stringToSign, API_KEY)
 */
export function generateIpaymuSignature(
  method: "GET" | "POST",
  va: string,
  apiKey: string,
  body?: any
): { signature: string; timestamp: string } {
  const timestamp = Date.now().toString();
  // iPaymu v2 signature spec:
  // For GET: SHA256 of stringified query params (or "{}" if no query)
  // For POST: SHA256 of JSON body (or "{}" if empty)
  const bodyString = body ? (typeof body === "string" ? body : JSON.stringify(body)) : "{}";
  const bodyHash = sha256(bodyString).toLowerCase();

  const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash}:${apiKey}`;
  const signature = hmacSha256(stringToSign, apiKey);

  return { signature, timestamp };
}

/**
 * Normalisasi payload callback iPaymu agar identik dengan apa yang
 * ditandatangani iPaymu (merujuk dokumentasi resmi callback):
 * - trx_id / status_code / transaction_status_code / paid_off → Integer
 * - is_escrow → Boolean
 * - additional_info "[]" (string) → [] (array); tambah [] saat field tidak ada
 * - field lain → String
 * - field "signature" (bila ikut terkirim di body) dibuang dari perhitungan
 */
export function normalizeIpaymuCallback(payload: any): Record<string, any> {
  const result: Record<string, any> = {};

  for (const key of Object.keys(payload || {})) {
    const val = payload[key];

    if (key === "is_escrow") {
      result[key] = val === "true" || val === "1" || val === 1 || val === true;
    } else if (["trx_id", "status_code", "transaction_status_code", "paid_off"].includes(key)) {
      const intVal = parseInt(String(val), 10);
      result[key] = Number.isNaN(intVal) ? 0 : intVal;
    } else if (key === "additional_info") {
      result[key] = val === "[]" || val === "null" ? [] : val;
    } else if (key === "signature") {
      // signature di-exclude dari material yang di-HMAC (dikirim via header X-Signature)
      continue;
    } else {
      result[key] = String(val);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(result, "additional_info")) {
    result.additional_info = [];
  }

  return result;
}

/**
 * Bangun string JSON yang ditandatangani iPaymu untuk verifikasi callback:
 * - key diurutkan ascending (A-Z) dengan sort case-sensitif
 * - forward slash di-escape menjadi "\/" sesuai standar PHP json_encode
 */
export function buildIpaymuCallbackString(payload: any): string {
  const normalized = normalizeIpaymuCallback(payload);

  const sorted: Record<string, any> = {};
  for (const key of Object.keys(normalized).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = normalized[key];
  }

  let json = JSON.stringify(sorted);
  json = json.replace(/\//g, "\\/");
  return json;
}

/**
 * Verifikasi signature callback iPaymu.
 * Secret key = Nomor VA (Merchant VA) akun iPaymu; dibandingkan dengan
 * nilai header X-Signature menggunakan perbandingan timing-safe.
 * Tanpa header signature atau secret → INVALID.
 */
export function verifyIpaymuCallbackSignature(
  payload: any,
  secretKey: string,
  xSignature?: string
): boolean {
  if (!secretKey || !xSignature) return false;
  const stringToSign = buildIpaymuCallbackString(payload);
  const computed = hmacSha256(stringToSign, secretKey);
  return safeCompare(String(xSignature).toLowerCase(), computed.toLowerCase());
}

/**
 * Verifikasi callback webhook dari iPaymu
 */
export function verifyIpaymuCallback(payload: any): { isPaid: boolean; isPending: boolean; isFailed: boolean } {
  const status = (payload.status || "").toLowerCase();
  const statusCode = payload.status_code !== undefined ? String(payload.status_code) : "";

  const isPaid = status === "berhasil" || status === "success" || statusCode === "1" || statusCode === "00";
  const isPending = status === "pending" || statusCode === "0";
  const isFailed = !isPaid && !isPending;

  return { isPaid, isPending, isFailed };
}