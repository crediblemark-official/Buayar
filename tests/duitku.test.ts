import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";

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

  it("should check merchant balance and inquiry bank account via DuitkuClient", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      if (url.includes("checkBalance")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            responseCode: "00",
            responseMessage: "SUCCESS",
            balance: "15000000",
          }),
        } as any;
      }
      if (url.includes("inquiry")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            responseCode: "00",
            accountName: "BUDI SANTOSO",
            bankCode: "BCA",
            bankAccount: "1234567890",
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

      const duitkuClient = buayar.getDuitkuClient();
      const balanceResult = await duitkuClient.checkBalance();
      expect(balanceResult.success).toBe(true);
      expect(balanceResult.balance).toBe(15000000);

      const inquiryResult = await duitkuClient.inquiryBankAccount("BCA", "1234567890");
      expect(inquiryResult.accountName).toBe("BUDI SANTOSO");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
