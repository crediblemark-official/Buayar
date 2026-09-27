import { describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { Buayar } from "../src";
import { verifyDuitkuCallbackSignature } from "../src/providers/duitku/signature";

describe("Duitku Provider & Client Integration", () => {
  it("should parse Direct VA and QRIS responses in Duitku Direct Inquiry", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      if (body.paymentMethod === "BC") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            merchantOrderId: body.merchantOrderId,
            reference: "DUITKU-REF-100",
            paymentUrl: "https://sandbox.duitku.com/payment/100",
            vaNumber: "123456789012",
            statusCode: "00",
            statusMessage: "SUCCESS",
          }),
        } as any;
      }
      if (body.paymentMethod === "SP") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            merchantOrderId: body.merchantOrderId,
            reference: "DUITKU-REF-200",
            qrString: "00020101021226590014ID.LINKAJA.WWW0118936009110000000001020300051020000000000005204581253033605802ID5911Merchant5802ID6007JAKARTA61051234562070703A0163041D3B",
            qrCodeUrl: "https://sandbox.duitku.com/qr/200.png",
            statusCode: "00",
            statusMessage: "SUCCESS",
          }),
        } as any;
      }
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "duitku-key",
        sandbox: true,
      });

      // 1. Direct VA
      const vaResponse = await buayar.createInvoice({
        orderId: "ORDER-DK-VA-001",
        amount: 100000,
        paymentMethod: "bca_va", // Canonical ID
        productDetails: "Top Up Game",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(vaResponse.success).toBe(true);
      expect(vaResponse.provider).toBe("duitku");
      expect(vaResponse.vaNumber).toBe("123456789012");
      expect(vaResponse.vaBank).toBe("bca");

      // 2. Direct QRIS
      const qrisResponse = await buayar.createInvoice({
        orderId: "ORDER-DK-QR-001",
        amount: 50000,
        paymentMethod: "qris", // Canonical ID
        productDetails: "Kopi",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(qrisResponse.success).toBe(true);
      expect(qrisResponse.qrString).toContain("00020101021226590014ID");
      expect(qrisResponse.qrCodeUrl).toBe("https://sandbox.duitku.com/qr/200.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should check disbursement balance and run the two-step inquiry/transfer Duitku flow", async () => {
    const dipanggil: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      dipanggil.push({ url, body });
      if (url.includes("/api/disbursement/checkbalance")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            userId: 3551,
            balance: 15000000,
            effectiveBalance: 14900000,
            responseCode: "00",
            responseDesc: "Success",
          }),
        } as any;
      }
      if (url.includes("/api/disbursement/inquirysandbox")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            accountName: "BUDI SANTOSO",
            custRefNumber: "000000001278",
            disburseId: 12345,
            responseCode: "00",
            responseDesc: "Success",
          }),
        } as any;
      }
      if (url.includes("/api/disbursement/transfersandbox")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            custRefNumber: "000000001278",
            responseCode: "00",
            responseDesc: "Success",
          }),
        } as any;
      }
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "duitku-key",
        sandbox: true,
        disbursementUserId: 3551,
        disbursementEmail: "merchant@contoh.id",
        disbursementSecretKey: "a".repeat(64),
      });

      const duitkuClient = buayar.getDuitkuClient();
      const balanceResult = await duitkuClient.checkBalance();
      expect(balanceResult.success).toBe(true);
      expect(balanceResult.balance).toBe(15000000);
      expect(balanceResult.effectiveBalance).toBe(14900000);

      const inquiryResult = await duitkuClient.inquiryBankAccount({
        bankCode: "014",
        bankAccount: "8760673566",
        amount: 50000,
      });
      expect(inquiryResult.disburseId).toBe("12345");
      expect(inquiryResult.accountHolderName).toBe("BUDI SANTOSO");

      // Alur dua langkah: transfer harus menyusul inquiry dan memakai
      // disburseId yang dikembalikan inquiry.
      const transfer = await duitkuClient.disburse({
        bankCode: "014",
        bankAccount: "8760673566",
        amount: 50000,
        purpose: "Gaji",
      });
      expect(transfer.success).toBe(true);
      expect(transfer.step).toBe("transfer");

      const transferCall = dipanggil.find((c) => c.url.includes("transfersandbox"));
      expect(transferCall).toBeDefined();
      expect(transferCall!.body.disburseId).toBe("12345");
      expect(transferCall!.body.accountName).toBe("BUDI SANTOSO");
      expect(transferCall!.body.custRefNumber).toBe("000000001278");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should send the documented customerVaName/customerDetail (and itemDetails) on Direct Inquiry", async () => {
    // Regresi convention: Request Transaction Duitku menandai `customerVaName`
    // sebagai WAJIB, dan metode credit (mis. Indodana Paylater/DN) menolak
    // permintaan dengan HTTP 400 tanpa `customerDetail`.
    let captured: any = null;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      captured = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ reference: "REF", paymentUrl: "https://x/y", statusCode: "00", statusMessage: "SUCCESS" }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "duitku",
        merchantCode: "D1234",
        apiKey: "duitku-key",
        sandbox: true,
      });

      await buayar.createInvoice({
        orderId: "ORDER-DK-CUST-001",
        amount: 50000,
        paymentMethod: "indodana", // Canonical Paylater → kode Duitku DN
        productDetails: "Sepatu",
        customer: { name: "Budi Santoso", email: "budi@mail.com", phone: "081234567890" },
        items: [{ name: "Sepatu", price: 50000, quantity: 1 }],
      });

      expect(captured.paymentMethod).toBe("DN");
      expect(captured.customerVaName).toBe("Budi Santoso");
      expect(captured.customerDetail).toEqual({
        firstName: "Budi Santoso",
        lastName: "",
        email: "budi@mail.com",
        phoneNumber: "081234567890",
        // Wajib secara efektif untuk metode credit (Indodana/DN).
        billingAddress: { firstName: "Budi Santoso", lastName: "", phone: "081234567890" },
      });
      expect(captured.itemDetails).toEqual([{ name: "Sepatu", price: 50000, quantity: 1 }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Duitku callback signature — HMAC-SHA256 (resmi) + legacy MD5", () => {
  const apiKey = "duitku-key";
  const base = { merchantCode: "D1234", amount: "50000", merchantOrderId: "ORDER-SIG-1" };
  const stringToSign = base.merchantCode + base.amount + base.merchantOrderId;

  it("menerima skema resmi HMAC-SHA256", () => {
    const signature = createHmac("sha256", apiKey).update(stringToSign).digest("hex");
    expect(verifyDuitkuCallbackSignature({ ...base, signature }, apiKey)).toBe(true);
  });

  it("tetap menerima skema lama MD5 selama transisi", () => {
    const signature = createHash("md5").update(stringToSign + apiKey).digest("hex");
    expect(verifyDuitkuCallbackSignature({ ...base, signature }, apiKey)).toBe(true);
  });

  it("menolak signature palsu, payload yang diubah, signature kosong, dan apiKey kosong", () => {
    const signature = createHmac("sha256", apiKey).update(stringToSign).digest("hex");
    expect(verifyDuitkuCallbackSignature({ ...base, signature: "deadbeef" }, apiKey)).toBe(false);
    expect(verifyDuitkuCallbackSignature({ ...base, signature, amount: "99999" }, apiKey)).toBe(false);
    expect(verifyDuitkuCallbackSignature({ ...base, signature: "" }, apiKey)).toBe(false);
    expect(verifyDuitkuCallbackSignature({ ...base, signature }, "")).toBe(false);
  });
});
