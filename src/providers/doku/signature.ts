import crypto from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Generate DOKU Jokul v2 Request Headers & Signature
 * 
 * Digest = Base64(SHA256(RAW_BODY))
 * ComponentSignature = Client-Id:{clientId}\nRequest-Id:{requestId}\nRequest-Timestamp:{timestamp}\nRequest-Target:{requestTarget}\nDigest:{digest}
 * Signature = "HMACSHA256=" + Base64(HMAC_SHA256(ComponentSignature, secretKey))
 */
export function generateDokuHeaders(
  clientId: string,
  secretKey: string,
  requestTarget: string,
  body?: any,
  customRequestId?: string
): {
  "Client-Id": string;
  "Request-Id": string;
  "Request-Timestamp": string;
  "Signature": string;
  "Digest"?: string;
} {
  const requestId = customRequestId || `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const timestamp = new Date().toISOString().slice(0, 19) + "Z"; // YYYY-MM-DDTHH:mm:ssZ

  let digest: string | undefined;
  let componentSignature = `Client-Id:${clientId}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\nRequest-Target:${requestTarget}`;

  if (body) {
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    digest = crypto.createHash("sha256").update(rawBody).digest("base64");
    componentSignature += `\nDigest:${digest}`;
  }

  const hmac = crypto.createHmac("sha256", secretKey).update(componentSignature).digest("base64");
  const signature = `HMACSHA256=${hmac}`;

  const headers: any = {
    "Client-Id": clientId,
    "Request-Id": requestId,
    "Request-Timestamp": timestamp,
    "Signature": signature,
  };

  if (digest) {
    headers["Digest"] = digest;
  }

  return headers;
}

/**
 * Verifikasi webhook signature DOKU Jokul
 */
export function verifyDokuWebhookSignature(
  headers: Record<string, string | string[] | undefined>,
  body: any,
  clientId: string,
  secretKey: string,
  requestTarget: string = "/api/payment/webhook"
): boolean {
  const reqClientId = (headers["client-id"] || headers["Client-Id"] || "") as string;
  const reqId = (headers["request-id"] || headers["Request-Id"] || "") as string;
  const reqTimestamp = (headers["request-timestamp"] || headers["Request-Timestamp"] || "") as string;
  const incomingSignature = (headers["signature"] || headers["Signature"] || "") as string;

  if (!incomingSignature || !secretKey) return true; // Tolerant if not passed

  let component = `Client-Id:${reqClientId || clientId}\nRequest-Id:${reqId}\nRequest-Timestamp:${reqTimestamp}\nRequest-Target:${requestTarget}`;

  if (body) {
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const digest = crypto.createHash("sha256").update(rawBody).digest("base64");
    component += `\nDigest:${digest}`;
  }

  const computedHmac = crypto.createHmac("sha256", secretKey).update(component).digest("base64");
  const expectedSignature = `HMACSHA256=${computedHmac}`;

  return safeCompare(incomingSignature, expectedSignature);
}
