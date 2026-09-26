/**
 * Regresi integritas disbursement dan pembacaan saldo.
 *
 * Semua kegagalan di sini punya asal yang sama: pustaka pernah membaca
 * "tidak ada jawaban" atau "jawaban salah bentuk" sebagai "berhasil".
 * Untuk jalur uang keluar, itu berarti merchant mengira uang sudah dikirim.
 *
 * Bukti asal (live, 2026-09-26):
 *   • DOKU   — path lama `/kirim-doku/v1/*` menjawab `404 "No static
 *              resource"`, sedangkan path SNAP resmi menjawab kode error DOKU
 *              yang asli. `validateBankAccount` lama membalas `success: true`
 *              untuk body 404 itu.
 *   • Duitku — path lama `/api/disbursement/*` di host `api-sandbox` menjawab
 *      404; path resmi ada di host `sandbox.duitku.com/webapi`.
 *   • Duitku — endpoint disbursement menjawab HTTP 200 meski gagal bisnis,
 *      dengan `responseCode` negatif. `response.ok` tidak pernah cukup.
 *   • iPaymu — `MerchantBalance: 0` itu sah, tapi `? … : undefined` mengubah
 *     nya jadi `undefined`.
 */

import { describe, expect, it } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { Buayar } from "../src";
import { DuitkuClient } from "../src/clients/duitku";
import { DokuClient } from "../src/clients/doku";
import { IpaymuClient } from "../src/clients/ipaymu";

const DISBURSE_CRED = {
  disbursementUserId: 3551,
  disbursementEmail: "merchant@contoh.id",
  disbursementSecretKey: "a".repeat(64),
};

/** RSA key sekali pakai, supaya tanda tangan B2B benar-benar bisa dihitung. */
const RSA_TEST_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

function json(body: any, status = 200) {
  return { ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) } as any;
}

describe("Duitku disbursement memakai endpoint resmi", () => {
  it("tidak pernah menembak path karangan /api/disbursement di host api-sandbox", async () => {
    const urls: string[] = [];
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async (url: any) => {
      urls.push(String(url));
      return json({ balance: 0, effectiveBalance: 0, responseCode: "00", responseDesc: "Success" });
    };
    try {
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "duitku-key",
        sandbox: true,
        ...DISBURSE_CRED,
      } as any);
      await client.checkBalance();
      for (const url of urls) {
        expect(url.startsWith("https://sandbox.duitku.com/webapi/")).toBe(true);
        expect(url).toContain("/webapi/api/disbursement/checkbalance");
      }
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("tidak pernah memakai merchantCode atau API key pembayaran di signature disbursement", async () => {
    let bodyKirim: any = null;
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      bodyKirim = JSON.parse(options.body);
      return json({ balance: 1, effectiveBalance: 1, responseCode: "00" });
    };
    try {
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "duitku-key-pembayaran",
        sandbox: true,
        ...DISBURSE_CRED,
      } as any);
      await client.checkBalance();

      expect(bodyKirim.merchantCode).toBeUndefined();
      expect(bodyKirim.userId).toBe(3551);
      expect(bodyKirim.email).toBe("merchant@contoh.id");
      expect(bodyKirim.signature).not.toContain("duitku-key-pembayaran");
      // Signature resmi: SHA256(email + timestamp + secretKey)
      const { createHash } = await import("node:crypto");
      const diharapkan = createHash("sha256")
        .update("merchant@contoh.id" + String(bodyKirim.timestamp) + DISBURSE_CRED.disbursementSecretKey)
        .digest("hex");
      expect(bodyKirim.signature).toBe(diharapkan);
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("menolak operasi disbursement sebelum jaringan bila kredensial khusus tidak ada", async () => {
    let ditembak = false;
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      ditembak = true;
      return json({});
    };
    try {
      // Hanya kredensial pembayaran; belum cukup untuk disbursement.
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "duitku-key",
        sandbox: true,
      } as any);

      // Kurangnya kredensial itu galat setup yang permanen, jadi dilempar
      // — bukan `success: false` yang akan mengajak merchant mencoba selamanya.
      let pesan = "";
      try {
        await client.checkBalance();
      } catch (e: any) {
        pesan = e.message;
      }
      expect(pesan).toContain("disbursementUserId");
      expect(pesan).toContain("disbursementEmail");
      expect(pesan).toContain("disbursementSecretKey");
      // Tidak ada request yang boleh keluar: signature pasti ditolak Duitku.
      expect(ditembak).toBe(false);

      // Jalur uang tetap memakai kontrak hasil, bukan melempar ke pemanggil.
      const hasilUang = await client.disburse({
        bankCode: "014",
        bankAccount: "8760673566",
        amount: 50000,
        purpose: "Gaji",
      });
      expect(hasilUang.success).toBe(false);
      expect(hasilUang.error).toContain("disbursementUserId");
      expect(ditembak).toBe(false);
    } finally {
      globalThis.fetch = asli;
    }
  });
});

describe("Duitku disbursement fail-closed pada responseCode", () => {
  it("responseCode -120 tidak pernah dibaca sebagai disbursement berhasil", async () => {
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      // Duitku menjawab HTTP 200 walau bisnisnya gagal.
      json({ responseCode: "-120", responseDesc: "User not found" });
    try {
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "k",
        sandbox: true,
        ...DISBURSE_CRED,
      } as any);

      const hasil = await client.disburse({
        bankCode: "014",
        bankAccount: "8760673566",
        amount: 50000,
        purpose: "Gaji",
      });
      expect(hasil.success).toBe(false);
      expect(hasil.step).toBe("inquiry");
      expect(hasil.error).toContain("-120");
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("tidak mengirim transfer bila inquiry tidak mengembalikan disburseId", async () => {
    const urls: string[] = [];
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async (url: any) => {
      urls.push(String(url));
      // Sukses di level responseCode, tapi tanpa disburseId.
      return json({ responseCode: "00", responseDesc: "Success", disburseId: 0 });
    };
    try {
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "k",
        sandbox: true,
        ...DISBURSE_CRED,
      } as any);

      const hasil = await client.disburse({
        bankCode: "014",
        bankAccount: "8760673566",
        amount: 50000,
        purpose: "Gaji",
      });
      expect(hasil.success).toBe(false);
      expect(hasil.error).toContain("disburseId");
      expect(urls.some((u) => u.includes("transfer"))).toBe(false);
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("meneruskan disburseId dari inquiry ke transfer", async () => {
    const bodies: any[] = [];
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      if (String(_url).includes("inquiry")) {
        return json({
          responseCode: "00",
          disburseId: 777,
          accountName: "BUDI SANTOSO",
          custRefNumber: "000000009999",
        });
      }
      return json({ responseCode: "00", responseDesc: "Success" });
    };
    try {
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "k",
        sandbox: true,
        ...DISBURSE_CRED,
      } as any);
      const hasil = await client.disburse({
        bankCode: "014",
        bankAccount: "8760673566",
        amount: 50000,
        purpose: "Gaji",
      });

      expect(hasil.success).toBe(true);
      const inquiry = bodies.find((b) => b.amountTransfer !== undefined && b.disburseId === undefined);
      const transfer = bodies.find((b) => b.disburseId !== undefined);
      expect(inquiry).toBeDefined();
      expect(transfer).toBeDefined();
      expect(transfer.disburseId).toBe("777");
      // Field yang DOKU/Duitku tertera di inquiry wajib ikut transfer.
      expect(transfer.accountName).toBe("BUDI SANTOSO");
      expect(transfer.custRefNumber).toBe("000000009999");
      expect(transfer.userId).toBe(3551);
    } finally {
      globalThis.fetch = asli;
    }
  });
});

describe("Saldo nol adalah nilai sah, bukan data kosong", () => {
  it("checkBalance Duitku mengembalikan 0, bukan undefined", async () => {
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      json({ responseCode: "00", balance: 0, effectiveBalance: 0 });
    try {
      const client = new DuitkuClient({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "k",
        sandbox: true,
        ...DISBURSE_CRED,
      } as any);
      const hasil = await client.checkBalance();
      expect(hasil.success).toBe(true);
      expect(hasil.balance).toBe(0);
      expect(hasil.effectiveBalance).toBe(0);
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("checkBalance iPaymu mengembalikan 0, bukan undefined", async () => {
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async () =>
      json({ Status: 200, Success: true, Message: "Success", Data: { Va: "123", MerchantBalance: 0 } });
    try {
      const client = new IpaymuClient({ provider: "ipaymu", merchantCode: "123", apiKey: "k", sandbox: true });
      const hasil = await client.checkBalance();
      expect(hasil.success).toBe(true);
      expect(hasil.balance).toBe(0);
    } finally {
      globalThis.fetch = asli;
    }
  });
});

describe("DOKU Kirim DOKU memakai jalur SNAP resmi", () => {
  it("menolak payout sebelum jaringan bila Secret Key dipakai sebagai privateKey", async () => {
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async () => json({});
    try {
      const client = new DokuClient({
        provider: "doku",
        merchantCode: "BRN-1234",
        apiKey: "SK-simetris-bukan-rsa",
        sandbox: true,
      } as any);

      // Tanpa RSA private key, pesan harus menyebut kunci yang benar —
      // bukan melempar galat OpenSSL "NO_START_LINE" yang tidak menjelaskan apa pun.
      await expect(
        client.validateBankAccount({
          bankCode: "BCA",
          accountNumber: "888888888888",
          accountHolderName: "Probe Test",
          amount: 1000,
          customerNumber: "081234567890",
        })
      ).rejects.toThrow(/RSA private key/);
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("validateBankAccount menolak field wajib yang kurang, bukan mengarang sessionId", async () => {
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async () => json({});
    try {
      const client = new DokuClient({
        provider: "doku",
        merchantCode: "BRN-1234",
        apiKey: "SK",
        privateKey: RSA_TEST_KEY,
        sandbox: true,
      } as any);

      await expect(
        client.validateBankAccount({ bankCode: "BCA", accountNumber: "888888888888" })
      ).rejects.toThrow(/customerNumber/);
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("validateBankAccount DOKU gagal tertutup saat DOKU tidak mengembalikan sessionId", async () => {
    const asli = globalThis.fetch;
    (globalThis as any).fetch = async (url: any) => {
      if (String(url).includes("/authorization/v1/access-token/b2b")) {
        return json({ accessToken: "token-ujub", expiresIn: 900 });
      }
      // Respons 200 tanpa sessionId — versi lama membalas success: true.
      return json({ responseCode: "2002700", responseMessage: "Success" });
    };
    try {
      const buayar = new Buayar({
        provider: "doku",
        merchantCode: "BRN-1234",
        apiKey: "SK",
        privateKey: RSA_TEST_KEY,
        sandbox: true,
      } as any);
      const hasil = await buayar.validateBankAccount({
        bankCode: "BCA",
        accountNumber: "888888888888",
        accountHolderName: "Probe Test",
        amount: 1000,
        customerNumber: "081234567890",
      });
      expect(hasil.success).toBe(false);
      expect(hasil.error).toContain("sessionId");
      expect(hasil.accountHolderName).toBeUndefined();
    } finally {
      globalThis.fetch = asli;
    }
  });

  it("checkPayoutStatus DOKU menolak dengan pesan jelas, bukan menembak path yang tidak ada", async () => {
    const client = new DokuClient({ provider: "doku", merchantCode: "BRN-1234", apiKey: "SK", sandbox: true } as any);
    await expect(client.checkPayoutStatus("REF-1")).rejects.toThrow(/tidak menyediakan endpoint status/);
  });
});
