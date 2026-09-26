import { describe, expect, it } from "bun:test";
import type { CreateInvoiceParams, PaymentMethodInput } from "../src";

describe("K2 — Type safety & non-portable paymentMethod enforcement", () => {
  it("allows canonical payment methods", () => {
    const validParams: CreateInvoiceParams = {
      orderId: "ORD-1",
      amount: 10000,
      productDetails: "Test",
      customer: { name: "A", email: "a@test.com" },
      paymentMethod: "bca_va",
    };
    expect(validParams.paymentMethod).toBe("bca_va");
  });

  it("allows explicit raw provider escape hatch", () => {
    const escapeHatchParams: CreateInvoiceParams = {
      orderId: "ORD-2",
      amount: 10000,
      productDetails: "Test",
      customer: { name: "B", email: "b@test.com" },
      paymentMethod: { raw: "BC", providerOnly: true },
    };
    expect((escapeHatchParams.paymentMethod as any).raw).toBe("BC");
  });

  it("rejects non-canonical string without explicit escape hatch at type level", () => {
    // @ts-expect-error - "BC" adalah raw code Duitku yang tidak portabel, compiler harus menolak
    const _invalid: PaymentMethodInput = "BC";
    // @ts-expect-error - "M2" adalah raw code Mandiri Duitku, compiler harus menolak
    const _invalid2: PaymentMethodInput = "M2";
    expect(String(_invalid)).toBe("BC");
    expect(String(_invalid2)).toBe("M2");
  });
});
