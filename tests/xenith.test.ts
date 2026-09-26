import { describe, expect, it, afterEach } from "bun:test";
import { Buayar } from "../src";
import { XenithProvider } from "../src/providers/xenith/provider";
import {
  buildXenithRequestSignature,
  verifyXenithWebhookSignature,
} from "../src/providers/xenith/signature";
import { XenithClient } from "../src/clients/xenith";

let originalFetch: any;

function mockFetch(handler: (url: any, options?: any) => any) {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: any, options: any) => {
    const result = await handler(url, options);
    const body = typeof result.body !== "undefined" ? result.body : result;
    return {
      ok: result.ok !== false,
      status: result.status ?? 200,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as any;
  };
}

function restoreFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
}

afterEach(() => restoreFetch());

describe("Xenith Pay — Request & Webhook Signatures", () => {
  const secretKey = "sk_test_secret_123456789";

  it("should generate valid request HMAC-SHA256 signature", () => {
    const timestamp = "2026-09-26T12:00:00.000Z";
    const sig = buildXenithRequestSignature({
      secretKey,
      method: "GET",
      path: "/v1/balances",
      timestamp,
      body: "",
    });

    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(20);

    // Signature must be deterministic
    const sig2 = buildXenithRequestSignature({
      secretKey,
      method: "GET",
      path: "/v1/balances",
      timestamp,
      body: "",
    });
    expect(sig).toBe(sig2);
  });

  it("should verify authentic webhook with literal \\n delimiter", () => {
    const webhookSecret = "c238eaeb9561e104d6712f21bc0552818dcf3290a351103e4aba575df2a8c951";
    const timestamp = new Date().toISOString();
    const urlPath = "/v1/webhook";
    const rawBody = JSON.stringify({
      schemaVersion: "1.0.1",
      timestamp,
      data: {
        id: "pymt-01JDVNTTEZWNMVJYXSZEZR86G6",
        initiatedAmount: "10000",
        paymentAmount: "10000",
        status: "SUCCESS",
      },
    });

    // Hitung signature resmi: POST\n{urlPath}\n{rawBody}\n{timestamp} dengan literal \n
    const crypto = require("crypto");
    const stringToSign = `POST\\n${urlPath}\\n${rawBody}\\n${timestamp}`;
    const validSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(stringToSign)
      .digest("base64");

    const isValid = verifyXenithWebhookSignature({
      secret: webhookSecret,
      rawBody,
      timestamp,
      signature: validSignature,
      urlPath,
    });

    expect(isValid).toBe(true);
  });

  it("should reject tampered webhook payload", () => {
    const webhookSecret = "test_whsec_123";
    const timestamp = new Date().toISOString();
    const urlPath = "/v1/webhook";
    const rawBody = '{"data":{"status":"SUCCESS"}}';

    const isValid = verifyXenithWebhookSignature({
      secret: webhookSecret,
      rawBody,
      timestamp,
      signature: "invalid_tampered_signature==",
      urlPath,
    });

    expect(isValid).toBe(false);
  });
});

describe("Xenith Pay — Provider Operations", () => {
  const provider = new XenithProvider();
  const config = {
    apiKey: "ak-test-key",
    secretKey: "sk-test-key",
    webhookSecret: "whsec-test-key",
    sandbox: true,
  };

  it("createInvoice — Hosted Payment Link mode when no paymentMethod", async () => {
    mockFetch((url, opts) => {
      expect(url).toContain("/v1/payment-links");
      const req = JSON.parse(opts.body);
      expect(req.amount).toBe(50000);
      expect(req.referenceCode).toBe("ORDER-101");
      return {
        id: "plr-01KC6BB0MG6RMKBTQHBGW9MZK8",
        paymentLinkUrl: "https://checkout.pymnt.app/payment-links/plr-101",
        status: "ACTIVE",
        amount: 50000,
      };
    });

    const result = await provider.createInvoice(
      {
        orderId: "ORDER-101",
        amount: 50000,
        customer: { name: "Budi Santoso", email: "budi@example.com" },
      },
      config
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe("xenith");
    expect(result.reference).toBe("plr-01KC6BB0MG6RMKBTQHBGW9MZK8");
    expect(result.paymentUrl).toBe("https://checkout.pymnt.app/payment-links/plr-101");
    expect(result.mode).toBe("checkout");
  });

  it("createInvoice — Direct Pay In mode for BCA VA", async () => {
    mockFetch((url, opts) => {
      expect(url).toContain("/v1/payins");
      const req = JSON.parse(opts.body);
      expect(req.initiatedAmount).toBe(100000);
      expect(req.paymentMethod).toBe("VIRTUAL_ACCOUNT");
      expect(req.paymentChannel).toBe("BCA.VA");
      return {
        id: "payin-840-01KC6B9N7K1KYHSQH0SJWVPKRX",
        paymentCode: "1234500001",
        paymentCodeType: "ACCOUNT_NUMBER",
        status: "PENDING",
        initiatedAmount: 100000,
      };
    });

    const result = await provider.createInvoice(
      {
        orderId: "ORDER-102",
        amount: 100000,
        paymentMethod: "bca_va",
        customer: { name: "Budi Santoso", email: "budi@example.com" },
      },
      config
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe("xenith");
    expect(result.vaNumber).toBe("1234500001");
    expect(result.vaBank).toBe("bca");
    expect(result.mode).toBe("va");
  });

  it("createInvoice — Direct Pay In mode for QRIS", async () => {
    mockFetch((url, opts) => {
      expect(url).toContain("/v1/payins");
      const req = JSON.parse(opts.body);
      expect(req.paymentMethod).toBe("QR_CODE");
      expect(req.paymentChannel).toBe("QRIS");
      return {
        id: "payin-840-01KC6B9N7K1KYHSQH0SJWVPKRX",
        paymentCode: "00020101021226...qris_raw_string",
        paymentCodeType: "QR_TEXT",
        status: "PENDING",
        initiatedAmount: 25000,
      };
    });

    const result = await provider.createInvoice(
      {
        orderId: "ORDER-103",
        amount: 25000,
        paymentMethod: "qris",
        customer: { name: "Budi Santoso", email: "budi@example.com" },
      },
      config
    );

    expect(result.success).toBe(true);
    expect(result.qrString).toBe("00020101021226...qris_raw_string");
    expect(result.mode).toBe("qris");
  });

  it("checkTransaction — queries payin status accurately", async () => {
    mockFetch(() => ({
      data: {
        id: "payin-101",
        referenceCode: "ORDER-101",
        status: "SUCCESS",
        paymentAmount: "50000",
      },
    }));

    const result = await provider.checkTransaction(
      { merchantOrderId: "ORDER-101", transactionId: "payin-101" },
      config
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe("xenith");
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(50000);
  });

  it("checkBalance — parses IDR balance correctly", async () => {
    mockFetch(() => ({
      data: [
        { currency: "USD", availableBalance: "100.00" },
        { currency: "IDR", availableBalance: "5000000.00", totalBalance: "5000000.00" },
      ],
    }));

    const result = await provider.checkBalance(config);

    expect(result.success).toBe(true);
    expect(result.provider).toBe("xenith");
    expect(result.balance).toBe(5000000);
    expect(result.currency).toBe("IDR");
  });

  it("disburse — creates payout correctly", async () => {
    mockFetch((url, opts) => {
      expect(url).toContain("/v1/payouts");
      const req = JSON.parse(opts.body);
      expect(req.initiatedAmount).toBe(200000);
      expect(req.destinationPayoutChannel).toBe("CENAIDJA");
      return {
        data: {
          id: "payout-01KC6B9ND05B57K5MS402KH5G9",
          status: "SUCCESS",
          initiatedAmount: "200000",
        },
      };
    });

    const result = await provider.disburse(
      {
        amount: 200000,
        bankCode: "bca",
        accountNumber: "1234567890",
        accountHolderName: "John Doe",
        externalId: "DISB-001",
      },
      config
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe("xenith");
    expect(result.reference).toBe("payout-01KC6B9ND05B57K5MS402KH5G9");
    expect(result.status).toBe("SUCCESS");
  });

  it("verifyCallback — verifies valid webhook and extracts status", async () => {
    const timestamp = new Date().toISOString();
    const urlPath = "/v1/webhook";
    const body = {
      schemaVersion: "1.0.1",
      timestamp,
      data: {
        id: "payin-001",
        referenceCode: "ORDER-999",
        initiatedAmount: "75000",
        paymentAmount: "75000",
        status: "SUCCESS",
      },
    };
    const rawBody = JSON.stringify(body);

    const crypto = require("crypto");
    const stringToSign = `POST\\n${urlPath}\\n${rawBody}\\n${timestamp}`;
    const signature = crypto
      .createHmac("sha256", config.webhookSecret)
      .update(stringToSign)
      .digest("base64");

    const result = await provider.verifyCallback(
      body,
      { ...config, extra: { rawBody } },
      {
        "x-xenith-signature": signature,
        "x-xenith-timestamp": timestamp,
      }
    );

    expect(result.isValid).toBe(true);
    expect(result.isPaid).toBe(true);
    expect(result.status).toBe("paid");
    expect(result.orderId).toBe("ORDER-999");
    expect(result.amount).toBe(75000);
  });
});

describe("Xenith Pay — Buayar Facade Integration", () => {
  it("creates Buayar instance with provider 'xenith'", () => {
    const b = new Buayar({
      provider: "xenith",
      apiKey: "ak-123",
      secretKey: "sk-123",
    });
    expect(b.provider).toBe("xenith");
    expect(b.getXenithClient()).toBeInstanceOf(XenithClient);
  });
});
