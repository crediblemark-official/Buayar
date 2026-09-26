import { md5, sha256, hmacSha256, safeCompare } from "../../utils/crypto";

export function getDuitkuInquirySignatures(merchantCode: string, orderId: string, amount: number, apiKey: string) {
  const payloadSignature = md5(merchantCode + orderId + amount.toString() + apiKey);
  const timestamp = Date.now().toString();
  const headerSignature = sha256(merchantCode + timestamp + apiKey);

  return { payloadSignature, timestamp, headerSignature };
}

/**
 * Signature header Duitku **POP** (`POST /api/merchant/createInvoice`).
 *
 * Dokumentasi resmi Duitku POP:
 *   stringToSign = merchantCode + timestamp
 *   signature    = HMAC_SHA256(stringToSign, apiKey)   // hex lowercase
 *
 * Catatan penting:
 * - Body request **tidak** ikut ditandatangani (tidak ada field `signature` di body POP).
 * - `timestamp` adalah UNIX milidetik (zona Jakarta), dikirim di header `x-duitku-timestamp`.
 */
export function getDuitkuPopSignature(merchantCode: string, apiKey: string) {
  const timestamp = Date.now().toString();
  const signature = hmacSha256(`${merchantCode}${timestamp}`, apiKey);
  return { timestamp, signature };
}

export function verifyDuitkuCallbackSignature(body: any, apiKey: string): boolean {
  const merchantCode = body.merchantCode || "";
  const amount = body.amount || "";
  const merchantOrderId = body.merchantOrderId || "";
  const signature = body.signature || "";

  const computedSignature = md5(merchantCode + amount + merchantOrderId + apiKey);
  return safeCompare(signature, computedSignature);
}

export function getDuitkuPaymentMethodsSignature(merchantCode: string, amount: number, datetime: string, apiKey: string): string {
  const stringToSign = merchantCode + amount.toString() + datetime;
  return hmacSha256(stringToSign, apiKey);
}

export function getDuitkuStatusSignatures(merchantCode: string, orderId: string, apiKey: string) {
  const timestamp = Date.now().toString();
  const headerSignature = sha256(merchantCode + timestamp + apiKey);
  const bodySignature = md5(merchantCode + orderId + apiKey);

  return { timestamp, headerSignature, bodySignature };
}
