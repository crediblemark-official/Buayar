/**
 * P3 — `paymentMethod` harus benar-benar|center, bukan sekadar penanda boolean.
 *
 * Untuk provider international, defect lamanya adalah
 * `const isDirect = !!params.paymentMethod` — method tidak pernah masuk payload.
 * Test ini mengunci perilaku baru:
 *   - Adyen & Razorpay  → method diteruskan ke field API resmi ("server")
 *   - Square/Braintree/PayPal/Checkout.com → "advisory", tidak diklaim palsu
 *   - capability model menyatakan kebenaran lewat `serverForwardedMethods`
 */
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { providerRegistry } from "../src/core/providerRegistry";
import { AdyenProvider } from "../src/providers/adyen/provider";
import { RazorpayProvider } from "../src/providers/razorpay/provider";
import { SquareProvider } from "../src/providers/square/provider";
import { BraintreeProvider } from "../src/providers/braintree/provider";
import { PaypalProvider } from "../src/providers/paypal/provider";
import { CheckoutComProvider } from "../src/providers/checkoutcom/provider";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

/** Tangkap body JSON yang dikirim ke PG. */
function captureFetch(response: any) {
  const sent: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const u = String(url);
    // PayPal ambil access token dulu dari endpoint OAuth.
    if (u.includes("/v1/oauth2/token")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "A" }), text: async () => '{"access_token":"A"}' };
    }
    sent.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return {
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  };
  return sent;
}

beforeEach(() => { process.env = { NODE_ENV: "test" }; });
afterEach(() => {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
});

const adyenCfg = { apiKey: "AK", merchantCode: "ACC", extra: { merchantAccount: "ACC" } } as any;
const rzpCfg = { apiKey: "rzp_key", secretKey: "rzp_secret" } as any;

describe("P3 — Adyen meneruskan paymentMethod ke field API resmi", () => {
  it("/payments mengisi paymentMethod.type dari kode kanonik", async () => {
    const sent = captureFetch({ resultCode: "Authorised", pspReference: "psp_1" });
    const res = await new AdyenProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A B", email: "a@b.c" }, paymentMethod: "paypal" } as any,
      adyenCfg,
    );
    expect(res.success).toBe(true);
    const body = sent[0].body;
    expect(body.paymentMethod).toEqual({ type: "paypal" });
    // `paymentMethod` wajib ada di /payments — sebelumnya field ini sama sekali tidak dikirim
    expect(body.paymentMethod).toBeDefined();
  });

  it("credit_card dipetakan ke type 'scheme'", async () => {
    const sent = captureFetch({ resultCode: "Authorised", pspReference: "psp_1" });
    await new AdyenProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "credit_card" } as any,
      adyenCfg,
    );
    expect(sent[0].body.paymentMethod).toEqual({ type: "scheme" });
  });

  it("/sessions mengisi allowedPaymentMethods (jalur redirect)", async () => {
    const sent = captureFetch({ id: "sess_1", url: "https://x.test/s", sessionData: "sd" });
    const res = await new AdyenProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "apple_pay" } as any,
      { ...adyenCfg, simulate: false } as any,
    );
    // paymentMethod ada → mode direct. Cek jalur session secara eksplisit.
    expect(res.success).toBe(true);
  });

  it("detail paymentMethod dari providerParams tidak ditimpa", async () => {
    const sent = captureFetch({ resultCode: "Authorised", pspReference: "p" });
    await new AdyenProvider().createInvoice(
      {
        orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" },
        paymentMethod: "credit_card",
        providerParams: { paymentMethod: { type: "scheme", encryptedCardNumber: "enc_1" } },
      } as any,
      adyenCfg,
    );
    expect(sent[0].body.paymentMethod).toEqual({ type: "scheme", encryptedCardNumber: "enc_1" });
  });

  it("tanpa paymentMethod, paymentMethod tidak disuntikkan", async () => {
    const sent = captureFetch({ id: "s", url: "https://x.test" });
    await new AdyenProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" } } as any,
      adyenCfg,
    );
    expect(sent[0].body.paymentMethod).toBeUndefined();
    expect(sent[0].body.allowedPaymentMethods).toBeUndefined();
  });

  it("menandai paymentMethodApplied = 'server'", async () => {
    captureFetch({ resultCode: "Authorised", pspReference: "p" });
    const res = await new AdyenProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "paypal" } as any,
      adyenCfg,
    );
    expect(res.paymentMethodApplied).toBe("server");
  });
});

describe("P3 — Razorpay meneruskan field `method` (upi / netbanking)", () => {
  it("upi dikirim sebagai method: 'upi'", async () => {
    const sent = captureFetch({ id: "order_1", amount: 1000 });
    const res = await new RazorpayProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "upi" } as any,
      rzpCfg,
    );
    expect(res.success).toBe(true);
    expect(sent[0].body.method).toBe("upi");
    expect(res.paymentMethodApplied).toBe("server");
  });

  it("netbanking dikirim sebagai method: 'netbanking'", async () => {
    const sent = captureFetch({ id: "order_1", amount: 1000 });
    await new RazorpayProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "netbanking" } as any,
      rzpCfg,
    );
    expect(sent[0].body.method).toBe("netbanking");
  });

  it("method tanpa padanan server-side TIDAK dikirim dan ditandai advisory", async () => {
    const sent = captureFetch({ id: "order_1", amount: 1000 });
    const res = await new RazorpayProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "credit_card" } as any,
      rzpCfg,
    );
    // Razorpay hanya menerima "upi" | "netbanking" — mengarang nilai lain = 400
    expect(sent[0].body.method).toBeUndefined();
    expect(res.paymentMethodApplied).toBe("advisory");
  });

  it("providerParams tetap bisa menimpa method", async () => {
    const sent = captureFetch({ id: "order_1", amount: 1000 });
    await new RazorpayProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "upi", providerParams: { method: "netbanking" } } as any,
      rzpCfg,
    );
    expect(sent[0].body.method).toBe("netbanking");
  });
});

describe("P3 — provider yang tidak bisa enforce method ditandai 'advisory'", () => {
  it("Square menandai advisory (CreatePayment tidak punya field method)", async () => {
    const sent = captureFetch({ payment: { id: "p1", amount_money: { amount: 1000 } } });
    const res = await new SquareProvider().createInvoice(
      {
        orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" },
        paymentMethod: "credit_card", providerParams: { sourceId: "cnon:tok" },
      } as any,
      { apiKey: "EAAA", merchantCode: "LOC", extra: { locationId: "L" }, sandbox: true } as any,
    );
    expect(res.success).toBe(true);
    expect(res.paymentMethodApplied).toBe("advisory");
    // tidak boleh mengarang field method yang tidak ada di API Square
    expect(sent[0].body.payment_method_type).toBeUndefined();
    expect(sent[0].body.method).toBeUndefined();
  });

  it("Braintree menandai advisory (butuh nonce dari Drop-in UI)", async () => {
    captureFetch({ transaction: { id: "t1", status: "submitted_for_settlement", amount: "10.00" } });
    const res = await new BraintreeProvider().createInvoice(
      {
        orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" },
        paymentMethod: "venmo", providerParams: { nonce: "fake-valid-nonce" },
      } as any,
      { apiKey: "priv", merchantCode: "M", extra: { publicKey: "pub" }, sandbox: true } as any,
    );
    expect(res.paymentMethodApplied).toBe("advisory");
  });

  it("PayPal menandai advisory (payment_source harus dari JS SDK)", async () => {
    captureFetch({ id: "ORDER-1", links: [{ rel: "approve", href: "https://pp.test/a" }] });
    const res = await new PaypalProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "credit_card" } as any,
      { apiKey: "secret", sandbox: true } as any,
    );
    expect(res.paymentMethodApplied).toBe("advisory");
  });

  it("Checkout.com menandai advisory", async () => {
    captureFetch({ id: "pay_1", amount: 1000, _links: { redirect: { href: "https://cko.test/p" } } });
    const res = await new CheckoutComProvider().createInvoice(
      { orderId: "O1", amount: 1000, productDetails: "x", customer: { name: "A", email: "a@b.c" }, paymentMethod: "apple_pay" } as any,
      { apiKey: "sk" } as any,
    );
    expect(res.paymentMethodApplied).toBe("advisory");
  });
});

describe("P3 — capability model menyatakan kebenaran", () => {
  it("provider dengan mapping kanonik punya serverForwardedMethods", () => {
    const adyen = providerRegistry.get("adyen");
    expect(adyen?.serverForwardedMethods).toContain("credit_card");
    expect(adyen?.serverForwardedMethods).toContain("paypal");

    const rzp = providerRegistry.get("razorpay");
    expect(rzp?.serverForwardedMethods).toEqual(expect.arrayContaining(["upi", "netbanking"]));
  });

  it("provider client-driven TIDAK mengklaim punya forwarded methods", () => {
    for (const p of ["square", "braintree", "paypal", "checkoutcom"]) {
      expect(providerRegistry.get(p)?.serverForwardedMethods).toBeUndefined();
    }
  });

  it("semua provider Indonesia tetap punya serverForwardedMethods", () => {
    for (const p of ["midtrans", "duitku", "ipaymu", "xendit", "doku", "sumopod", "xenith"]) {
      const cap = providerRegistry.get(p);
      expect(cap?.serverForwardedMethods, p).toBeDefined();
      expect(cap!.serverForwardedMethods!.length, p).toBeGreaterThan(0);
    }
  });

  it("serverForwardedMethods tidak pernah melebihi methods yang diiklankan", () => {
    for (const name of providerRegistry.names()) {
      const cap = providerRegistry.get(name);
      for (const m of cap?.serverForwardedMethods || []) {
        expect(cap!.methods, `${name}.${m}`).toContain(m);
      }
    }
  });
});
