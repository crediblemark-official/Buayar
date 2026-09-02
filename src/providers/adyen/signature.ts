import { createHmac } from "crypto";
import { safeCompare } from "../../utils/crypto";

/**
 * Verifikasi Adyen webhook signature (HMAC-SHA256).
 * Adyen menggunakan sorted key-value string dari notification item.
 */
export function verifyAdyenWebhook(notificationItem: any, hmacKey: string): boolean {
  if (!hmacKey || !notificationItem) return false;

  try {
    const amount = notificationItem.amount || {};
    const fields = [
      notificationItem.pspReference || "",
      notificationItem.originalReference || "",
      notificationItem.merchantAccountCode || "",
      notificationItem.merchantReference || "",
      String(amount.value || ""),
      amount.currency || "",
      notificationItem.eventCode || "",
      notificationItem.success || "",
    ];
    const signedData = fields.join(":");
    const keyBytes = Buffer.from(hmacKey, "hex");
    const expected = createHmac("sha256", keyBytes).update(signedData, "utf8").digest("base64");
    const provided = notificationItem.additionalData?.hmacSignature || "";
    return safeCompare(expected, provided);
  } catch {
    return false;
  }
}
