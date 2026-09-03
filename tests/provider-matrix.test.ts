import { describe, expect, it } from "bun:test";
import { paymentManager } from "../src/core/manager";
import { Buayar } from "../src";

// Daftar 19 provider yang didukung.
const PROVIDERS = [
  "midtrans", "duitku", "ipaymu", "xendit", "doku", "prismalink", "faspay",
  "finpay", "nicepay", "oy", "stripe", "paypal", "adyen", "checkoutcom",
  "razorpay", "square", "payu", "braintree", "twocheckout",
] as const;

// Matriks dukungan fitur unggulan (sesuai switch di PaymentManager).
// true  = didukung & ter-route ke client
// false = mengembalikan { supported: false } (bukan throw)
const CAPABILITIES: Record<
  string,
  { refund: boolean; checkBalance: boolean; disburse: boolean }
> = {
  midtrans:      { refund: true,  checkBalance: true,  disburse: false },
  duitku:        { refund: false, checkBalance: true,  disburse: true  },
  ipaymu:        { refund: false, checkBalance: true,  disburse: false },
  xendit:        { refund: false, checkBalance: true,  disburse: true  },
  doku:          { refund: false, checkBalance: false, disburse: false },
  prismalink:    { refund: false, checkBalance: false, disburse: false },
  faspay:        { refund: false, checkBalance: false, disburse: false },
  finpay:        { refund: false, checkBalance: false, disburse: false },
  nicepay:       { refund: false, checkBalance: false, disburse: false },
  oy:            { refund: false, checkBalance: true,  disburse: true  },
  stripe:        { refund: true,  checkBalance: true,  disburse: false },
  paypal:        { refund: true,  checkBalance: true,  disburse: false },
  adyen:         { refund: true,  checkBalance: false, disburse: false },
  checkoutcom:   { refund: true,  checkBalance: true,  disburse: false },
  razorpay:      { refund: true,  checkBalance: true,  disburse: false },
  square:        { refund: true,  checkBalance: true,  disburse: false },
  payu:          { refund: true,  checkBalance: false, disburse: false },
  braintree:     { refund: true,  checkBalance: false, disburse: false },
  twocheckout:   { refund: true,  checkBalance: false, disburse: false },
};

const baseConfig: Record<string, any> = {
  duitku:      { apiKey: "k", merchantCode: "M" },
  midtrans:    { apiKey: "SB-Mid-server-x" },
  ipaymu:      { apiKey: "k", merchantCode: "M", extra: { virtualAccount: "VA001" } },
  xendit:      { apiKey: "xnd_development_x" },
  doku:        { merchantCode: "M", secretKey: "s", extra: { clientId: "c" } },
  prismalink:  { merchantCode: "M", secretKey: "s", extra: { merchantId: "mid" } },
  faspay:      { apiKey: "x", merchantCode: "M", extra: { userId: "u", password: "p" } },
  finpay:      { apiKey: "x", merchantCode: "M", extra: { merchantKey: "mk" } },
  nicepay:     { apiKey: "x", merchantCode: "M", extra: { imid: "IM" } },
  oy:          { apiKey: "x", merchantCode: "M", extra: { username: "u" } },
  stripe:      { apiKey: "sk_test_x" },
  paypal:      { apiKey: "client_id", secretKey: "secret", sandbox: true },
  adyen:       { apiKey: "x", merchantCode: "ACC", extra: { merchantAccount: "ACC" } },
  checkoutcom: { apiKey: "sk_x" },
  razorpay:    { apiKey: "rzp_x", secretKey: "rzp_s" },
  square:      { apiKey: "EAAA_x", merchantCode: "LOC" },
  payu:        { apiKey: "x", merchantCode: "POS" },
  braintree:   { apiKey: "x", merchantCode: "M", extra: { publicKey: "p", privateKey: "pk" } },
  twocheckout: { apiKey: "x", merchantCode: "M", extra: { secretWord: "w" } },
};

describe("Provider Matrix — semua PG terdaftar", () => {
  it("harus mendaftarkan seluruh 19 provider", () => {
    for (const name of PROVIDERS) {
      const provider = paymentManager.getProvider(name);
      expect(provider.name.toLowerCase()).toBe(name);
    }
    expect(PROVIDERS.length).toBe(19);
  });

  it("harus menyediakan getter client di facade untuk semua provider", () => {
    const buayar = new Buayar({ provider: "midtrans", apiKey: "x" });
    const getters = [
      "getMidtransClient", "getDuitkuClient", "getIpaymuClient", "getXenditClient",
      "getDokuClient", "getPrismalinkClient", "getFaspayClient", "getFinpayClient",
      "getNicepayClient", "getOyClient", "getStripeClient", "getPaypalClient",
      "getAdyenClient", "getCheckoutComClient", "getRazorpayClient", "getSquareClient",
      "getPayuClient", "getBraintreeClient", "getTwoCheckoutClient",
    ] as const;
    expect(getters.length).toBe(19);
    for (const g of getters) {
      expect(typeof (buayar as any)[g]).toBe("function");
    }
  });
});

describe("Provider Matrix — matriks fitur unggulan", () => {
  function buildBuayar(name: string): Buayar {
    const cfg = { ...(baseConfig[name] || {}), provider: name };
    return new Buayar(cfg);
  }

  const originalFetch = globalThis.fetch;

  it("harus mengembalikan support matrix yang sesuai per provider (tanpa network)", async () => {
    (globalThis as any).fetch = async () => {
      throw new Error("should not reach network — verificasi matriks via switch lokal");
    };

    try {
      for (const name of PROVIDERS) {
        const buayar = buildBuayar(name);
        const expected = CAPABILITIES[name];

        // Jika provider mendukung fitur, ia akan memanggil fetch (yang kita paksa gagal)
        // -> hasilnya { success:false, supported:true }. Jika tidak mendukung ->
        // { supported:false } tanpa fetch. Keduanya membuktikan routing benar tanpa network.
        const refund = await buayar.refund({ transactionId: "T-1", amount: 1000 });
        expect(refund.supported, `${name} refund`).toBe(expected.refund);

        const balance = await buayar.checkBalance();
        expect(balance.supported, `${name} checkBalance`).toBe(expected.checkBalance);

        const disburse = await buayar.disburse({
          externalId: "D-1", bankCode: "BCA", accountNumber: "123", amount: 1000,
        });
        expect(disburse.supported, `${name} disburse`).toBe(expected.disburse);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
