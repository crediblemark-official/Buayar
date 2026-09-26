import { describe, expect, it } from "bun:test";

/**
 * Client ID dummy untuk test — BUKAN kredensial asli.
 *
 * Nilai ini sebelumnya tertanam langsung sebagai literal dan ikut ter-commit ke
 * repo publik. Sekarang diganti placeholder yang jelas jelas bukan kredensial,
 * sehingga tidak mungkin tertukar dengan nilai sandbox sungguhan.
 */
const DOKU_TEST_MERCHANT_CODE = "BRN-0000-0000000000000";
import crypto from "crypto";
import { Buayar } from "../src";
import { MIDTRANS_PROBE_PAYLOADS, hintMidtransProbeError } from "../src/providers/midtrans/methods";
import {
  CANONICAL_TO_MIDTRANS_SNAP,
  toMidtransSnapEnabledPayment,
} from "../src/providers/midtrans/charge";
import { formatIpaymuTimestamp } from "../src/providers/ipaymu/signature";
import { CANONICAL_TO_DOKU } from "../src/core/canonical";
import {
  DOKU_MCP_ONLY_VA_CHANNELS,
  mapDokuMcpChannelCode,
  mapDokuMcpCategory,
  parseDokuMcpChannels,
} from "../src/providers/doku/mcp";
import { XenditProvider } from "../src/providers/xendit/provider";
import {
  MIDTRANS_SNAP_DOMAINS,
  MIDTRANS_SNAP_PATHS,
  generateSnapAsymmetricSignature,
  generateSnapSymmetricSignature,
  mapMidtransSnapStatus,
  verifyMidtransSnapNotificationSignature,
} from "../src";

/**
 * Regression tests yang mengunci perbaikan fidelity terhadap dokumentasi resmi
 * payment gateway. Lihat docs/REVIEW-PG-FIDELITY.md untuk rujukan lengkap.
 */

// ─── Midtrans ────────────────────────────────────────────────────────────────

describe("Midtrans — fidelity vs dokumentasi resmi", () => {
  it("memetakan kode kanonikal ke nilai enabled_payments Snap yang sah (M-1)", () => {
    expect(CANONICAL_TO_MIDTRANS_SNAP.qris).toBe("other_qris");
    expect(CANONICAL_TO_MIDTRANS_SNAP.mandiri_va).toBe("echannel");
    expect(CANONICAL_TO_MIDTRANS_SNAP.gopay_qris).toBe("gopay");
    expect(CANONICAL_TO_MIDTRANS_SNAP.shopeepay_qris).toBe("shopeepay");
    expect(toMidtransSnapEnabledPayment("QRIS")).toBe("other_qris");
    expect(toMidtransSnapEnabledPayment("mandiri_va")).toBe("echannel");
    // Kode kanonikal yang memang identik tetap lolos apa adanya.
    expect(toMidtransSnapEnabledPayment("bca_va")).toBe("bca_va");
  });

  it("memakai payment_type bank_transfer untuk probe Permata (M-3)", () => {
    const permata = MIDTRANS_PROBE_PAYLOADS.permata;
    expect(permata.payment_type).toBe("bank_transfer");
    expect(permata.bank_transfer.bank).toBe("permata");
    expect(MIDTRANS_PROBE_PAYLOADS.permata.payment_type).not.toBe("permata");
  });

  it("memakai acquirer 'airpay shopee' untuk QRIS ShopeePay (M-2)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status_code: "201",
            status_message: "QRIS transaction is created",
            transaction_id: "mid-trx-1",
            order_id: capturedBody.transaction_details.order_id,
            gross_amount: "50000.00",
            payment_type: "qris",
            actions: [{ name: "generate-qr-code", url: "https://api.midtrans.com/v2/qris/1/qr-code" }],
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-test" });
      const res = await buayar.createInvoice({
        orderId: "ORDER-QRIS-SHOPEE",
        amount: 50000,
        paymentMethod: "shopeepay_qris",
        productDetails: "Kopi",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(res.success).toBe(true);
      expect(capturedBody.payment_type).toBe("qris");
      expect(capturedBody.qris.acquirer).toBe("airpay shopee");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("omit phone kosong di customer_details Core API (M-4)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status_code: "201",
            transaction_id: "mid-trx-2",
            order_id: capturedBody.transaction_details.order_id,
            payment_type: "bank_transfer",
            va_numbers: [{ bank: "bca", va_number: "123" }],
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-test" });
      await buayar.createInvoice({
        orderId: "ORDER-NOPHONE",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Test",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(capturedBody.customer_details.phone).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── iPaymu ──────────────────────────────────────────────────────────────────

describe("iPaymu — fidelity vs dokumentasi resmi", () => {
  it("memformat timestamp sebagai YYYYMMDDHHmmss WIB (I-1)", () => {
    const ts = formatIpaymuTimestamp(new Date("2026-09-25T03:04:05.000Z"));
    expect(ts).toMatch(/^\d{14}$/);
    // 03:04:05 UTC → 10:04:05 WIB
    expect(ts).toBe("20260925100405");
  });

  it("mengirim header timestamp 14 digit, bukan epoch ms (I-1)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            Status: 200,
            Message: "Success",
            Data: { TransactionId: 1, PaymentNo: "123", Total: 10000 },
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });
      await buayar.createInvoice({
        orderId: "ORDER-IPAYMU-TS",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Test",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
      });
      expect(capturedHeaders.timestamp).toMatch(/^\d{14}$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("tidak mengirim expired untuk BCA VA dan meng-clamp BRI VA ke 2 jam (I-2)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            Status: 200,
            Message: "Success",
            Data: { TransactionId: 1, PaymentNo: "123", Total: 10000 },
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });

      await buayar.createInvoice({
        orderId: "ORDER-BCA",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Test",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
        extra: { expiredHours: 24 },
      });
      // BCA VA tidak bisa dikustom → expired harus di-omit.
      expect(capturedBody.expired).toBeUndefined();

      await buayar.createInvoice({
        orderId: "ORDER-BRI",
        amount: 10000,
        paymentMethod: "bri_va",
        productDetails: "Test",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
        extra: { expiredHours: 24 },
      });
      // BRI VA maks 2 jam → di-clamp.
      expect(capturedBody.expired).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("mengirim successUrl/cancelUrl untuk channel redirect CC (I-3)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            Status: 200,
            Message: "Success",
            Data: { TransactionId: 1, PaymentNo: "123", Url: "https://my.ipaymu.com/payment/1" },
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({
        provider: "ipaymu",
        merchantCode: "0000001411234567",
        apiKey: "test-api-key",
        sandbox: true,
      });
      await buayar.createInvoice({
        orderId: "ORDER-CC",
        amount: 10000,
        paymentMethod: "credit_card",
        productDetails: "Test",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081234567890" },
        returnUrl: "https://myapp.com/return",
      });
      expect(capturedBody.successUrl).toBe("https://myapp.com/return");
      expect(capturedBody.cancelUrl).toBe("https://myapp.com/return");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── DOKU ────────────────────────────────────────────────────────────────────

describe("DOKU — fidelity vs dokumentasi resmi", () => {
  function dokuBuayar() {
    return new Buayar({
      provider: "doku",
      merchantCode: "MALL-ID-123456",
      apiKey: "SK-secret-key-789",
      sandbox: true,
    });
  }

  it("memakai endpoint & body cstore non-SNAP yang benar (D-1/D-2)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: any = null;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            order: { invoice_number: capturedBody.order.invoice_number },
            online_to_offline_info: {
              payment_code: "8888888844445555",
              how_to_pay_page: "https://sandbox.doku.com/indomaret-online-to-offline/v2/how-to-pay-page/8888",
              expired_date: "20260624151049",
            },
          }),
      } as any;
    };

    try {
      const res = await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-INDO",
        amount: 150000,
        paymentMethod: "indomaret",
        productDetails: "Voucher",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(capturedUrl).toContain("/indomaret-online-to-offline/v2/payment-code");
      expect(capturedBody.online_to_offline_info).toBeDefined();
      expect(capturedBody.online_to_offline_info.reusable_status).toBe(false);
      expect(capturedBody.online_info).toBeUndefined();
      expect(res.paymentCode).toBe("8888888844445555");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("memakai endpoint alfamart non-SNAP yang benar (D-1)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            order: { invoice_number: body.order.invoice_number },
            online_to_offline_info: { payment_code: "6059000000000205" },
          }),
      } as any;
    };

    try {
      await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-ALFA",
        amount: 150000,
        paymentMethod: "alfamart",
        productDetails: "Voucher",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(capturedUrl).toContain("/alfa-online-to-offline/v2/payment-code");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("memakai endpoint & payload OVO Push Payment non-SNAP (D-3)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: any = null;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            client: { id: "MALL-ID-123456" },
            order: { invoice_number: capturedBody.order.invoice_number, amount: capturedBody.order.amount },
            ovo_info: { ovo_id: capturedBody.ovo_info.ovo_id, ovo_account_name: "Budi" },
            ovo_payment: { status: "SUCCESS", reference_number: 38 },
          }),
      } as any;
    };

    try {
      const res = await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-OVO",
        amount: 10000,
        paymentMethod: "ovo",
        productDetails: "Topup OVO",
        customer: { name: "Budi", email: "budi@mail.com", phone: "081211111111" },
      });

      expect(capturedUrl).toContain("/ovo-emoney/v1/payment");
      expect(capturedBody.client.id).toBe("MALL-ID-123456");
      expect(capturedBody.ovo_info.ovo_id).toBe("081211111111");
      expect(capturedBody.security.check_sum).toBe(
        crypto.createHash("sha256").update("10000MALL-ID-123456ORDER-DOKU-OVO081211111111SK-secret-key-789").digest("hex")
      );
      expect(res.success).toBe(true);
      expect(res.mode).toBe("ewallet");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("menolak OVO tanpa nomor telepon (D-3)", async () => {
    const res = await dokuBuayar().createInvoice({
      orderId: "ORDER-DOKU-OVO-NOPHONE",
      amount: 10000,
      paymentMethod: "ovo",
      productDetails: "Topup OVO",
      customer: { name: "Budi", email: "budi@mail.com" },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("customer.phone");
  });

  it("menolak DANA tanpa SNAP dengan pesan yang jelas (SNAP-only) (D-4)", async () => {
    const res = await dokuBuayar().createInvoice({
      orderId: "ORDER-DOKU-DANA",
      amount: 10000,
      paymentMethod: "dana",
      productDetails: "Topup DANA",
      customer: { name: "Budi", email: "budi@mail.com", phone: "081211111111" },
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("SNAP");
  });
});

// ─── Midtrans BI-SNAP Core API ────────────────────────────────────────────────
//
// Referensi: https://docs.midtrans.com/reference/core-api-snap-open-api-overview
//            https://docs.midtrans.com/reference/signature-generation
//            https://docs.midtrans.com/reference/mpm-api-qris

/**
 * Keypair RSA sekali pakai untuk seluruh test SNAP. Dipakai sebagai kredensial
 * merchant maupun sebagai "Midtrans public key" saat memverifikasi notifikasi.
 */
const SNAP_RSA_KEYS = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const SNAP_CLIENT_SECRET = "snap-client-secret";

/** Bangun config Midtrans dengan kredensial BI-SNAP terisi. */
function snapConfig(extra: Record<string, any> = {}) {
  return {
    provider: "midtrans",
    apiKey: "SB-Mid-server-test",
    sandbox: true,
    extra: {
      snap: true,
      snapClientId: "SNAP-CLIENT-DEFAULT",
      snapClientSecret: SNAP_CLIENT_SECRET,
      snapPartnerId: "G812345678",
      snapPrivateKey: SNAP_RSA_KEYS.privateKey,
      snapMerchantId: "M001234",
      snapPartnerServiceId: "1234",
      snapCustomerNo: "0000000000",
      ...extra,
    },
  } as any;
}

/** Hitung ulang signature transaksi SNAP langsung dari rumus dokumen ASPI. */
function expectedSnapTransactionSignature(opts: {
  path: string;
  accessToken: string;
  timestamp: string;
  rawBody?: string;
  body?: any;
  clientSecret?: string;
  method?: string;
}): string {
  const serialized =
    opts.rawBody !== undefined ? opts.rawBody : opts.body === undefined ? "" : JSON.stringify(opts.body);
  const hashed = crypto.createHash("sha256").update(serialized).digest("hex").toLowerCase();
  const stringToSign = `${opts.method || "POST"}:${opts.path}:${opts.accessToken}:${hashed}:${opts.timestamp}`;
  return crypto.createHmac("sha512", opts.clientSecret || SNAP_CLIENT_SECRET).update(stringToSign).digest("base64");
}

/** Stub `fetch` yang melayani access token + satu respons transaksi. */
function stubSnapFetch(transactionPayload: (body: any) => any) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Record<string, string>; body: any; rawBody?: string }> = [];

  (globalThis as any).fetch = async (url: any, options: any) => {
    const rawBody = options?.body;
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    calls.push({ url: String(url), headers: options?.headers || {}, body, rawBody });

    const payload = String(url).includes(MIDTRANS_SNAP_PATHS.accessToken)
      ? {
          responseCode: "2007300",
          responseMessage: "Successful",
          accessToken: "snap-access-token",
          tokenType: "Bearer",
          expiresIn: "900",
        }
      : transactionPayload(body);

    return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as any;
  };

  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

describe("DOKU — verifikasi live per-channel (2026-09-26)", () => {
  function dokuBuayar() {
    return new Buayar({
      provider: "doku",
      merchantCode: "MALL-ID-123456",
      apiKey: "SK-secret-key-789",
      sandbox: true,
    });
  }

  it("memakai channel-name 'bsm-virtual-account' untuk BSI (D-8)", () => {
    expect(CANONICAL_TO_DOKU.bsi_va.endpoint).toBe("/bsm-virtual-account/v2/payment-code");
  });

  it("menandai QRIS DOKU sebagai SNAP-only (tidak ada di Jokul Direct) (D-9)", async () => {
    expect(CANONICAL_TO_DOKU.qris.snapOnly).toBe(true);

    let fetched = false;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };
    try {
      const res = await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-QRIS",
        amount: 15000,
        paymentMethod: "qris",
        productDetails: "Voucher",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("SNAP");
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("memakai ref_info (bukan info1) untuk Permata VA (D-10)", async () => {
    let capturedBody: any = null;
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            order: { invoice_number: capturedBody.order.invoice_number },
            virtual_account_info: {
              virtual_account_number: "8124600000119744",
              expired_date: "20260926010829",
            },
          }),
      } as any;
    };
    try {
      const res = await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-PERMATA",
        amount: 10000,
        paymentMethod: "permata_va",
        productDetails: "Voucher Game",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(capturedUrl).toContain("/permata-virtual-account/v2/payment-code");
      expect(capturedBody.virtual_account_info.info1).toBeUndefined();
      expect(capturedBody.virtual_account_info.ref_info).toEqual([{ ref_name: "Info", ref_value: "Voucher Game" }]);
      expect(res.success).toBe(true);
      expect(res.vaBank).toBe("permata");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("menghasilkan merchant_unique_reference BNI alfanumerik <=13 & unik per request (D-11)", async () => {
    const captured: any[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      captured.push(body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            order: { invoice_number: body.order.invoice_number },
            virtual_account_info: { virtual_account_number: "8803300000115021" },
          }),
      } as any;
    };
    try {
      const b = dokuBuayar();
      for (const id of ["ORDER-BNI-A", "ORDER-BNI-B"]) {
        await b.createInvoice({
          orderId: id,
          amount: 10000,
          paymentMethod: "bni_va",
          productDetails: "Voucher",
          customer: { name: "Budi", email: "budi@mail.com" },
        });
      }
      const refs = captured.map((c) => c.virtual_account_info.merchant_unique_reference);
      for (const r of refs) {
        expect(String(r)).toMatch(/^[A-Za-z0-9]{1,13}$/);
      }
      expect(refs[0]).not.toBe(refs[1]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("memetakan endpoint non-SNAP DOKU VA & Maybank VA yang diverifikasi live (D-13)", () => {
    expect(CANONICAL_TO_DOKU.doku_va.endpoint).toBe("/doku-virtual-account/v2/payment-code");
    expect(CANONICAL_TO_DOKU.doku_va.bank).toBe("doku");
    expect(CANONICAL_TO_DOKU.maybank_va.endpoint).toBe("/maybank-virtual-account/v2/payment-code");
    expect(CANONICAL_TO_DOKU.maybank_va.bank).toBe("maybank");
  });

  it("memetakan kode channel MCP DOKU ke kanonikal, termasuk VA bank baru (D-14)", () => {
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BCA")).toBe("bca_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BANK_MANDIRI")).toBe("mandiri_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BSI")).toBe("bsi_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BTN")).toBe("btn_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BANK_BJB")).toBe("bjb_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BPD_BALI")).toBe("bpd_bali_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_SINARMAS")).toBe("sinarmas_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BANK_OCBC")).toBe("ocbc_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BNC")).toBe("bnc_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BSS")).toBe("bss_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_DOKU")).toBe("doku_va");
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_MAYBANK")).toBe("maybank_va");
    expect(mapDokuMcpChannelCode("ONLINE_TO_OFFLINE_INDOMARET")).toBe("indomaret");
    expect(mapDokuMcpChannelCode("QRIS")).toBe("qris");
    // Fallback pola bank yang belum dipetakan eksplisit.
    expect(mapDokuMcpChannelCode("VIRTUAL_ACCOUNT_BANK_NEO")).toBe("neo_va");
  });

  it("mengklasifikasikan kategori MCP DOKU ke kategori kanonikal", () => {
    expect(mapDokuMcpCategory("Virtual Account")).toBe("Virtual Account");
    expect(mapDokuMcpCategory("QR Code / QRIS")).toBe("QRIS");
    expect(mapDokuMcpCategory("E-Wallet / E-Money")).toBe("E-Wallet");
    expect(mapDokuMcpCategory("Online to Offline / Store")).toBe("Retail / Gerai");
    expect(mapDokuMcpCategory("Credit Card")).toBe("Kartu Kredit");
    expect(mapDokuMcpCategory("Paylater")).toBe("Paylater / Cicilan");
  });

  it("mem-parse payload get_merchant_payment_methods dari MCP DOKU", () => {
    const parsed = parseDokuMcpChannels({
      totalChannels: 3,
      totalCategories: 2,
      categories: {
        "Virtual Account": ["VIRTUAL_ACCOUNT_BCA", "VIRTUAL_ACCOUNT_BTN"],
        QRIS: ["QRIS"],
      },
    });
    const byCanonical = Object.fromEntries(parsed.map((c) => [c.canonical, c]));
    expect(parsed).toHaveLength(3);
    expect(byCanonical.bca_va.code).toBe("VIRTUAL_ACCOUNT_BCA");
    expect(byCanonical.bca_va.category).toBe("Virtual Account");
    expect(byCanonical.btn_va.category).toBe("Virtual Account");
    expect(byCanonical.qris.category).toBe("QRIS");
  });

  it("mengambil daftar channel DOKU dari MCP sebagai sumber LIVE (D-15)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: any = null;
    let calls = 0;
    (globalThis as any).fetch = async (url: any, options: any) => {
      calls += 1;
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  totalChannels: 8,
                  totalCategories: 3,
                  categories: {
                    "Virtual Account": [
                      "VIRTUAL_ACCOUNT_BCA",
                      "VIRTUAL_ACCOUNT_BTN",
                      "VIRTUAL_ACCOUNT_BPD_BALI",
                      "VIRTUAL_ACCOUNT_DOKU",
                      "VIRTUAL_ACCOUNT_MAYBANK",
                    ],
                    QRIS: ["QRIS"],
                    "E-Wallet": ["EMONEY_OVO", "EMONEY_DANA"],
                  },
                }),
              },
            ],
          },
        }),
      } as any;
    };

    try {
      const b = new Buayar({
        provider: "doku",
        merchantCode: DOKU_TEST_MERCHANT_CODE,
        apiKey: "SK-secret-key",
        sandbox: true,
        extra: { mcpApiKey: "doku_key_sandbox_test" },
      });

      const res = await b.getPaymentMethods({ amount: 10000 });
      expect(res.success).toBe(true);
      const raw: any = res.rawResponse;
      expect(raw.source).toBe("mcp");

      const codes = res.methods.map((m) => m.paymentMethod);
      for (const expected of ["bca_va", "btn_va", "bpd_bali_va", "doku_va", "maybank_va", "qris", "ovo", "dana"]) {
        expect(codes).toContain(expected);
      }
      expect(res.categories?.["Virtual Account"]).toHaveLength(5);

      // Panggilan JSON-RPC MCP harus tepat.
      expect(capturedUrl).toContain("/doku-mcp-server/mcp");
      expect(capturedBody.method).toBe("tools/call");
      expect(capturedBody.params.name).toBe("get_merchant_payment_methods");

      // probePaymentMethods harus melaporkan sumber LIVE bila MCP berhasil.
      const probe = await b.probePaymentMethods();
      expect(probe.source).toBe("live");
      expect(probe.enabled).toContain("btn_va");
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("jatuh ke katalog statis (source 'static') bila MCP tidak dikonfigurasi", async () => {
    const b = new Buayar({
      provider: "doku",
      merchantCode: DOKU_TEST_MERCHANT_CODE,
      apiKey: "SK-secret-key",
      sandbox: true,
      // Paksa tanpa kredensial MCP (mengalahkan env DOKU_API_KEY bila ada).
      extra: { mcpApiKey: "" },
    });

    const probe = await b.probePaymentMethods();
    expect(probe.source).toBe("static");

    const res = await b.getPaymentMethods({ amount: 10000 });
    const raw: any = res.rawResponse;
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.source).toBeUndefined();
    expect(res.methods.map((m) => m.paymentMethod)).toContain("bca_va");
  });

  it("jatuh ke katalog statis bila panggilan MCP gagal", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      return { ok: false, status: 502, json: async () => ({}) } as any;
    };
    try {
      const b = new Buayar({
        provider: "doku",
        merchantCode: DOKU_TEST_MERCHANT_CODE,
        apiKey: "SK-secret-key",
        sandbox: true,
        extra: { mcpApiKey: "doku_key_sandbox_test" },
      });
      const res = await b.getPaymentMethods({ amount: 10000 });
      const raw: any = res.rawResponse;
      expect(Array.isArray(raw)).toBe(true);

      const probe = await b.probePaymentMethods();
      expect(probe.source).toBe("static");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("menandai BTN/BJB/BPD Bali/Sinarmas/OCBC/BNC/BSS sebagai mcpOnly tanpa endpoint REST (D-16)", () => {
    const mcpOnlyBanks = ["btn_va", "bjb_va", "bpd_bali_va", "sinarmas_va", "ocbc_va", "bnc_va", "bss_va"];
    for (const m of mcpOnlyBanks) {
      expect(CANONICAL_TO_DOKU[m]?.mcpOnly).toBe(true);
      expect(CANONICAL_TO_DOKU[m]?.endpoint).toBe("");
      expect(DOKU_MCP_ONLY_VA_CHANNELS[m]).toBeTruthy();
    }
    // Kode channel MCP resmi untuk parameter `channel`.
    expect(DOKU_MCP_ONLY_VA_CHANNELS.btn_va).toBe("VIRTUAL_ACCOUNT_BTN");
    expect(DOKU_MCP_ONLY_VA_CHANNELS.bjb_va).toBe("VIRTUAL_ACCOUNT_BANK_BJB");
    expect(DOKU_MCP_ONLY_VA_CHANNELS.bpd_bali_va).toBe("VIRTUAL_ACCOUNT_BPD_BALI");
    // Kanal REST yang sah TIDAK boleh ditandai mcpOnly.
    expect(CANONICAL_TO_DOKU.bca_va.mcpOnly).toBeFalsy();
    expect(CANONICAL_TO_DOKU.doku_va.mcpOnly).toBeFalsy();
  });

  it("menolak createInvoice kanal mcpOnly tanpa kredensial MCP, tanpa fetch REST (D-16)", async () => {
    let fetched = false;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };
    try {
      const res = await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-BTN-NOMCP",
        amount: 10000,
        paymentMethod: "btn_va",
        productDetails: "Voucher",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("MCP");
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("menerbitkan VA BTN via MCP create_virtual_account_payment (D-16)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedBody: any = null;
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  responseCode: "2002700",
                  responseMessage: "Successful",
                  virtualAccountData: {
                    partnerServiceId: "   95962",
                    virtualAccountNo: "   9596260000000043838",
                    trxId: capturedBody.params.arguments.toolRequest.trxId,
                    totalAmount: { value: "10000.00", currency: "IDR" },
                    expiredDate: "2026-09-26T14:44:19+07:00",
                    additionalInfo: {
                      howToPayPage: "https://sandbox.doku.com/how-to-pay-v2/virtual-account/btn/9596260000000043838/x",
                    },
                  },
                }),
              },
            ],
          },
        }),
      } as any;
    };
    try {
      const res = await new Buayar({
        provider: "doku",
        merchantCode: DOKU_TEST_MERCHANT_CODE,
        apiKey: "SK-secret-key",
        sandbox: true,
        extra: { mcpApiKey: "doku_key_sandbox_test" },
      }).createInvoice({
        orderId: "ORDER-DOKU-BTN-1",
        amount: 10000,
        paymentMethod: "btn_va",
        productDetails: "Voucher",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(res.success).toBe(true);
      expect(res.vaNumber).toBe("9596260000000043838");
      expect(res.vaBank).toBe("btn");
      expect(res.paymentUrl).toContain("/btn/");
      // Panggilan JSON-RPC MCP yang benar.
      expect(capturedUrl).toContain("/doku-mcp-server/mcp");
      expect(capturedBody.params.name).toBe("create_virtual_account_payment");
      expect(capturedBody.params.arguments.toolRequest.channel).toBe("VIRTUAL_ACCOUNT_BTN");
      expect(capturedBody.params.arguments.toolRequest.amount).toBe("10000.00");
      expect(capturedBody.params.arguments.toolRequest.trxId).toBe("ORDER-DOKU-BTN-1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("merutekan update/delete VA kanal mcpOnly ke tool MCP (D-16)", async () => {
    const originalFetch = globalThis.fetch;
    const calls: any[] = [];
    (globalThis as any).fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      calls.push({ url: String(url), body });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  responseCode: "2002700",
                  responseMessage: "Successful",
                  virtualAccountData: {
                    virtualAccountNo: "   9596260000000043838",
                    trxId: body.params.arguments.toolRequest.trxId,
                    expiredDate: "2026-09-27T14:44:19+07:00",
                  },
                }),
              },
            ],
          },
        }),
      } as any;
    };
    try {
      const b = new Buayar({
        provider: "doku",
        merchantCode: DOKU_TEST_MERCHANT_CODE,
        apiKey: "SK-secret-key",
        sandbox: true,
        extra: { mcpApiKey: "doku_key_sandbox_test" },
      });

      const upd = await b.updateVirtualAccount({
        orderId: "ORDER-DOKU-BTN-1",
        bank: "btn",
        vaNumber: "9596260000000043838",
        amount: 20000,
      });
      expect(upd.success).toBe(true);
      expect(upd.vaNumber).toBe("9596260000000043838");
      expect(calls[0].body.params.name).toBe("update_virtual_account_payment");
      expect(calls[0].body.params.arguments.toolRequest.channel).toBe("VIRTUAL_ACCOUNT_BTN");
      expect(calls[0].body.params.arguments.toolRequest.totalAmount).toBe("20000");

      const del = await b.deleteVirtualAccount({
        orderId: "ORDER-DOKU-BJB-1",
        bank: "bjb",
        vaNumber: "12000000000000000685",
      });
      expect(del.success).toBe(true);
      expect(calls[1].body.params.name).toBe("delete_virtual_account_payment");
      expect(calls[1].body.params.arguments.toolRequest.channel).toBe("VIRTUAL_ACCOUNT_BANK_BJB");
      // Tidak ada panggilan REST ke endpoint per-bank.
      expect(calls.every((c) => c.url.includes("doku-mcp-server/mcp"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("menerima notifikasi SNAP VA dengan signature HMAC valid & status PAID (D-17)", async () => {
    const b = new Buayar({
      provider: "doku",
      merchantCode: DOKU_TEST_MERCHANT_CODE,
      apiKey: "SK-secret-key-789",
      sandbox: true,
      extra: { snap: true, notificationPath: "/payments/notifications" },
    });
    // Bentuk notifikasi pembayaran VA SNAP DOKU — sama untuk seluruh 17 bank VA,
    // termasuk 7 kanal mcpOnly (BTN/BJB/BPD Bali/Sinarmas/OCBC/BNC/BSS via MCP).
    const body = {
      partnerServiceId: "   95962",
      customerNo: "60000000043838",
      virtualAccountNo: "   9596260000000043838",
      virtualAccountName: "Budi Santoso",
      trxId: "ORDER-DOKU-BTN-PAID",
      paymentRequestId: "12839218738127830",
      paidAmount: { value: "10000.00", currency: "IDR" },
    };
    const rawBody = JSON.stringify(body);
    const timestamp = "2026-09-26T09:00:00.000Z";
    // stringToSign = POST:/payments/notifications::sha256(rawBody):timestamp (AccessToken kosong)
    const signature = generateSnapSymmetricSignature(
      "SK-secret-key-789",
      "POST",
      "/payments/notifications",
      "",
      rawBody,
      timestamp
    );
    const res = await b.verifyWebhook(
      body,
      { "X-TIMESTAMP": timestamp, "X-SIGNATURE": signature },
      { rawBody }
    );
    expect(res.isValid).toBe(true);
    expect(res.isPaid).toBe(true);
    expect(res.orderId).toBe("ORDER-DOKU-BTN-PAID");
    expect(res.amount).toBe(10000);
    expect(res.status).toBe("paid");
  });

  it("menolak notifikasi SNAP VA dengan signature palsu (D-17)", async () => {
    const b = new Buayar({
      provider: "doku",
      merchantCode: DOKU_TEST_MERCHANT_CODE,
      apiKey: "SK-secret-key-789",
      sandbox: true,
      extra: { snap: true },
    });
    const body = {
      virtualAccountNo: "   9596260000000043838",
      trxId: "ORDER-DOKU-BTN-FAKE",
      paidAmount: { value: "10000.00", currency: "IDR" },
    };
    const res = await b.verifyWebhook(body, {
      "X-TIMESTAMP": "2026-09-26T09:00:00.000Z",
      "X-SIGNATURE": "deadbeef".repeat(16),
    }, { rawBody: JSON.stringify(body) });
    expect(res.isValid).toBe(false);
    expect(res.isPaid).toBe(false);
    expect(res.status).toBe("failed");
  });

  it("mem-parse notifikasi non-SNAP VA tanpa signature sebagai gagal-verifikasi namun tetap aman (D-17)", async () => {
    // Format notifikasi non-SNAP DOKU ( agregator VA terpadu mengikuti skema ini
    // bila channel dikonfigurasi non-SNAP): transaction.status = SUCCESS.
    const b = dokuBuayar();
    const body = {
      service: { id: "VIRTUAL_ACCOUNT" },
      acquirer: { id: "BTN" },
      channel: { id: "VIRTUAL_ACCOUNT_BTN" },
      transaction: { status: "SUCCESS", date: "2026-09-26T09:00:00Z" },
      order: { invoice_number: "ORDER-DOKU-BTN-NOSNAP", amount: 10000 },
      virtual_account_info: { virtual_account_number: "9596260000000043838" },
    };
    // Tanpa signature header → fail-closed (isValid false, isPaid false).
    const res = await b.verifyWebhook(body, {}, { rawBody: JSON.stringify(body) });
    expect(res.isValid).toBe(false);
    expect(res.isPaid).toBe(false);
  });

  it("mem-parse expired_date compact (yyyyMMddHHmmss) menjadi Date yang valid (D-12)", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            order: { invoice_number: body.order.invoice_number },
            virtual_account_info: {
              virtual_account_number: "1900800000352016",
              expired_date: "20260926010829",
            },
          }),
      } as any;
    };
    try {
      const res = await dokuBuayar().createInvoice({
        orderId: "ORDER-DOKU-DATE",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Voucher",
        customer: { name: "Budi", email: "budi@mail.com" },
      });
      expect(res.expiresAt).toBeInstanceOf(Date);
      // 2026-09-26 01:08:29 WIB == 2026-09-25T18:08:29Z
      expect((res.expiresAt as Date).toISOString()).toBe("2026-09-25T18:08:29.000Z");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Midtrans BI-SNAP — fidelity vs dokumentasi resmi", () => {
  it("memakai domain & path BI-SNAP Midtrans yang resmi (M-5)", () => {
    expect(MIDTRANS_SNAP_DOMAINS.sandbox).toBe("https://merchants.sbx.midtrans.com");
    expect(MIDTRANS_SNAP_DOMAINS.production).toBe("https://merchants.midtrans.com");
    expect(MIDTRANS_SNAP_PATHS.accessToken).toBe("/v1.0/access-token/b2b");
    expect(MIDTRANS_SNAP_PATHS.qrisGenerate).toBe("/v1.0/qr/qr-mpm-generate");
    expect(MIDTRANS_SNAP_PATHS.qrisQuery).toBe("/v1.0/qr/qr-mpm-query");
    expect(MIDTRANS_SNAP_PATHS.vaCreate).toBe("/v1.0/transfer-va/create-va");
    expect(MIDTRANS_SNAP_PATHS.vaStatus).toBe("/v1.0/transfer-va/status");
  });

  it("memetakan status transaksi numerik SNAP ke status kanonikal (M-6)", () => {
    // 00 Success · 01 Initiated · 03 Pending · 04 Refunded · 05 Canceled
    // 06 Failed · 08 Expiry · 09 Rejected
    expect(mapMidtransSnapStatus("00")).toBe("paid");
    expect(mapMidtransSnapStatus("01")).toBe("pending");
    expect(mapMidtransSnapStatus("03")).toBe("pending");
    expect(mapMidtransSnapStatus("04")).toBe("failed");
    expect(mapMidtransSnapStatus("05")).toBe("failed");
    expect(mapMidtransSnapStatus("06")).toBe("failed");
    expect(mapMidtransSnapStatus("08")).toBe("expired");
    expect(mapMidtransSnapStatus("09")).toBe("failed");
    // Kode kosong TIDAK boleh dianggap sukses.
    expect(mapMidtransSnapStatus("")).toBe("pending");
    expect(mapMidtransSnapStatus(undefined)).toBe("pending");
  });

  it("menandatangani access token dengan SHA256withRSA atas clientId|timestamp (M-7)", () => {
    const clientId = "G1234325-SNAP";
    const timestamp = "2023-07-31T07:10:00+07:00";
    const signature = generateSnapAsymmetricSignature(SNAP_RSA_KEYS.privateKey, clientId, timestamp);

    const verifier = crypto.createVerify("SHA256");
    verifier.update(`${clientId}|${timestamp}`, "utf8");
    expect(verifier.verify(SNAP_RSA_KEYS.publicKey, signature, "base64")).toBe(true);

    // String yang salah (timestamp berbeda) harus gagal verifikasi.
    const wrong = crypto.createVerify("SHA256");
    wrong.update(`${clientId}|${timestamp}-lain`, "utf8");
    expect(wrong.verify(SNAP_RSA_KEYS.publicKey, signature, "base64")).toBe(false);
  });

  it("menandatangani transaksi dengan HMAC_SHA512 memakai rumus ASPI (M-7)", () => {
    const body = { amount: { value: "1500.00", currency: "IDR" } };
    const timestamp = "2024-03-19T14:30:00+07:00";
    const actual = generateSnapSymmetricSignature(
      SNAP_CLIENT_SECRET,
      "POST",
      MIDTRANS_SNAP_PATHS.qrisGenerate,
      "tok-1",
      body,
      timestamp
    );
    expect(actual).toBe(
      expectedSnapTransactionSignature({
        path: MIDTRANS_SNAP_PATHS.qrisGenerate,
        accessToken: "tok-1",
        timestamp,
        body,
      })
    );
  });

  it("membuat QRIS lewat /v1.0/qr/qr-mpm-generate dengan header & signature yang benar (M-5)", async () => {
    const stub = stubSnapFetch((body) => ({
      responseCode: "2004700",
      responseMessage: "Request has been processed successfully",
      referenceNo: "2020102977770000000009",
      partnerReferenceNo: body.partnerReferenceNo,
      qrContent: "00020101021226610014ID.CO.QRIS.WWW",
      qrUrl: "https://api.midtrans.com/qris/1",
      qrImage: "TWFuIGlzIGRpc3Rpbmd1aXNoZWQ=",
    }));

    try {
      const buayar = new Buayar(snapConfig({ snapClientId: "SNAP-CLIENT-QRIS" }));
      const res = await buayar.createInvoice({
        orderId: "ORDER-SNAP-QRIS-1",
        amount: 1500,
        paymentMethod: "qris",
        productDetails: "Kopi",
        customer: { name: "Budi", email: "budi@mail.com", phone: "08123456789" },
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe("qris");
      expect(res.qrString).toBe("00020101021226610014ID.CO.QRIS.WWW");
      expect(res.qrCodeUrl).toBe("https://api.midtrans.com/qris/1");
      expect(res.reference).toBe("2020102977770000000009");

      expect(stub.calls.length).toBe(2);
      expect(stub.calls[0].url).toBe("https://merchants.sbx.midtrans.com/v1.0/access-token/b2b");

      const qrisCall = stub.calls[1];
      expect(qrisCall.url).toBe("https://merchants.sbx.midtrans.com/v1.0/qr/qr-mpm-generate");
      expect(qrisCall.headers["Authorization"]).toBe("Bearer snap-access-token");
      expect(qrisCall.headers["X-PARTNER-ID"]).toBe("G812345678");
      expect(qrisCall.headers["CHANNEL-ID"]).toBe("12345");
      expect(qrisCall.headers["X-DEVICE-ID"]).toBeTruthy();
      expect(qrisCall.headers["X-TIMESTAMP"]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/);
      expect(qrisCall.body.amount.value).toBe("1500.00");
      expect(qrisCall.body.amount.currency).toBe("IDR");
      expect(qrisCall.body.additionalInfo.acquirer).toBe("gopay");
      // Dokumen: X-EXTERNAL-ID harus sama dengan body.partnerReferenceNo.
      expect(qrisCall.headers["X-EXTERNAL-ID"]).toBe(qrisCall.body.partnerReferenceNo);
      // Signature dihitung atas byte body yang benar-benar dikirim.
      expect(qrisCall.headers["X-SIGNATURE"]).toBe(
        expectedSnapTransactionSignature({
          path: MIDTRANS_SNAP_PATHS.qrisGenerate,
          accessToken: "snap-access-token",
          timestamp: qrisCall.headers["X-TIMESTAMP"],
          rawBody: qrisCall.rawBody,
        })
      );
    } finally {
      stub.restore();
    }
  });

  it("meng-cache access token B2B antar request (M-8)", async () => {
    const stub = stubSnapFetch((body) => ({
      responseCode: "2004700",
      responseMessage: "OK",
      referenceNo: "ref-1",
      partnerReferenceNo: body.partnerReferenceNo,
      qrContent: "00020101021226",
      qrUrl: "https://api.midtrans.com/qris/1",
    }));

    try {
      const buayar = new Buayar(snapConfig({ snapClientId: "SNAP-CLIENT-CACHE" }));
      const base = {
        amount: 1000,
        paymentMethod: "qris" as const,
        productDetails: "Kopi",
        customer: { name: "Budi", email: "budi@mail.com" },
      };
      await buayar.createInvoice({ ...base, orderId: "ORDER-CACHE-1" });
      await buayar.createInvoice({ ...base, orderId: "ORDER-CACHE-2" });

      const tokenCalls = stub.calls.filter((c) => c.url.includes(MIDTRANS_SNAP_PATHS.accessToken));
      expect(tokenCalls.length).toBe(1);
      expect(stub.calls.length).toBe(3);
    } finally {
      stub.restore();
    }
  });

  it("menolak SNAP VA tanpa partnerServiceId/customerNo dengan pesan jelas (M-9)", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    (globalThis as any).fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200, text: async () => "{}" } as any;
    };

    try {
      const buayar = new Buayar(
        snapConfig({
          snapClientId: "SNAP-CLIENT-VA-NOCFG",
          snapPartnerServiceId: undefined,
          snapCustomerNo: undefined,
        })
      );
      const res = await buayar.createInvoice({
        orderId: "ORDER-SNAP-VA-NOCFG",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Topup",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("snapPartnerServiceId");
      // Jangan pernah kirim request yang pasti ditolak.
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("membuat VA lewat /v1.0/transfer-va/create-va (M-5)", async () => {
    const stub = stubSnapFetch((body) => ({
      responseCode: "2002700",
      responseMessage: "Request has been processed successfully",
      referenceNo: "2020102977770000000010",
      virtualAccountData: {
        partnerServiceId: "1234",
        customerNo: "0000000000",
        virtualAccountNo: "12340000000000",
        virtualAccountName: body.virtualAccountName,
        trxId: body.trxId,
        totalAmount: { value: "10000.00", currency: "IDR" },
        expiredDate: "2030-07-20T20:50:04Z",
      },
    }));

    try {
      const buayar = new Buayar(snapConfig({ snapClientId: "SNAP-CLIENT-VA" }));
      const res = await buayar.createInvoice({
        orderId: "ORDER-SNAP-VA-1",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Topup",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe("va");
      expect(res.vaNumber).toBe("12340000000000");
      expect(res.vaBank).toBe("bca");
      expect(res.amount).toBe(10000);
      expect(res.expiresAt instanceof Date).toBe(true);

      const vaCall = stub.calls[1];
      expect(vaCall.url).toBe("https://merchants.sbx.midtrans.com/v1.0/transfer-va/create-va");
      expect(vaCall.body.virtualAccountNo).toBe("12340000000000");
      expect(vaCall.body.totalAmount.value).toBe("10000.00");
      expect(vaCall.body.additionalInfo.bank).toBe("bca");
      expect(vaCall.body.additionalInfo.merchantId).toBe("M001234");
    } finally {
      stub.restore();
    }
  });

  it("mengecek status QRIS SNAP lewat /v1.0/qr/qr-mpm-query (M-10)", async () => {
    const stub = stubSnapFetch(() => ({
      responseCode: "2005100",
      responseMessage: "Successful",
      referenceNo: "ref-qris-1",
      latestTransactionStatus: "00",
      latestTransactionStatusDesc: "success",
      amount: { value: "1500.00", currency: "IDR" },
    }));

    try {
      const buayar = new Buayar(snapConfig({ snapClientId: "SNAP-CLIENT-STATUS" }));
      const res = await buayar.checkTransaction({ merchantOrderId: "ORDER-SNAP-QRIS-1" });

      expect(res.success).toBe(true);
      expect(res.status).toBe("paid");
      expect(res.isPaid).toBe(true);
      expect(res.amount).toBe(1500);

      const queryCall = stub.calls[1];
      expect(queryCall.url).toBe("https://merchants.sbx.midtrans.com/v1.0/qr/qr-mpm-query");
      expect(queryCall.body.originalPartnerReferenceNo).toBe("ORDER-SNAP-QRIS-1");
      expect(queryCall.body.merchantId).toBe("M001234");
    } finally {
      stub.restore();
    }
  });

  it("memetakan status expired pada query SNAP (M-10)", async () => {
    const stub = stubSnapFetch(() => ({
      responseCode: "2005100",
      responseMessage: "Successful",
      referenceNo: "ref-qris-2",
      latestTransactionStatus: "08",
      amount: { value: "1500.00", currency: "IDR" },
    }));

    try {
      const buayar = new Buayar(snapConfig({ snapClientId: "SNAP-CLIENT-EXPIRED" }));
      const res = await buayar.checkTransaction({ merchantOrderId: "ORDER-SNAP-QRIS-2" });
      expect(res.status).toBe("expired");
      expect(res.isExpired).toBe(true);
      expect(res.isPaid).toBe(false);
    } finally {
      stub.restore();
    }
  });

  it("memverifikasi notifikasi SNAP dengan Midtrans public key (M-11)", () => {
    const urlPath = "/v1.0/qr/qr-mpm-notify";
    const timeStamp = "2024-03-19T14:30:00+07:00";
    const body = {
      originalReferenceNo: "ref-1",
      originalPartnerReferenceNo: "ORDER-1",
      latestTransactionStatus: "00",
      amount: { value: "1500.00", currency: "IDR" },
    };
    const hashed = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").toLowerCase();
    const signature = crypto
      .sign("RSA-SHA256", Buffer.from(`POST:${urlPath}:${hashed}:${timeStamp}`), SNAP_RSA_KEYS.privateKey)
      .toString("base64");

    expect(
      verifyMidtransSnapNotificationSignature({ body, urlPath, timeStamp, signature, publicKey: SNAP_RSA_KEYS.publicKey })
    ).toBe(true);

    // Body yang diubah harus DITOLAK (fail-closed).
    expect(
      verifyMidtransSnapNotificationSignature({
        body: { ...body, latestTransactionStatus: "06" },
        urlPath,
        timeStamp,
        signature,
        publicKey: SNAP_RSA_KEYS.publicKey,
      })
    ).toBe(false);
  });

  it("menormalkan notifikasi SNAP menjadi status kanonikal (M-11)", async () => {
    const urlPath = "/v1.0/qr/qr-mpm-notify";
    const timeStamp = "2024-03-19T14:30:00+07:00";
    const body = {
      originalReferenceNo: "ref-1",
      originalPartnerReferenceNo: "ORDER-1",
      latestTransactionStatus: "00",
      amount: { value: "1500.00", currency: "IDR" },
    };
    const hashed = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").toLowerCase();
    const signature = crypto
      .sign("RSA-SHA256", Buffer.from(`POST:${urlPath}:${hashed}:${timeStamp}`), SNAP_RSA_KEYS.privateKey)
      .toString("base64");

    const buayar = new Buayar(
      snapConfig({
        snapClientId: "SNAP-CLIENT-NOTIFY",
        snapNotificationPath: urlPath,
        snapMidtransPublicKey: SNAP_RSA_KEYS.publicKey,
        snapSignature: signature,
        snapTimestamp: timeStamp,
      })
    );

    const res = await buayar.verifyWebhook(body);
    expect(res.isValid).toBe(true);
    expect(res.isPaid).toBe(true);
    expect(res.orderId).toBe("ORDER-1");
    expect(res.amount).toBe(1500);
  });

  it("menerjemahkan error probe Midtrans yang generik menjadi petunjuk aksi (M-15)", () => {
    // Midtrans membalas 400 generik untuk channel yang belum diaktifkan.
    const ovo = hintMidtransProbeError(
      "ovo",
      "One or more parameters in the payload is invalid.",
      undefined
    );
    expect(ovo).toContain("belum aktif");
    expect(ovo).toContain("bukan masalah payload");

    expect(hintMidtransProbeError("linkaja", "HTTP error! Status: 401", "401")).toContain("401");

    // Error yang tidak dikenal → tanpa petunjuk (jangan menebak).
    expect(hintMidtransProbeError("bca", "Internal server error", "500")).toBeUndefined();
    expect(hintMidtransProbeError("bca", undefined, undefined)).toBeUndefined();
  });

  it("menandai probe Xendit sebagai daftar statis, bukan live (M-14)", async () => {
    // Xendit tidak punya API daftar channel; probe-nya hanya katalog statis.
    const provider = new XenditProvider();
    const probe = await provider.probePaymentMethods({});
    expect(probe.success).toBe(true);
    expect(probe.source).toBe("static");
    expect(probe.enabled.length).toBeGreaterThan(0);
  });

  it("tetap memakai Core API legacy bila kredensial SNAP tidak diisi (M-12)", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    (globalThis as any).fetch = async (url: any, options: any) => {
      capturedUrl = String(url);
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status_code: "201",
            status_message: "Success",
            transaction_id: "mid-trx-legacy",
            order_id: body.transaction_details.order_id,
            gross_amount: "10000.00",
            payment_type: "bank_transfer",
            va_numbers: [{ bank: "bca", va_number: "987654321012" }],
          }),
      } as any;
    };

    try {
      const buayar = new Buayar({ provider: "midtrans", apiKey: "SB-Mid-server-test", sandbox: true });
      const res = await buayar.createInvoice({
        orderId: "ORDER-LEGACY-VA",
        amount: 10000,
        paymentMethod: "bca_va",
        productDetails: "Topup",
        customer: { name: "Budi", email: "budi@mail.com" },
      });

      expect(capturedUrl).toContain("api.sandbox.midtrans.com/v2/charge");
      expect(res.success).toBe(true);
      expect(res.vaNumber).toBe("987654321012");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
