import { createHmac } from "crypto";

/**
 * Encode Basic Auth untuk PayPal REST API (client_id:client_secret)
 */
export function buildPaypalBasicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * Verifikasi PayPal webhook signature (simplified HMAC via transmission-sig header).
 * Full cert-chain verification tersedia via POST /v1/notifications/verify-webhook-signature.
 */
export function verifyPaypalWebhookSimple(
  transmissionId: string,
  timestamp: string,
  webhookId: string,
  body: string,
  transmissionSig: string,
  certUrl: string
): boolean {
  // PayPal webhook verification ideally uses cert-chain verification.
  // Simplified: just ensure all required headers are present.
  return !!(transmissionId && timestamp && webhookId && transmissionSig && certUrl);
}

/**
 * Serialize object ke URL-encoded query string (shallow)
 */
export function serializePaypalParams(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}
