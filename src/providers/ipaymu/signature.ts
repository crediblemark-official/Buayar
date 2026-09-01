import { sha256, hmacSha256 } from "../../utils/crypto";

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
  const bodyString = body ? (typeof body === "string" ? body : JSON.stringify(body)) : "";
  const bodyHash = body ? sha256(bodyString).toLowerCase() : "";

  const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash}:${apiKey}`;
  const signature = hmacSha256(stringToSign, apiKey);

  return { signature, timestamp };
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
