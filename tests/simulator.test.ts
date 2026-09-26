import { describe, expect, it } from "bun:test";
import { Buayar, providerRegistry, DEFAULT_SIMULATOR_SECRETS } from "../src";

const ALL_PROVIDERS = providerRegistry.names();

describe("K4 — Simulator & Sandbox Contract Testing", () => {
  it("verifies 20/20 providers are covered", () => {
    expect(ALL_PROVIDERS.length).toBe(20);
  });

  describe("Invoice Creation in Simulate Mode (BUAYAR_SIMULATE=1)", () => {
    for (const provider of ALL_PROVIDERS) {
      it(`[${provider}] creates valid simulated invoice without any network call or credentials`, async () => {
        const buayar = new Buayar({
          provider,
          simulate: true,
        });

        const res = await buayar.createInvoice({
          orderId: `ORD-${provider.toUpperCase()}-123`,
          amount: 50000,
          productDetails: "Simulated Test Item",
          customer: { name: "Sim User", email: "sim@buayar.dev" },
        });

        expect(res.success).toBe(true);
        expect(res.provider).toBe(provider);
        expect(res.orderId).toBe(`ORD-${provider.toUpperCase()}-123`);
        expect(res.amount).toBe(50000);
        expect(res.paymentUrl).toContain("simulator.buayar.dev");
        expect(res.rawResponse?.simulated).toBe(true);
      });
    }

    it("simulates VA mode with valid vaNumber and vaBank", async () => {
      const buayar = new Buayar({ provider: "midtrans", simulate: true });
      const res = await buayar.createInvoice({
        orderId: "ORD-VA-001",
        amount: 25000,
        paymentMethod: "bca_va",
        productDetails: "VA Product",
        customer: { name: "User", email: "user@buayar.dev" },
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe("va");
      expect(res.vaNumber).toBeDefined();
      expect(res.vaNumber?.startsWith("8808")).toBe(true);
      expect(res.vaBank).toBe("BCA");
    });

    it("simulates QRIS mode with valid qrString and qrCodeUrl", async () => {
      const buayar = new Buayar({ provider: "xendit", simulate: true });
      const res = await buayar.createInvoice({
        orderId: "ORD-QR-001",
        amount: 15000,
        paymentMethod: "qris",
        productDetails: "QR Product",
        customer: { name: "User", email: "user@buayar.dev" },
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe("qris");
      expect(res.qrString).toBeDefined();
      expect(res.qrString?.startsWith("000201")).toBe(true);
      expect(res.qrCodeUrl).toBeDefined();
    });

    it("simulates eWallet mode with valid deeplink", async () => {
      const buayar = new Buayar({ provider: "midtrans", simulate: true });
      const res = await buayar.createInvoice({
        orderId: "ORD-EW-001",
        amount: 30000,
        paymentMethod: "gopay",
        productDetails: "E-Wallet Product",
        customer: { name: "User", email: "user@buayar.dev" },
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe("ewallet");
      expect(res.deeplink).toContain("gopay://pay");
    });

    it("simulates timeout when orderId contains SIM_TIMEOUT", async () => {
      const buayar = new Buayar({ provider: "stripe", simulate: true });
      expect(
        buayar.createInvoice({
          orderId: "ORD-SIM_TIMEOUT-999",
          amount: 50000,
          productDetails: "Timeout Test",
          customer: { name: "User", email: "user@buayar.dev" },
        })
      ).rejects.toThrow("timed out");
    });

    it("simulates gateway error response when orderId contains SIM_ERROR", async () => {
      const buayar = new Buayar({ provider: "paypal", simulate: true });
      const res = await buayar.createInvoice({
        orderId: "ORD-SIM_ERROR-888",
        amount: 50000,
        productDetails: "Error Test",
        customer: { name: "User", email: "user@buayar.dev" },
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Simulated gateway error");
    });
  });

  describe("Webhook Contract Replay across all 20 providers", () => {
    for (const provider of ALL_PROVIDERS) {
      it(`[${provider}] produces valid, cryptographically verifiable webhook for 'paid' status`, async () => {
        const buayar = new Buayar({
          provider,
          simulate: true,
          ...DEFAULT_SIMULATOR_SECRETS[provider],
        });

        const event = buayar.simulator.createWebhookEvent(provider, {
          orderId: `ORD-${provider}-PAID-1`,
          amount: 100000,
          status: "paid",
        });

        expect(event.provider).toBe(provider);
        expect(event.body).toBeDefined();
        expect(event.rawBody).toBeDefined();

        const verified = await buayar.verifyWebhook(
          event.body,
          event.headers,
          { rawBody: event.rawBody }
        );

        expect(verified.isValid).toBe(true);
        expect(verified.isPaid).toBe(true);
        expect(verified.isPending).toBe(false);
        expect(verified.isFailed).toBe(false);
      });

      it(`[${provider}] strictly REJECTS tampered simulator webhook (fail-closed)`, async () => {
        const buayar = new Buayar({
          provider,
          simulate: true,
          ...DEFAULT_SIMULATOR_SECRETS[provider],
        });

        const event = buayar.simulator.createWebhookEvent(provider, {
          orderId: `ORD-${provider}-ATTACK`,
          amount: 100000,
          status: "paid",
          tampered: true,
        });

        const verified = await buayar.verifyWebhook(
          event.body,
          event.headers,
          { rawBody: event.rawBody }
        );

        expect(verified.isValid).toBe(false);
        expect(verified.isPaid).toBe(false);
      });
    }
  });

  describe("Status Transitions & Matrix in Simulator", () => {
    it("handles checkTransaction status transitions accurately", async () => {
      const buayar = new Buayar({ provider: "midtrans", simulate: true });

      const paid = await buayar.checkTransaction({ merchantOrderId: "ORD-SIM_PAID-123" });
      expect(paid.status).toBe("paid");
      expect(paid.isPaid).toBe(true);

      const pending = await buayar.checkTransaction({ merchantOrderId: "ORD-SIM_PENDING-456" });
      expect(pending.status).toBe("pending");
      expect(pending.isPending).toBe(true);

      const expired = await buayar.checkTransaction({ merchantOrderId: "ORD-SIM_EXPIRED-789" });
      expect(expired.status).toBe("expired");
      expect(expired.isExpired).toBe(true);

      const failed = await buayar.checkTransaction({ merchantOrderId: "ORD-SIM_FAILED-000" });
      expect(failed.status).toBe("failed");
      expect(failed.isFailed).toBe(true);
    });

    it("simulates unified operations (refund, checkBalance, disburse)", async () => {
      const buayar = new Buayar({ provider: "stripe", simulate: true });

      const refund = await buayar.refund({ transactionId: "ch_sim_123", amount: 5000 });
      expect(refund.success).toBe(true);
      expect(refund.supported).toBe(true);

      const balance = await buayar.checkBalance();
      expect(balance.success).toBe(true);
      expect(balance.balance).toBeGreaterThan(0);

      const disburse = await buayar.disburse({
        externalId: "disb-001",
        amount: 20000,
        bankCode: "BCA",
        accountNumber: "1234567890",
      });
      expect(disburse.success).toBe(true);
      expect(disburse.status).toBe("SUCCESS");
    });
  });
});
