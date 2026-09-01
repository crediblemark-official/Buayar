import { md5, sha256, hmacSha256, safeCompare } from "../../utils/crypto";

export function getDuitkuInquirySignatures(merchantCode: string, orderId: string, amount: number, apiKey: string) {
  const payloadSignature = md5(merchantCode + orderId + amount.toString() + apiKey);
  const timestamp = Date.now().toString();
  const headerSignature = sha256(merchantCode + timestamp + apiKey);

  return { payloadSignature, timestamp, headerSignature };
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
