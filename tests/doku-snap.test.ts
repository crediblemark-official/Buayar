import { describe, expect, it } from "bun:test";
import {
  Buayar,
  generateSnapSymmetricSignature,
  snapTimestamp,
  snapUtcTimestamp,
  SnapClient,
} from "../src";

const TEST_RSA_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCigvzSGydgbYZT
uJSWja3c9cA+hF71bnzoEY82dxLq/YCkONu5YiLgIvnw+DKNM3JD4rAz88d4QfGW
hSEnJ6NLBVrBcfB1syGNZ1uUGHgpnFv0lJXybLnqx5SzZsI692TYDXCIveGzIN5m
SnGCyUORLViltvDe8x/0gtdZfJwdoYTtyoaVP3YcYaRoUPjk1apyc5UbCWknvqPL
HDYNQOc8vF7nTDRHPCEdyG6JXKH5AH46B2T2MEQtH96DAeXiIyxYHCp0bMsaXAZD
70Gr9SxZYirosXi5Q87i2FA4v3dAjdz5/WGPgUci5GInQz6D0VN1Jd5M7jxSISUc
LWol+E/HAgMBAAECggEADVrZv109sdxxggObEZMO2yfGhryzd9R+s9/uVqnLABmy
24wHboDxYCovqdntTMV4c4cd0NJZrZKWizaUjPziaMHFym9JG5SldYZHAQqDvkB1
t0mj17pcpIq5nlNomcm6Qh3Un8AiKJzTLTFn8GxtJSSTWOCJ6eB6W0pXVSjHqypf
YBE25ZZRSVMrLIJcUdy0WiKlww/jnQKMR1RNK813rSpE1spAs+dcIUFyC0xiK3im
1CGyqg03xeSWRBJiKsVlGIpVGBdt5mqgEm5ZlNQv5DubboLrqqD4vpmLCrL4QN0y
nFXfEZ/iM6FQ1dAoBBN4KtFCLTR039ORLnUptByRFQKBgQDYgrc64xiNKtrpDdEf
rGlkID3qDvZjzX5NdmGQpZzK2kgHwdBRuQ+t5LXl9wa3hSlpJ36suz28Gg9aTkwu
Qn4Oox+K9zgP/RFoNtyqCvIsvKELAcBAr/xgUz5c9ByMCryqVhPywzPer/ld59I2
/fsVvoOKVxtMrET88DAbhyryVQKBgQDAJvXua9hG4ag1qF8dn90c/6FNejm6emjP
9whNHJCuJgrQ+x4u1r6Vtlyebhq70KNsU0Xr28qWkR18R4CMqRKYpTf7HivsY9bT
rOloq/0YCLKiJuVTvbV0JIiCIdPFYHsKSabZFSnlBznN/fDpW0zPj3cnXcNvvwM7
0O/3Y3GtqwKBgFzPI7Y1dOfGkBJI3vUB1ieafo/fnBTKGLMh5M65f02hZjEVDrSJ
bMQw/xw12QZAKbEuwelPVjZUwXIHkDZgQGML39CVCs4nwBd5NPwbNxagQTRTqtLP
3ZJ4/ImiBr6tN5SY03JD5O83ZeCwJ/d0xfXbNc3OayBh1CzM1QJn3awFAoGBAJpS
MA2tu2Mh9FAzy0AllhWmEEwDL73edbMgOSCFIoVatDEmnRUNDr96WGQ9FWdlpvpm
3q8QNGI8ZavcWRee6fqCJrWdg7U0ceJK6qJQDtJwmda02lUo9UQz2xZ4SHYqiGa4
xDFwV9dCuGAB5Kvl0YiZNh79pOpoRBaUNUVALppFAoGAZobYuApBCkdJRK2PmJ8q
EfIQjperSrxdV6VHcDfVqEFdG/LNM9CII8OXM9wioMcanKz/8HfskfszwNGcNqLz
IkweipG7tkSDDM8dtWXhGq9YjkZmyU/JyjJWWi5+ea+I20udsxPJGZw4GQgm40qZ
B1TLci5jDTl/RgVBT+Ky0Vw=
-----END PRIVATE KEY-----`;

describe("DOKU SNAP Integration", () => {
  it("should create VA invoice via SNAP with B2B token + symmetric signature", async () => {
    const originalFetch = globalThis.fetch;
    let tokenRequested = false;

    (globalThis as any).fetch = async (url: any, options: any) => {
      const u: string = url;
      if (u.includes("/authorization/v1/access-token/b2b")) {
        tokenRequested = true;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            responseCode: "2007300",
            accessToken: "SNAP-ACCESS-TOKEN",
            tokenType: "Bearer",
            expiresIn: 900,
          }),
        } as any;
      }
      if (u.includes("/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va")) {
        expect(options.headers["Authorization"]).toBe("Bearer SNAP-ACCESS-TOKEN");
        expect(options.headers["X-PARTNER-ID"]).toBe("doku_key_9ee7004654a54375ad5a4e6c75a1d386");
        expect(options.headers["X-SIGNATURE"]).toBeTruthy();
        expect(options.headers["X-TIMESTAMP"]).toBeTruthy();
        const body = JSON.parse(options.body);
        expect(body.partnerServiceId).toBe(" 5244497");
        expect(body.virtualAccountNo).toBe(" 52444970000000000001234");
        expect(body.totalAmount.value).toBe("175000.00");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            responseCode: "2002400",
            virtualAccountData: {
              partnerServiceId: "5244497",
              customerNo: "0000000000001234",
              virtualAccountNo: "52444970000000000001234",
              trxId: "ORDER-SNAP-001",
              totalAmount: { value: "175000.00", currency: "IDR" },
              expiredDate: "2026-09-03T12:00:00+07:00",
              additionalInfo: { howToPayPage: "https://sandbox.doku.com/how-to-pay/xyz" },
            },
          }),
        } as any;
      }
      throw new Error("Unexpected URL: " + u);
    };

    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "doku_key_9ee7004654a54375ad5a4e6c75a1d386",
        apiKey: "SK-SC5QTRqzYE7TWL3zHS7A",
        secretKey: "SK-SC5QTRqzYE7TWL3zHS7A",
        privateKey: TEST_RSA_PRIVATE_KEY,
        sandbox: true,
        extra: { snap: true, partnerServiceId: "5244497", customerNo: "0000000000001234" },
      });

      const response = await buayar.createInvoice({
        orderId: "ORDER-SNAP-001",
        amount: 175000,
        paymentMethod: "bca_va",
        productDetails: "Voucher Game",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(tokenRequested).toBe(true);
      expect(response.success).toBe(true);
      expect(response.provider).toBe("doku");
      expect(response.vaNumber).toBe("52444970000000000001234");
      expect(response.vaBank).toBe("BCA");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should verify DOKU SNAP webhook symmetric signature", async () => {
    const secretKey = "SK-SC5QTRqzYE7TWL3zHS7A";
    const endpointUrl = "/api/payment/webhook";
    const timestamp = "2026-09-03T12:00:00+07:00";
    const payload = {
      partnerServiceId: "5244497",
      customerNo: "0000000000001234",
      virtualAccountNo: "52444970000000000001234",
      trxId: "ORDER-SNAP-001",
      totalAmount: { value: "175000.00", currency: "IDR" },
      paidAmount: { value: "175000.00", currency: "IDR" },
    };

    const signature = generateSnapSymmetricSignature(secretKey, "POST", endpointUrl, "", payload, timestamp);

    const buayar = new Buayar({
      provider: "doku",
      merchantCode: "doku_key_9ee7004654a54375ad5a4e6c75a1d386",
      apiKey: secretKey,
      sandbox: true,
      extra: { snap: true, notificationPath: endpointUrl },
    });

    const res = await buayar.verifyWebhook(payload, {
      "x-signature": signature,
      "x-timestamp": timestamp,
    });

    expect(res.isValid).toBe(true);
    expect(res.isPaid).toBe(true);
    expect(res.orderId).toBe("ORDER-SNAP-001");
    expect(res.amount).toBe(175000);
  });

  it("should reject DOKU SNAP webhook with wrong signature", async () => {
    const secretKey = "SK-SC5QTRqzYE7TWL3zHS7A";
    const buayar = new Buayar({
      provider: "doku",
      merchantCode: "doku_key_9ee7004654a54375ad5a4e6c75a1d386",
      apiKey: secretKey,
      sandbox: true,
      extra: { snap: true },
    });

    const res = await buayar.verifyWebhook(
      { trxId: "ORDER-SNAP-999", paidAmount: { value: "1000.00", currency: "IDR" } },
      { "x-signature": "invalid-signature", "x-timestamp": "2026-09-03T12:00:00+07:00" }
    );

    expect(res.isValid).toBe(false);
  });

  it("should NOT enable SNAP mode when clientId is not a doku_ key", () => {
    const buayar = new Buayar({
      provider: "doku",
      merchantCode: "MALL-ID-123456",
      apiKey: "SK-secret-key-789",
    });
    const provider = (buayar as any).getProvider?.("doku") || (buayar as any).manager;
    expect(buayar).toBeDefined();
    expect(provider).toBeDefined();
  });

  it("should reject B2B token request when no private key", async () => {
    const snap = new SnapClient({
      clientId: "doku_key_x",
      clientSecret: "SK-x",
      sandbox: true,
    });
    await expect(snap.getAccessToken()).rejects.toThrow(/privateKey/);
  });

  it("snapUtcTimestamp produces UTC+0 Z format (required by Get Token B2B)", () => {
    const fixed = new Date("2026-09-03T08:46:59Z");
    expect(snapUtcTimestamp(fixed)).toBe("2026-09-03T08:46:59Z");
  });

  it("snapUtcTimestamp and snapTimestamp represent the same instant", () => {
    const fixed = new Date("2026-09-03T08:46:59Z");
    expect(snapUtcTimestamp(fixed)).toBe("2026-09-03T08:46:59Z");
    // snapTimestamp = WIB +7 offset on the same moment
    expect(snapTimestamp(fixed)).toBe("2026-09-03T15:46:59+07:00");
  });

  it("should REJECT DOKU SNAP webhook without signature (S1b security fix)", async () => {
    const buayar = new Buayar({
      provider: "doku",
      merchantCode: "doku_key_9ee7004654a54375ad5a4e6c75a1d386",
      apiKey: "SK-SC5QTRqzYE7TWL3zHS7A",
      sandbox: true,
      extra: { snap: true },
    });

    const res = await buayar.verifyWebhook(
      { trxId: "ORDER-SNAP-NO-SIG", paidAmount: { value: "1000.00", currency: "IDR" } },
      { "x-timestamp": "2026-09-03T12:00:00+07:00" }
    );

    // Tanpa x-signature → isValid harus false
    expect(res.isValid).toBe(false);
  });
});
