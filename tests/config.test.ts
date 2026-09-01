import { describe, expect, it, beforeEach } from "bun:test";
import { Buayar, resolveConfigFromEnv } from "../src";

describe("Environment Variable Resolver & Zero-Code Switcher", () => {
  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
  });

  it("should resolve Midtrans credentials from PROVIDER_PG and standard variables", () => {
    process.env.PROVIDER_PG = "midtrans";
    process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test-123";
    process.env.MIDTRANS_CLIENT_KEY = "SB-Mid-client-test-456";
    process.env.MIDTRANS_IS_PRODUCTION = "false";

    const config = resolveConfigFromEnv();
    expect(config.provider).toBe("midtrans");
    expect(config.apiKey).toBe("SB-Mid-server-test-123");
    expect(config.clientKey).toBe("SB-Mid-client-test-456");
    expect(config.sandbox).toBe(true);
  });

  it("should resolve Duitku credentials seamlessly from universal variables", () => {
    process.env.PROVIDER_PG = "duitku";
    process.env.PAYMENT_API_KEY = "duitku-api-key-test";
    process.env.PAYMENT_MERCHANT_CODE = "D1234";
    process.env.PAYMENT_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("duitku");
    expect(buayar.getConfig().apiKey).toBe("duitku-api-key-test");
    expect(buayar.getConfig().merchantCode).toBe("D1234");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should resolve iPaymu credentials from environment variables", () => {
    process.env.PROVIDER_PG = "ipaymu";
    process.env.IPAYMU_VA = "0000001411234567";
    process.env.IPAYMU_API_KEY = "ipaymu-key-123";
    process.env.IPAYMU_SANDBOX = "true";

    const buayar = new Buayar();
    expect(buayar.provider).toBe("ipaymu");
    expect(buayar.getConfig().apiKey).toBe("ipaymu-key-123");
    expect(buayar.getConfig().merchantCode).toBe("0000001411234567");
    expect(buayar.getConfig().sandbox).toBe(true);
  });

  it("should support provider-specific extra credentials (e.g. Project ID / Keys)", () => {
    process.env.PROVIDER_PG = "midtrans";
    process.env.BUAYAR_PROJECT_ID = "proj_xyz789";
    process.env.BUAYAR_PUBLIC_KEY = "pub_abc123";
    process.env.BUAYAR_PRIVATE_KEY = "priv_secret456";

    const config = resolveConfigFromEnv();
    expect(config.projectId).toBe("proj_xyz789");
    expect(config.publicKey).toBe("pub_abc123");
    expect(config.privateKey).toBe("priv_secret456");
  });
});
