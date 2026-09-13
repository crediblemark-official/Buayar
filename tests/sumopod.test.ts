import { describe, expect, it } from "bun:test";
import crypto from "crypto";
import { Buayar, SumopodClient, SumopodProvider } from "../src";
import {
  verifySumopodSvixSignature,
  verifySumopodToken,
} from "../src/providers/sumopod/signature";
import { resolveConfigFromEnv } from "../src/core/config";

const TEST_API_KEY = "test_sumopod_api_key_123456";
const TEST_SECRET = "whsec_" + Buffer.from("test_secret_key_bytes_1234567890").toString("base64");
const TEST_TOKEN = "whtok_sample_token_xyz";

describe("SumoPod Provider & Client Integration", () => {
  it("should resolve SumoPod config from environment variables", () => {
    const originalEnv = { ...process.env };
    try {
      delete process.env.PROVIDER_PG;
      delete process.env.PG_PROVIDER;
      delete process.env.PAYMENT_PROVIDER;
      process.env.BUAYAR_PROVIDER = "sumopod";
      process.env.SUMOPOD_API_KEY = TEST_API_KEY;
      process.env.SUMOPOD_WEBHOOK_SECRET = TEST_SECRET;
      process.env.SUMOPOD_WEBHOOK_TOKEN = TEST_TOKEN;

      const config = resolveConfigFromEnv();
      expect(config.provider).toBe("sumopod");
      expect(config.apiKey).toBe(TEST_API_KEY);
      expect(config.extra?.webhookSecret).toBe(TEST_SECRET);
      expect(config.extra?.webhookToken).toBe(TEST_TOKEN);
    } finally {
      process.env = originalEnv;
    }
  });

  it("should create payment link invoice via SumoPod API", async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api-pay.sumopod.com/api/v1/payments");
        expect(init.method).toBe("POST");

        const headers = init.headers as Record<string, string>;
        expect(headers["X-Api-Key"]).toBe(TEST_API_KEY);
        expect(headers["Content-Type"]).toBe("application/json");

        const body = JSON.parse(init.body as string);
        expect(body.order_id).toBe("INV-2026-001");
        expect(body.amount).toBe(50000);
        expect(body.payment_method_type_code).toBe("QRIS");
        expect(body.currency).toBe("IDR");

        return new Response(
          JSON.stringify({
            payment_id: "uuid-12345-sumopod",
            order_id: "INV-2026-001",
            amount: 50000,
            fee: 750,
            net_amount: 49250,
            payment_link_url: "https://pay.sumopod.com/pay/uuid-12345-sumopod",
            status: "pending",
            expires_at: "2026-01-01T12:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const buayar = new Buayar({
        provider: "sumopod",
        apiKey: TEST_API_KEY,
        sandbox: false,
      });

      const invoice = await buayar.createInvoice({
        orderId: "INV-2026-001",
        amount: 50000,
        productDetails: "Digital Goods",
        customer: { name: "John Doe", email: "john@example.com" },
      });

      expect(invoice.success).toBe(true);
      expect(invoice.provider).toBe("sumopod");
      expect(invoice.orderId).toBe("INV-2026-001");
      expect(invoice.amount).toBe(50000);
      expect(invoice.reference).toBe("uuid-12345-sumopod");
      expect(invoice.paymentUrl).toBe("https://pay.sumopod.com/pay/uuid-12345-sumopod");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should target sandbox URL (api-pay-sandbox.sumopod.com) when sandbox: true", async () => {
    const originalFetch = globalThis.fetch;
    try {
      let requestedUrl = "";
      (globalThis as any).fetch = async (url: string, init: RequestInit) => {
        requestedUrl = url;
        return new Response(
          JSON.stringify({
            payment_id: "uuid-sandbox",
            order_id: "INV-SBX-001",
            amount: 50000,
            payment_link_url: "https://pay.sumopod.com/pay/uuid-sandbox",
            payment_code: "1308300301295957",
            payment_code_type: "ACCOUNT_NUMBER",
            payment_channel_used: "BRI.VA",
            status: "pending",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const buayar = new Buayar({
        provider: "sumopod",
        apiKey: TEST_API_KEY,
        sandbox: true,
      });

      const invoice = await buayar.createInvoice({
        orderId: "INV-SBX-001",
        amount: 50000,
        productDetails: "Sandbox Test",
        customer: { name: "Test User", email: "test@example.com" },
      });

      expect(requestedUrl).toBe("https://api-pay-sandbox.sumopod.com/api/v1/payments");
      expect(invoice.success).toBe(true);
      expect(invoice.mode).toBe("va");
      expect(invoice.vaNumber).toBe("1308300301295957");
      expect(invoice.vaBank).toBe("bri");
      expect(invoice.paymentCode).toBe("1308300301295957");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should return QRIS mode with qrString and paymentCode for Custom UI", async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async () => {
        return new Response(
          JSON.stringify({
            payment_id: "uuid-qris-custom-ui",
            order_id: "INV-QR-001",
            amount: 50650,
            fee: 650,
            net_amount: 50000,
            payment_link_url: "https://pay-sandbox.sumopod.com/pay/uuid-qris-custom-ui",
            payment_code: "00020101021226580016ID.CO.SUMOPOD...",
            payment_code_type: "QR_TEXT",
            payment_channel_used: "QRIS",
            status: "pending",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const buayar = new Buayar({
        provider: "sumopod",
        apiKey: TEST_API_KEY,
        sandbox: true,
      });

      const invoice = await buayar.createInvoice({
        orderId: "INV-QR-001",
        amount: 50000,
        productDetails: "Digital Goods",
        customer: { name: "John Doe", email: "john@example.com" },
      });

      expect(invoice.success).toBe(true);
      expect(invoice.mode).toBe("qris");
      expect(invoice.qrString).toBe("00020101021226580016ID.CO.SUMOPOD...");
      expect(invoice.paymentCode).toBe("00020101021226580016ID.CO.SUMOPOD...");
      expect(invoice.paymentUrl).toBe("https://pay-sandbox.sumopod.com/pay/uuid-qris-custom-ui");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should get payment methods with QRIS channel and fee", async () => {
    const buayar = new Buayar({
      provider: "sumopod",
      apiKey: TEST_API_KEY,
    });

    const result = await buayar.getPaymentMethods();
    expect(result.success).toBe(true);
    expect(result.provider).toBe("sumopod");
    expect(result.methods.length).toBeGreaterThanOrEqual(1);

    const qris = result.methods.find((m) => m.code === "QRIS" || m.paymentMethod === "qris");
    expect(qris).toBeDefined();
    expect(qris?.category).toBe("QRIS");
    expect(qris?.totalFee).toBe("0.7% + Rp 300");
    expect(qris?.feeDetail?.percent).toBe(0.7);
    expect(qris?.feeDetail?.flat).toBe(300);
  });

  describe("Webhook Svix Signature Verification", () => {
    function computeSvixSignature(secret: string, id: string, timestamp: string, body: string): string {
      const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
      const secretBytes = Buffer.from(cleanSecret, "base64");
      const signedContent = `${id}.${timestamp}.${body}`;
      return crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    }

    it("should verify valid Svix webhook signature", () => {
      const svixId = "msg_p5j2N35SoaeGQupdate";
      const svixTimestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = JSON.stringify({
        event_type: "payment.completed",
        data: {
          payment_id: "uuid-12345",
          order_id: "INV-2026-001",
          amount: 50000,
          status: "completed",
        },
      });

      const sig = computeSvixSignature(TEST_SECRET, svixId, svixTimestamp, rawBody);
      const headerSignature = `v1,${sig}`;

      const isValid = verifySumopodSvixSignature(
        TEST_SECRET,
        svixId,
        svixTimestamp,
        headerSignature,
        rawBody
      );
      expect(isValid).toBe(true);
    });

    it("should verify when header has multiple signatures (key rotation)", () => {
      const svixId = "msg_p5j2N35SoaeGQupdate";
      const svixTimestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = '{"event_type":"payment.completed"}';

      const currentSig = computeSvixSignature(TEST_SECRET, svixId, svixTimestamp, rawBody);
      const oldSig = "old_stale_signature_base64==";
      const headerSignature = `v1,${oldSig} v1,${currentSig}`;

      const isValid = verifySumopodSvixSignature(
        TEST_SECRET,
        svixId,
        svixTimestamp,
        headerSignature,
        rawBody
      );
      expect(isValid).toBe(true);
    });

    it("should reject tampered payload or signature", () => {
      const svixId = "msg_p5j2N35SoaeGQupdate";
      const svixTimestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = '{"amount":50000}';
      const tamperedBody = '{"amount":10000}';

      const sig = computeSvixSignature(TEST_SECRET, svixId, svixTimestamp, rawBody);
      const headerSignature = `v1,${sig}`;

      const isValid = verifySumopodSvixSignature(
        TEST_SECRET,
        svixId,
        svixTimestamp,
        headerSignature,
        tamperedBody
      );
      expect(isValid).toBe(false);
    });

    it("should reject expired timestamp (replay attack protection)", () => {
      const svixId = "msg_old";
      // 10 menit yang lalu (600 detik > 300 detik)
      const staleTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const rawBody = '{"event_type":"payment.completed"}';

      const sig = computeSvixSignature(TEST_SECRET, svixId, staleTimestamp, rawBody);
      const headerSignature = `v1,${sig}`;

      const isValid = verifySumopodSvixSignature(
        TEST_SECRET,
        svixId,
        staleTimestamp,
        headerSignature,
        rawBody,
        300
      );
      expect(isValid).toBe(false);
    });
  });

  describe("Webhook X-Webhook-Token Verification", () => {
    it("should verify matching token", () => {
      expect(verifySumopodToken(TEST_TOKEN, TEST_TOKEN)).toBe(true);
    });

    it("should reject mismatched token", () => {
      expect(verifySumopodToken(TEST_TOKEN, "whtok_invalid")).toBe(false);
    });
  });

  describe("Universal Webhook Normalization via Buayar facade", () => {
    it("should verify and normalize payment.completed webhook", async () => {
      const payload = {
        event_type: "payment.completed",
        data: {
          payment_id: "uuid-9999",
          order_id: "INV-2026-001",
          amount: 50000,
          fee: 750,
          net_amount: 49250,
          status: "completed",
          payment_method: "qris",
          completed_at: "2026-06-18T12:00:00Z",
        },
      };

      const buayar = new Buayar({
        provider: "sumopod",
        apiKey: TEST_API_KEY,
        extra: { webhookToken: TEST_TOKEN },
      });

      const result = await buayar.verifyWebhook(payload, {
        "x-webhook-token": TEST_TOKEN,
      });

      expect(result.isValid).toBe(true);
      expect(result.provider).toBe("sumopod");
      expect(result.orderId).toBe("INV-2026-001");
      expect(result.amount).toBe(50000);
      expect(result.status).toBe("paid");
      expect(result.isPaid).toBe(true);
      expect(result.isPending).toBe(false);
      expect(result.isFailed).toBe(false);
      expect(result.isExpired).toBe(false);
    });

    it("should normalize payment.failed webhook", async () => {
      const payload = {
        event_type: "payment.failed",
        data: {
          payment_id: "uuid-8888",
          order_id: "INV-2026-002",
          amount: 25000,
          status: "failed",
        },
      };

      const buayar = new Buayar({
        provider: "sumopod",
        extra: { webhookToken: TEST_TOKEN },
      });

      const result = await buayar.verifyWebhook(payload, {
        "x-webhook-token": TEST_TOKEN,
      });

      expect(result.isValid).toBe(true);
      expect(result.status).toBe("failed");
      expect(result.isFailed).toBe(true);
      expect(result.isPaid).toBe(false);
    });

    it("should normalize payment.expired webhook", async () => {
      const payload = {
        event_type: "payment.expired",
        data: {
          payment_id: "uuid-7777",
          order_id: "INV-2026-003",
          amount: 100000,
          status: "expired",
        },
      };

      const buayar = new Buayar({
        provider: "sumopod",
        extra: { webhookToken: TEST_TOKEN },
      });

      const result = await buayar.verifyWebhook(payload, {
        "x-webhook-token": TEST_TOKEN,
      });

      expect(result.isValid).toBe(true);
      expect(result.status).toBe("expired");
      expect(result.isExpired).toBe(true);
      expect(result.isPaid).toBe(false);
    });
  });

  describe("SumopodClient direct client", () => {
    it("should create payment via SumopodClient", async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: RequestInit) => {
          return new Response(
            JSON.stringify({
              payment_id: "uuid-client",
              order_id: "ORD-1",
              amount: 15000,
              payment_link_url: "https://pay.sumopod.com/pay/uuid-client",
              status: "pending",
            }),
            { status: 200 }
          );
        };

        const client = new SumopodClient({ apiKey: TEST_API_KEY });
        const res = await client.createPayment({
          order_id: "ORD-1",
          amount: 15000,
        });

        expect(res.payment_id).toBe("uuid-client");
        expect(res.payment_link_url).toBe("https://pay.sumopod.com/pay/uuid-client");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
