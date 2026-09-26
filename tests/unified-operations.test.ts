import { describe, expect, it, afterEach } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { Buayar } from "../src";

const RSA_TEST_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

let originalFetch: any;

function mockFetch(handler: (url: any, options?: any) => any) {
  originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: any, options: any) => {
    const result = handler(url, options);
    const body = typeof result.body !== "undefined" ? result.body : result;
    return {
      ok: result.ok !== false,
      status: result.status ?? 200,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    } as any;
  };
}

function restoreFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
}

afterEach(() => restoreFetch());

describe("Unified Operations — Refund", () => {
  it("should refund via Stripe", async () => {
    mockFetch(() => ({ id: "re_123", status: "succeeded" }));
    const buayar = new Buayar({ provider: "stripe", apiKey: "sk_test_123" });
    const result = await buayar.refund({ transactionId: "pi_456", amount: 50000 });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.reference).toBe("re_123");
  });

  it("should refund via Midtrans", async () => {
    mockFetch(() => ({ order_id: "ORDER-1", status_message: "Success, transaction is refunded" }));
    const buayar = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-123" });
    const result = await buayar.refund({ transactionId: "ORDER-1", amount: 50000, reason: "product defect" });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.provider).toBe("midtrans");
  });

  it("should return supported:false for provider without refund (faspay)", async () => {
    const buayar = new Buayar({ provider: "faspay", apiKey: "x", merchantCode: "M", extra: { userId: "u", password: "p" } });
    const result = await buayar.refund({ transactionId: "ORDER-1" });
    expect(result.supported).toBe(false);
    expect(result.success).toBe(false);
  });
});

describe("Unified Operations — Check Balance", () => {
  it("should fetch Stripe balance", async () => {
    mockFetch(() => ({ available: [{ amount: 150000, currency: "idr" }] }));
    const buayar = new Buayar({ provider: "stripe", apiKey: "sk_test_123" });
    const result = await buayar.checkBalance();
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.balance).toBe(150000);
    expect(result.currency).toBe("idr");
  });

  it("should fetch Xendit balance", async () => {
    mockFetch(() => ({ balance: 250000 }));
    const buayar = new Buayar({ provider: "xendit", apiKey: "xnd_development_123" });
    const result = await buayar.checkBalance();
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.balance).toBe(250000);
  });

  it("should return supported:false for provider without balance (twocheckout)", async () => {
    const buayar = new Buayar({ provider: "twocheckout", merchantCode: "M", secretKey: "S", extra: { secretWord: "W" } });
    const result = await buayar.checkBalance();
    expect(result.supported).toBe(false);
    expect(result.success).toBe(false);
  });
});

describe("Unified Operations — Disburse", () => {
  it("should disburse via Xendit", async () => {
    const calls: string[] = [];
    mockFetch((url: any, options: any) => {
      calls.push(JSON.parse(options.body).external_id);
      return { id: "disb_123", status: "PENDING" };
    });
    const buayar = new Buayar({ provider: "xendit", apiKey: "xnd_development_123" });
    const result = await buayar.disburse({
      externalId: "DISB-001",
      bankCode: "BCA",
      accountHolderName: "BUDI",
      accountNumber: "1234567890",
      amount: 500000,
    });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(calls[0]).toBe("DISB-001");
    expect(result.reference).toBe("disb_123");
  });

  it("should disburse via Duitku", async () => {
    mockFetch((url: any) => {
      if (String(url).includes("/inquiry")) {
        return { responseCode: "00", responseDesc: "Success", disburseId: "DISB-DUITKU-002", custRefNumber: "REF-002", accountName: "Budi" };
      }
      return { responseCode: "00", responseDesc: "Success" };
    });
    const buayar = new Buayar({
      provider: "duitku",
      apiKey: "k",
      merchantCode: "M",
      disbursementUserId: 3551,
      disbursementEmail: "merchant@contoh.id",
      disbursementSecretKey: "a".repeat(64),
    });
    const result = await buayar.disburse({
      externalId: "DISB-002",
      bankCode: "BCA",
      accountNumber: "1234567890",
      amount: 100000,
    });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.reference).toBe("DISB-DUITKU-002");
    expect(result.status).toBe("PENDING");
  });

  it("should disburse via DOKU", async () => {
    mockFetch((url: any) => {
      if (String(url).includes("/authorization/v1/access-token/b2b")) {
        return { accessToken: "tok-test", expiresIn: 900 };
      }
      return {
        responseCode: "2004300",
        responseMessage: "Successful",
        partnerReferenceNo: "DISB-DOKU-001",
      };
    });
    const buayar = new Buayar({
      provider: "doku",
      merchantCode: "MALL-ID-123",
      apiKey: "SK-secret-123",
      privateKey: RSA_TEST_KEY,
    });
    const result = await buayar.disburse({
      externalId: "DISB-DOKU-001",
      bankCode: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "Budi",
      amount: 250000,
      customerNumber: "081234567890",
      sessionId: "SESS-DOKU-001",
      description: "Payout gaji",
    });
    expect(result.supported).toBe(true);
    expect(result.success).toBe(true);
    expect(result.provider).toBe("doku");
    expect(result.reference).toBe("DISB-DOKU-001");
    expect(result.status).toBe("SUCCESS");
  });

  describe("DOKU payout (Kirim DOKU) — responseCode-based, fail-closed", () => {
    const payout = (response: any) => {
      mockFetch((url: any) => {
        if (String(url).includes("/authorization/v1/access-token/b2b")) {
          return { accessToken: "tok-test", expiresIn: 900 };
        }
        const code = String(response?.responseCode ?? "");
        const is4xx = code.startsWith("4");
        return {
          ok: !is4xx,
          status: is4xx ? Number(code.slice(0, 3)) : 200,
          body: response,
        };
      });
      return new Buayar({
        provider: "doku",
        merchantCode: "MALL-ID-123",
        apiKey: "SK-secret-123",
        privateKey: RSA_TEST_KEY,
      }).disburse({
        externalId: "DISB-DOKU-CODE",
        bankCode: "BCA",
        accountNumber: "1234567890",
        accountHolderName: "Budi",
        amount: 250000,
        customerNumber: "081234567890",
        sessionId: "SESS-DOKU-CODE",
        description: "Payout gaji",
      });
    };

    it("2004300 (Successful) → sukses", async () => {
      const r = await payout({ responseCode: "2004300", responseMessage: "Successful", referenceNo: "REF-1" });
      expect(r.success).toBe(true);
      expect(r.status).toBe("SUCCESS");
      expect(r.reference).toBe("REF-1");
    });

    it("2024300 (masih diproses) → tetap sukses agar tidak di-retry, tapi status PENDING", async () => {
      const r = await payout({ responseCode: "2024300", responseMessage: "Transaction still on process" });
      expect(r.success).toBe(true);
      expect(r.status).toBe("PENDING");
    });

    it("4034314 (Insufficient Funds) → GAGAL, bukan sukses", async () => {
      const r = await payout({ responseCode: "4034314", responseMessage: "Insufficient Funds" });
      expect(r.success).toBe(false);
      expect(r.status).toBe("FAILED");
      expect(r.error).toContain("Insufficient Funds");
    });

    it("4044311 (rekening penerima tidak valid) → GAGAL", async () => {
      const r = await payout({ responseCode: "4044311", responseMessage: "Invalid Card/Account/Customer" });
      expect(r.success).toBe(false);
    });

    it("4004302 (field wajib kurang) → GAGAL", async () => {
      const r = await payout({ responseCode: "4004302", responseMessage: "Invalid Mandatory Field" });
      expect(r.success).toBe(false);
    });

    // REGRESI: respons apa pun tanpa field `error` pernah boleh dianggap sukses.
    // DOKU tidak pernah mengirim field `error` di respons payout sama sekali,
    // jadi logika lama `|| !data?.error` selalu bernilai true.
    it("respons kosong tanpa responseCode → GAGAL (bukan sukses diam-diam)", async () => {
      const r = await payout({});
      expect(r.success).toBe(false);
      expect(r.error).toBeTruthy();
    });

    it("2002500 (kode create VA, bukan payout) tidak boleh dihitung sukses", async () => {
      const r = await payout({ responseCode: "2002500" });
      expect(r.success).toBe(false);
    });
  });

  it("should return supported:false for provider without disburse (stripe)", async () => {
    const buayar = new Buayar({ provider: "stripe", apiKey: "sk_test_123" });
    const result = await buayar.disburse({
      externalId: "DISB-003",
      bankCode: "BCA",
      accountNumber: "123",
      amount: 1000,
    });
    expect(result.supported).toBe(false);
    expect(result.success).toBe(false);
  });
});
