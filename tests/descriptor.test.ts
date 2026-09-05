import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import {
  buildPaymentMethodDescriptor,
  buildPaymentMethodDescriptors,
  mapCategoryToDescriptorType,
} from "../src/core/descriptor";

const IPAYMU_VA = "0000001411234567";
const IPAYMU_KEY = "SANDBOX2FE8BDD5-1DAE-4CC4-94F0-7BCC6ADCBE9E";

describe("buildPaymentMethodDescriptor / mapCategoryToDescriptorType", () => {
  it("maps canonical categories to short UI types", () => {
    expect(mapCategoryToDescriptorType("QRIS")).toBe("qris");
    expect(mapCategoryToDescriptorType("Virtual Account")).toBe("va");
    expect(mapCategoryToDescriptorType("E-Wallet")).toBe("ewallet");
    expect(mapCategoryToDescriptorType("Retail / Gerai")).toBe("retail");
    expect(mapCategoryToDescriptorType("Kartu Kredit")).toBe("card");
    expect(mapCategoryToDescriptorType("Paylater / Cicilan")).toBe("paylater");
  });

  it("falls back to method code detection for _va / qris", () => {
    expect(mapCategoryToDescriptorType("Lainnya", "bca_va")).toBe("va");
    expect(mapCategoryToDescriptorType("Lainnya", "qris")).toBe("qris");
    expect(mapCategoryToDescriptorType("Something Else")).toBe("other");
  });

  it("builds a UI-ready descriptor from a raw PaymentMethod", () => {
    const d = buildPaymentMethodDescriptor({
      paymentMethod: "bca_va",
      code: "bca_va",
      paymentName: "Virtual Account BCA",
      paymentImage: "https://my.ipaymu.com/images/banks/bca.png",
      totalFee: "0.7%",
      category: "Virtual Account",
    });

    expect(d).toMatchObject({
      id: "BCA_VA",
      name: "Virtual Account BCA",
      type: "va",
      icon: "🏦",
      badge: "Otomatis 24 Jam • Fee 0.7%",
      image: "https://my.ipaymu.com/images/banks/bca.png",
      category: "Virtual Account",
      coming_soon: false,
      totalFee: "0.7%",
    });
  });

  it("builds QRIS badge without double writing fee when empty", () => {
    const d = buildPaymentMethodDescriptor({
      paymentMethod: "qris",
      code: "qris",
      paymentName: "QRIS",
      paymentImage: "",
      totalFee: "",
      category: "QRIS",
    });

    expect(d.id).toBe("QRIS");
    expect(d.type).toBe("qris");
    expect(d.badge).toBe("Instan Bebas Biaya");
    expect(d.totalFee).toBeUndefined();
    expect(d.image).toBeUndefined();
  });

  it("propagates coming_soon from PaymentMethod data (S6 fix)", () => {
    const comingSoon = buildPaymentMethodDescriptor({
      paymentMethod: "ovo",
      code: "ovo",
      paymentName: "OVO",
      paymentImage: "",
      totalFee: "",
      category: "E-Wallet",
      coming_soon: true,
    });
    expect(comingSoon.coming_soon).toBe(true);

    const available = buildPaymentMethodDescriptor({
      paymentMethod: "dana",
      code: "dana",
      paymentName: "DANA",
      paymentImage: "",
      totalFee: "",
      category: "E-Wallet",
      coming_soon: false,
    });
    expect(available.coming_soon).toBe(false);

    // Tanpa coming_soon → default false
    const defaultVal = buildPaymentMethodDescriptor({
      paymentMethod: "gopay",
      code: "gopay",
      paymentName: "GoPay",
      paymentImage: "",
      totalFee: "",
      category: "E-Wallet",
    });
    expect(defaultVal.coming_soon).toBe(false);
  });
});

describe("getPaymentMethodDescriptors (facade)", () => {
  it("returns canonical descriptors from live iPaymu payment-channels shape", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Status: 200,
        Data: [
          {
            Code: "va",
            Name: "Virtual Account",
            Channels: [
              {
                Code: "bca",
                Name: "BCA VA",
                Logo: "https://my.ipaymu.com/images/banks/bca.png",
                HealthStatus: "online",
                FeatureStatus: "active",
                TransactionFee: { ActualFeeType: "PERCENT", ActualFee: "0.7" },
              },
            ],
          },
          {
            Code: "qris",
            Name: "QRIS",
            Channels: [
              {
                Code: "qris",
                Name: "QRIS",
                Logo: "",
                HealthStatus: "online",
                FeatureStatus: "active",
                TransactionFee: {},
              },
            ],
          },
        ],
      }),
    });

    const client = new Buayar({
      provider: "ipaymu",
      apiKey: IPAYMU_KEY,
      merchantCode: IPAYMU_VA,
      sandbox: true,
    });

    const res = await client.getPaymentMethodDescriptors({ amount: 100000 });

    expect(res.success).toBe(true);
    expect(res.provider).toBe("ipaymu");
    expect(res.generatedAt).toBeTruthy();
    expect(res.descriptors).toHaveLength(2);

    const bca = res.descriptors.find((d) => d.id === "BCA_VA");
    expect(bca).toMatchObject({ type: "va", badge: expect.stringContaining("Fee 0.7%") });

    const qris = res.descriptors.find((d) => d.id === "QRIS");
    expect(qris).toMatchObject({ type: "qris", badge: "Instan Bebas Biaya" });

    globalThis.fetch = originalFetch;
  });

  it("filters out explicitly unavailable channels surfaced by provider", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Status: 200,
        Data: [
          {
            Code: "ewallet",
            Name: "E-Wallet",
            Channels: [
              {
                Code: "dana",
                Name: "DANA",
                Logo: "",
                HealthStatus: "online",
                FeatureStatus: "active",
                TransactionFee: {},
              },
              {
                Code: "ovo",
                Name: "OVO",
                Logo: "",
                HealthStatus: "offline",
                FeatureStatus: "inactive",
                TransactionFee: {},
              },
            ],
          },
        ],
      }),
    });

    const client = new Buayar({
      provider: "ipaymu",
      apiKey: IPAYMU_KEY,
      merchantCode: IPAYMU_VA,
      sandbox: true,
    });

    const res = await client.getPaymentMethodDescriptors();
    const ids = res.descriptors.map((d) => d.id);

    expect(res.success).toBe(true);
    expect(ids).toContain("DANA");
    expect(ids).not.toContain("OVO");

    globalThis.fetch = originalFetch;
  });

  it("returns empty descriptors with error when channels endpoint fails", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ Status: 500, Message: "Boom" }),
    });

    const client = new Buayar({
      provider: "ipaymu",
      apiKey: IPAYMU_KEY,
      merchantCode: IPAYMU_VA,
      sandbox: true,
    });

    const res = await client.getPaymentMethodDescriptors();
    expect(res.success).toBe(false);
    expect(res.descriptors).toEqual([]);
    expect(res.error).toBeTruthy();

    globalThis.fetch = originalFetch;
  });
});

describe("buildPaymentMethodDescriptors batch", () => {
  it("maps every item without throwing", () => {
    const descs = buildPaymentMethodDescriptors(
      [
        { paymentMethod: "qris", paymentName: "QRIS", paymentImage: "", totalFee: "", category: "QRIS" },
        { paymentMethod: "dana", paymentName: "DANA", paymentImage: "", totalFee: "0%", category: "E-Wallet" },
      ],
      "ipaymu"
    );
    expect(descs).toHaveLength(2);
    expect(descs[0].id).toBe("QRIS");
    expect(descs[1].type).toBe("ewallet");
  });

  it("supports probePaymentMethods on iPaymu (S8)", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Status: 200,
        Success: true,
        Data: [
          {
            Code: "qris",
            Name: "QRIS",
            Channels: [
              { Code: "mpay", Name: "QRIS", HealthStatus: "online", FeatureStatus: "active" },
            ],
          },
          {
            Code: "va",
            Name: "Virtual Account",
            Channels: [
              { Code: "bca", Name: "BCA VA", HealthStatus: "online", FeatureStatus: "active" },
            ],
          },
        ],
      }),
    });

    const client = new Buayar({
      provider: "ipaymu",
      apiKey: IPAYMU_KEY,
      merchantCode: IPAYMU_VA,
      sandbox: true,
    });

    const res = await client.probePaymentMethods();
    expect(res.success).toBe(true);
    expect(res.enabled).toEqual(["qris", "bca_va"]);

    globalThis.fetch = originalFetch;
  });
});