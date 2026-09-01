import { describe, expect, it } from "bun:test";
import {
  toDuitkuPaymentMethod,
  toCanonicalPaymentMethod,
  toIpaymuPaymentMethod,
  getPaymentMethodCategory,
} from "../src";

describe("Canonical Payment Methods Mapping", () => {
  it("should map canonical codes to Duitku codes", () => {
    expect(toDuitkuPaymentMethod("bca_va")).toBe("BC");
    expect(toDuitkuPaymentMethod("mandiri_va")).toBe("M2");
    expect(toDuitkuPaymentMethod("bni_va")).toBe("I1");
    expect(toDuitkuPaymentMethod("bri_va")).toBe("BR");
    expect(toDuitkuPaymentMethod("qris")).toBe("SP");
    expect(toDuitkuPaymentMethod("gopay")).toBe("GP");
    expect(toDuitkuPaymentMethod("shopeepay")).toBe("SA");
    expect(toDuitkuPaymentMethod("ovo")).toBe("OV");
    expect(toDuitkuPaymentMethod("dana")).toBe("DA");
    expect(toDuitkuPaymentMethod("linkaja")).toBe("LA");
    expect(toDuitkuPaymentMethod("alfamart")).toBe("AL");
    expect(toDuitkuPaymentMethod("indomaret")).toBe("IR");
    expect(toDuitkuPaymentMethod("credit_card")).toBe("VC");
  });

  it("should preserve existing raw Duitku codes", () => {
    expect(toDuitkuPaymentMethod("BC")).toBe("BC");
    expect(toDuitkuPaymentMethod("M2")).toBe("M2");
    expect(toDuitkuPaymentMethod("SP")).toBe("SP");
  });

  it("should convert Duitku codes to Canonical codes", () => {
    expect(toCanonicalPaymentMethod("duitku", "BC")).toBe("bca_va");
    expect(toCanonicalPaymentMethod("duitku", "M2")).toBe("mandiri_va");
    expect(toCanonicalPaymentMethod("duitku", "SP")).toBe("qris");
    expect(toCanonicalPaymentMethod("duitku", "DA")).toBe("dana");
  });

  it("should map canonical codes to iPaymu direct channels", () => {
    const bca = toIpaymuPaymentMethod("bca_va");
    expect(bca?.paymentMethod).toBe("va");
    expect(bca?.paymentChannel).toBe("bca");

    const qris = toIpaymuPaymentMethod("qris");
    expect(qris?.paymentMethod).toBe("qris");
    expect(qris?.paymentChannel).toBe("mpm");
  });

  it("should correctly classify payment method categories for Accordion UI", () => {
    expect(getPaymentMethodCategory("BC", "BCA Virtual Account")).toBe("Virtual Account");
    expect(getPaymentMethodCategory("SP", "ShopeePay QRIS")).toBe("QRIS");
    expect(getPaymentMethodCategory("DA", "DANA")).toBe("E-Wallet");
    expect(getPaymentMethodCategory("AL", "Alfamart")).toBe("Retail / Gerai");
    expect(getPaymentMethodCategory("VC", "Credit Card")).toBe("Kartu Kredit");
    expect(getPaymentMethodCategory("KV", "Kredivo")).toBe("Paylater / Cicilan");
  });
});
