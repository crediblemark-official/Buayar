import { describe, expect, it } from "bun:test";
import crypto from "crypto";
import { Buayar } from "../src";

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

    const result = await buayar.verifyWebhook(webhookPayload);
    expect(result.isValid).toBe(true);
    expect(result.provider).toBe("ipaymu");
    expect(result.orderId).toBe("ORDER-IPAYMU-001");
    expect(result.amount).toBe(100000);
    expect(result.isPaid).toBe(true);
    expect(result.isPending).toBe(false);
    expect(result.isFailed).toBe(false);
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
});
