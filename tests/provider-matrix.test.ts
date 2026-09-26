import { describe, expect, it } from "bun:test";
import { paymentManager } from "../src/core/manager";
import { Buayar } from "../src";

// Daftar 20 provider yang didukung.
const PROVIDERS = [
  "midtrans", "duitku", "ipaymu", "xendit", "doku", "prismalink", "faspay",
  "finpay", "nicepay", "oy", "stripe", "paypal", "adyen", "checkoutcom",
  "razorpay", "square", "payu", "braintree", "twocheckout", "sumopod",
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
  doku:          { refund: false, checkBalance: false, disburse: true  },
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
  sumopod:       { refund: false, checkBalance: false, disburse: false },
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
  sumopod:     { apiKey: "sumo_k" },
};

describe("Provider Matrix — semua PG terdaftar", () => {
  it("harus mendaftarkan seluruh 20 provider", () => {
    for (const name of PROVIDERS) {
      const provider = paymentManager.getProvider(name);
      expect(provider.name.toLowerCase()).toBe(name);
    }
    expect(PROVIDERS.length).toBe(20);
  });

  it("harus menyediakan getter client di facade untuk semua provider", () => {
    const buayar = new Buayar({ provider: "midtrans", apiKey: "x" });
    const getters = [
      "getMidtransClient", "getDuitkuClient", "getIpaymuClient", "getXenditClient",
      "getDokuClient", "getPrismalinkClient", "getFaspayClient", "getFinpayClient",
      "getNicepayClient", "getOyClient", "getStripeClient", "getPaypalClient",
      "getAdyenClient", "getCheckoutComClient", "getRazorpayClient", "getSquareClient",
      "getPayuClient", "getBraintreeClient", "getTwoCheckoutClient", "getSumopodClient",
    ] as const;
    expect(getters.length).toBe(20);
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

  it("K1 DoD — 20/20 provider lolos smoke test createInvoice yang dikonfigurasi 100% via env var", async () => {
    const ENV_MAP: Record<string, Record<string, string>> = {
      midtrans:    { MIDTRANS_SERVER_KEY: "SB-Mid-server-x" },
      duitku:      { DUITKU_API_KEY: "k", DUITKU_MERCHANT_CODE: "M" },
      ipaymu:      { IPAYMU_API_KEY: "k", IPAYMU_VA: "00000014" },
      xendit:      { XENDIT_SECRET_KEY: "xnd_development_x" },
      doku:        { DOKU_CLIENT_ID: "c", DOKU_SECRET_KEY: "s" },
      prismalink:  { PRISMALINK_MERCHANT_ID: "M", PRISMALINK_SECRET_KEY: "s" },
      faspay:      { FASPAY_MERCHANT_ID: "M", FASPAY_USER_ID: "u", FASPAY_PASSWORD: "p" },
      finpay:      { FINPAY_MERCHANT_ID: "M", FINPAY_MERCHANT_KEY: "k" },
      nicepay:     { NICEPAY_IMID: "M", NICEPAY_KEY: "k" },
      oy:          { OY_USERNAME: "u", OY_API_KEY: "k" },
      stripe:      { STRIPE_SECRET_KEY: "sk_test_x" },
      paypal:      { PAYPAL_CLIENT_ID: "c", PAYPAL_CLIENT_SECRET: "s" },
      adyen:       { ADYEN_API_KEY: "k", ADYEN_MERCHANT_ACCOUNT: "acc" },
      checkoutcom: { CHECKOUTCOM_SECRET_KEY: "sk_x" },
      razorpay:    { RAZORPAY_KEY_ID: "rzp_x", RAZORPAY_KEY_SECRET: "s" },
      square:      { SQUARE_ACCESS_TOKEN: "EAAA_x", SQUARE_LOCATION_ID: "L" },
      payu:        { PAYU_POS_ID: "P", PAYU_MD5_KEY: "k" },
      braintree:   { BRAINTREE_MERCHANT_ID: "M", BRAINTREE_PUBLIC_KEY: "pub", BRAINTREE_PRIVATE_KEY: "priv" },
      twocheckout: { TWOCHECKOUT_MERCHANT_CODE: "M", TWOCHECKOUT_SECRET_KEY: "s" },
      sumopod:     { SUMOPOD_API_KEY: "sumo_k" },
    };

    const prevEnv = { ...process.env };
    (globalThis as any).fetch = async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "mock_order_123", redirect_url: "https://pay.test", token: "tok_123", url: "https://pay.test" }),
      text: async () => JSON.stringify({ id: "mock_order_123", redirect_url: "https://pay.test", token: "tok_123", url: "https://pay.test" }),
    });

    try {
      for (const name of PROVIDERS) {
        process.env = {
          PROVIDER_PG: name,
          ...ENV_MAP[name],
        };

        const buayar = new Buayar();
        expect(buayar.provider).toBe(name);

        const res = await buayar.createInvoice({
          orderId: `ORDER-ENV-${name}`,
          amount: 50000,
          productDetails: "Smoke Test",
          customer: { name: "Tester", email: "tester@example.com" },
        });

        expect(res.provider).toBe(name);
      }
    } finally {
      process.env = prevEnv;
      globalThis.fetch = originalFetch;
    }
  });
});
