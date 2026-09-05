import { describe, expect, it } from "bun:test";
import crypto from "crypto";
import { Buayar, safeCompare } from "../src";

describe("Universal Webhook Verification & Normalization", () => {
  it("should verify and normalize Midtrans webhook payload (SHA-512)", async () => {
    const serverKey = "midtrans-secret-key";
    const orderId = "ORDER-MIDTRANS-123";
    const statusCode = "200";
    const grossAmount = "150000.00";
    const signatureKey = crypto
      .createHash("sha512")
      .update(orderId + statusCode + grossAmount + serverKey)
      .digest("hex");

    const webhookPayload = {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: signatureKey,
      transaction_status: "settlement",
      fraud_status: "accept",
      transaction_time: "2026-09-01 12:00:00",
    };

    const buayar = new Buayar({
      provider: "midtrans",
      apiKey: serverKey,
    });

    const result = await buayar.verifyWebhook(webhookPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("midtrans");
    expect(result.orderId).toBe(orderId);
    expect(result.amount).toBe(150000);
    expect(result.status).toBe("paid");
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });

  it("should verify and normalize Duitku webhook payload (MD5)", async () => {
    const apiKey = "duitku-secret-key";
    const merchantCode = "D1234";
    const amount = "250000";
    const merchantOrderId = "ORDER-DUITKU-456";
    const signature = crypto
      .createHash("md5")
      .update(merchantCode + amount + merchantOrderId + apiKey)
      .digest("hex");

    const webhookPayload = {
      merchantCode,
      amount,
      merchantOrderId,
      signature,
      resultCode: "00",
      reference: "DUITKU-REF-789",
    };

    const buayar = new Buayar({
      provider: "duitku",
      merchantCode,
      apiKey,
    });

    const result = await buayar.verifyWebhook(webhookPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("duitku");
    expect(result.orderId).toBe(merchantOrderId);
    expect(result.amount).toBe(250000);
    expect(result.status).toBe("paid");
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
  });

  it("should verify and normalize iPaymu webhook notification", async () => {
    const buayar = new Buayar({
      provider: "ipaymu",
      merchantCode: "0000001411234567",
      apiKey: "test-api-key",
      sandbox: true,
    });

    const webhookPayload = {
      trx_id: "987654",
      sid: "ipaymu-session-123",
      reference_id: "ORDER-IPAYMU-001",
      status: "berhasil",
      status_code: "1",
      amount: "100000",
      via: "va",
      channel: "bca",
    };

    // Without the mandatory X-Signature header the callback must be rejected
    const result = await buayar.verifyWebhook(webhookPayload);
    expect(result.isValid).toBe(false);
    expect(result.provider).toBe("ipaymu");
    expect(result.orderId).toBe("ORDER-IPAYMU-001");
    expect(result.amount).toBe(100000);
    expect(result.isPaid).toBe(false);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(true);
  });

  it("should flag invalid webhook signatures as failed", async () => {
    const buayar = new Buayar({
      provider: "duitku",
      merchantCode: "D1234",
      apiKey: "secret",
    });

    const invalidPayload = {
      merchantCode: "D1234",
      amount: "100000",
      merchantOrderId: "ORDER-BAD",
      signature: "invalid-signature-hash",
      resultCode: "00",
    };

    const result = await buayar.verifyWebhook(invalidPayload);
    expect(result.isValid).toBe(false);
    expect(result.isPaid).toBe(false);
    expect(result.isFailed).toBe(true);
  });

  // ─── safeCompare Security Tests ──────────────────────────────────────────

  it("[SECURITY] safeCompare should strictly reject non-matching non-hex and arbitrary strings", () => {
    // Critical bug regression: arbitrary non-hex strings previously decoded to empty Buffer
    expect(safeCompare("hello", "world")).toBe(false);
    expect(safeCompare("token_12345", "token_67890")).toBe(false);
    expect(safeCompare("xnd_token_A", "xnd_token_B")).toBe(false);
    expect(safeCompare("abc", "ab")).toBe(false);
    expect(safeCompare("abc", "abcd")).toBe(false);
    expect(safeCompare("", "a")).toBe(false);

    // Matching strings should return true
    expect(safeCompare("identical_secret_token", "identical_secret_token")).toBe(true);
    expect(safeCompare("a1b2c3d4e5f6", "A1B2C3D4E5F6")).toBe(true);
    expect(safeCompare("0123456789abcdef", "0123456789abcdef")).toBe(true);
  });

  // ─── Provider Header-based Webhook Verification Tests ─────────────────────

  it("[SECURITY] Xendit webhook should verify x-callback-token correctly", async () => {
    const buayar = new Buayar({
      provider: "xendit",
      apiKey: "xnd_test_123",
      extra: {
        webhookToken: "expected-xendit-token-456",
      },
    });

    const payload = {
      id: "inv-999",
      external_id: "ORDER-XND-SEC-01",
      status: "PAID",
      amount: 100000,
    };

    // Valid token
    const validRes = await buayar.verifyWebhook(payload, {
      "x-callback-token": "expected-xendit-token-456",
    });
    expect(validRes.isValid).toBe(true);
    expect(validRes.isPaid).toBe(true);

    // Invalid token
    const invalidRes = await buayar.verifyWebhook(payload, {
      "x-callback-token": "wrong-token-attack",
    });
    expect(invalidRes.isValid).toBe(false);

    // Missing token when webhookToken is configured
    const missingRes = await buayar.verifyWebhook(payload, {});
    expect(missingRes.isValid).toBe(false);
  });

  it("[SECURITY] DOKU webhook should verify signature header", async () => {
    const secretKey = "doku-secret-key";
    const clientId = "MALL-123";
    const reqId = "REQ-101";
    const reqTimestamp = "2026-09-01T12:00:00Z";
    const requestTarget = "/api/payment/webhook";

    const buayar = new Buayar({
      provider: "doku",
      merchantCode: clientId,
      apiKey: secretKey,
    });

    const payload = {
      order: { invoice_number: "ORDER-DOKU-SEC-01", amount: 50000 },
      transaction: { status: "SUCCESS" },
    };

    const rawBody = JSON.stringify(payload);
    const digest = crypto.createHash("sha256").update(rawBody).digest("base64");
    const component = `Client-Id:${clientId}\nRequest-Id:${reqId}\nRequest-Timestamp:${reqTimestamp}\nRequest-Target:${requestTarget}\nDigest:${digest}`;
    const validSig = `HMACSHA256=${crypto.createHmac("sha256", secretKey).update(component).digest("base64")}`;

    // Valid DOKU signature
    const validRes = await buayar.verifyWebhook(payload, {
      "client-id": clientId,
      "request-id": reqId,
      "request-timestamp": reqTimestamp,
      "request-target": requestTarget,
      "signature": validSig,
    });
    expect(validRes.isValid).toBe(true);
    expect(validRes.isPaid).toBe(true);

    // Invalid DOKU signature
    const invalidRes = await buayar.verifyWebhook(payload, {
      "client-id": clientId,
      "request-id": reqId,
      "request-timestamp": reqTimestamp,
      "request-target": requestTarget,
      "signature": "HMACSHA256=invalid-base64-signature",
    });
    expect(invalidRes.isValid).toBe(false);
  });

  it("[SECURITY] OY! webhook should verify x-oy-username header", async () => {
    const buayar = new Buayar({
      provider: "oy",
      merchantCode: "merchant_oy_user",
      apiKey: "oy-api-key",
    });

    const payload = {
      partner_tx_id: "ORDER-OY-SEC-01",
      amount: 75000,
      status: "SUCCESS",
    };

    // Valid username
    const validRes = await buayar.verifyWebhook(payload, {
      "x-oy-username": "merchant_oy_user",
    });
    expect(validRes.isValid).toBe(true);
    expect(validRes.isPaid).toBe(true);

    // Invalid username
    const invalidRes = await buayar.verifyWebhook(payload, {
      "x-oy-username": "attacker_fake_user",
    });
    expect(invalidRes.isValid).toBe(false);
  });
});
