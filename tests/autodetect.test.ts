import { describe, expect, it, afterEach } from "bun:test";
import { Buayar } from "../src";
import { providerRegistry } from "../src/core/providerRegistry";
import { resolveConfigFromEnv } from "../src/core/config";

const originalEnv = { ...process.env };

function withEnv(env: Record<string, string>) {
  process.env = { ...env };
}

afterEach(() => {
  process.env = originalEnv;
});

describe("Autodetect & Dynamic Provider Registry", () => {
  describe("detectFromEnv", () => {
    it("meng-return undefined bila tidak ada kredensial", () => {
      expect(providerRegistry.detectFromEnv({})).toBeUndefined();
    });

    it("mendeteksi midtrans dari MIDTRANS_SERVER_KEY", () => {
      expect(providerRegistry.detectFromEnv({ MIDTRANS_SERVER_KEY: "SB-Mid-server-x" })).toBe("midtrans");
    });

    it("mendeteksi duitku dari DUITKU_API_KEY + DUITKU_MERCHANT_CODE", () => {
      expect(providerRegistry.detectFromEnv({ DUITKU_API_KEY: "k", DUITKU_MERCHANT_CODE: "M" })).toBe("duitku");
    });

    it("mendeteksi stripe dari STRIPE_SECRET_KEY", () => {
      expect(providerRegistry.detectFromEnv({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe("stripe");
    });

    it("mengembalikan undefined bila ambigu (2 provider sama-sama 1 kredensial)", () => {
      expect(providerRegistry.detectFromEnv({ MIDTRANS_SERVER_KEY: "a", DUITKU_API_KEY: "b" })).toBeUndefined();
    });

    it("resolveConfigFromEnv memakai autodetect bila tidak ada PROVIDER_PG", () => {
      withEnv({ MIDTRANS_SERVER_KEY: "SB-Mid-server-x" });
      const cfg = resolveConfigFromEnv({});
      expect(cfg.provider).toBe("midtrans");
    });

    it("resolveConfigFromEnv memakai PROVIDER_PG lebih utama dari autodetect", () => {
      withEnv({ PROVIDER_PG: "xendit", STRIPE_SECRET_KEY: "sk_test_x" });
      const cfg = resolveConfigFromEnv({});
      expect(cfg.provider).toBe("xendit");
    });

    it("resolveConfigFromEnv memakai config.provider paling utama", () => {
      withEnv({ PROVIDER_PG: "xendit", STRIPE_SECRET_KEY: "sk_test_x" });
      const cfg = resolveConfigFromEnv({ provider: "duitku", apiKey: "k", merchantCode: "M" });
      expect(cfg.provider).toBe("duitku");
    });
  });

  describe("detectFromWebhook", () => {
    it("mendeteksi midtrans dari transaksi_notification", () => {
      expect(buayar().detectProviderFromPayload({ signature_key: "x", transaction_status: "settlement" })).toBe("midtrans");
    });

    it("mendeteksi stripe dari event", () => {
      expect(buayar().detectProviderFromPayload({ object: "event", type: "checkout.session.completed" })).toBe("stripe");
    });

    it("mendeteksi xendit dari external_id", () => {
      expect(buayar().detectProviderFromPayload({ external_id: "x", status: "PAID" })).toBe("xendit");
    });

    it("mengembalikan undefined untuk payload tak dikenal", () => {
      expect(buayar().detectProviderFromPayload({ foo: "bar" })).toBeUndefined();
    });
  });

  describe("capability & portability helpers", () => {
    it("mengembalikan capabilities provider", () => {
      const caps = buayar().getCapabilities("duitku");
      expect(caps?.methods).toContain("bca_va");
      expect(caps?.operations.disburse).toBe(true);
      expect(caps?.operations.refund).toBe(false);
    });

    it("supports() menjawab operasi", () => {
      const b = buayar();
      expect(b.supports("xendit", "checkBalance")).toBe(true);
      expect(b.supports("doku", "refund")).toBe(false);
    });

    it("supportsMethod() menjawab ketersediaan method kanonik", () => {
      const b = buayar();
      expect(b.supportsMethod("qris", "stripe")).toBe(true);
      expect(b.supportsMethod("paypal", "midtrans")).toBe(false);
    });

    it("listProviders() memuat 19 provider bawaan", () => {
      expect(buayar().listProviders().length).toBe(19);
    });

    it("registerProviderDescriptor menambahkan provider kustom", () => {
      const b = buayar({ provider: "duitku", apiKey: "k", merchantCode: "M" });
      b.registerProviderDescriptor({
        name: "mypg",
        envKeys: ["MYPG_SECRET"],
        methods: ["qris", "bca_va"],
        operations: { refund: true, checkBalance: true, disburse: true },
      });
      expect(b.listProviders()).toContain("mypg");
      expect(b.getCapabilities("mypg")?.operations.disburse).toBe(true);
      expect(providerRegistry.detectFromEnv({ MYPG_SECRET: "s" })).toBe("mypg");
      // cleanup agar tidak mencemari test lain
      providerRegistry.unregister("mypg");
    });
  });
});

function buayar(cfg?: any): Buayar {
  return new Buayar(cfg || { provider: "duitku", apiKey: "k", merchantCode: "M" });
}