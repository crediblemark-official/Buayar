import { describe, expect, it } from "bun:test";
import { Buayar } from "../src";
import { PaypalProvider } from "../src/providers/paypal/provider";
import { SumopodProvider } from "../src/providers/sumopod/provider";
import { OyProvider } from "../src/providers/oy/provider";
import { StripeProvider } from "../src/providers/stripe/provider";
import { RazorpayProvider } from "../src/providers/razorpay/provider";
import { SquareProvider } from "../src/providers/square/provider";
import { PayuProvider } from "../src/providers/payu/provider";
import { BraintreeProvider } from "../src/providers/braintree/provider";
import { CheckoutComProvider } from "../src/providers/checkoutcom/provider";
import { MidtransProvider } from "../src/providers/midtrans/provider";
import { DuitkuProvider } from "../src/providers/duitku/provider";
import { IpaymuProvider } from "../src/providers/ipaymu/provider";
import { XenditProvider } from "../src/providers/xendit/provider";
import { DokuProvider } from "../src/providers/doku/provider";
import { PrismalinkProvider } from "../src/providers/prismalink/provider";
import { FaspayProvider } from "../src/providers/faspay/provider";
import { FinpayProvider } from "../src/providers/finpay/provider";
import { NicepayProvider } from "../src/providers/nicepay/provider";
import { AdyenProvider } from "../src/providers/adyen/provider";
import { TwoCheckoutProvider } from "../src/providers/twocheckout/provider";
import { XenithProvider } from "../src/providers/xenith/provider";

/**
 * SECURITY REGRESSION SUITE — fail-closed untuk SEMUA provider.
 *
 * Aturan yang diuji: tanpa bukti signature, `isValid` WAJIB false.
 * Dan yang lebih penting: `isPaid` juga WAJIB false.
 *
 * Kombinasi `isValid: false` + `isPaid: true` adalah kondisi paling berbahaya —
 * konsumen yang hanya mengecek `isPaid` (tanpa mengecek `isValid`) akan memenuhi
 * pesanan dari webhook palsu.
 *
 * DoD (docs/ACCEPTANCE-SWITCHING-FREE.md): tidak ada `isValid: true` yang bisa
 * dicapai tanpa bukti signature, di 20/20 provider.
 */

// Config KOSONG — tidak ada kredensial sama sekali.
const EMPTY: any = {};

// Payload yang terlihat "selesai dibayar" — inilah yang akan dicoba oleh penyerang.
const LOOKS_PAID: Record<string, any> = {
  paypal: { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { reference_id: "FORGED-1", status: "COMPLETED", amount: { value: "1.00" } } },
  sumopod: { event_type: "payment.completed", data: { order_id: "FORGED-2", status: "completed", amount: 100 } },
  oy: { status: "SUCCESS", trx_id: "F3", order_id: "FORGED-3", amount: 1000 },
  stripe: { id: "evt_1", type: "checkout.session.completed", payment_status: "paid", amount_total: 1000, metadata: { order_id: "FORGED-4" } },
  razorpay: { event: "payment.captured", payload: { payment: { entity: { order_id: "FORGED-5", amount: 1000, status: "captured", notes: { order_id: "FORGED-5" } } } } },
  square: { type: "payment.completed", data: { object: { payment: { reference_id: "FORGED-6", amount_money: { amount: 1000 }, status: "COMPLETED" } } } },
  payu: { order: { orderId: "o1", extOrderId: "FORGED-7", totalAmount: "1000", status: "COMPLETED" } },
  braintree: { kind: "transaction_settled", subject: { transaction: { id: "t1", orderId: "FORGED-8", amount: "10.00", status: "settled" } } },
  checkoutcom: { type: "payment_captured", data: { id: "p1", reference: "FORGED-9", amount: 1000, approved: true } },
  midtrans: { transaction_status: "capture", signature_key: "x", order_id: "FORGED-10", gross_amount: "1000" },
  // Duitku memakai `amount`, bukan `totalAmount` — `totalAmount` itu field PayU.
  // Dengan `amount`, payload ini persis bentuk callback Duitku yang sebenarnya.
  duitku: { resultCode: "00", merchantOrderId: "FORGED-11", amount: "1000" },
  ipaymu: { status: "1", trx_id: "t1", reference_id: "FORGED-12" },
  xendit: { id: "x1", status: "PAID", external_id: "FORGED-13" },
  doku: { result: "success", order_id: "FORGED-14", status: "success" },
  prismalink: { status: "success", merchant_id: "m1", order_id: "FORGED-15" },
  faspay: { bill_no: "FORGED-16", payment_status_code: "2" },
  finpay: { order_id: "FORGED-17", payment_status: "PAID" },
  nicepay: { resultCd: "0000", orderId: "FORGED-18", status: "PAID" },
  adyen: { eventCode: "AUTHORISATION", success: "true", merchantReference: "FORGED-19" },
  twocheckout: { ORDERSTATUS: "COMPLETE", ORDERID: "FORGED-20" },
  xenith: { schemaVersion: "1.0.1", timestamp: "2026-09-26T10:00:00Z", data: { id: "payin-1", referenceCode: "FORGED-21", status: "SUCCESS", paymentAmount: "10000" } },
};

const CASES: Array<[string, any]> = [
  ["paypal", new PaypalProvider()],
  ["sumopod", new SumopodProvider()],
  ["oy", new OyProvider()],
  ["stripe", new StripeProvider()],
  ["razorpay", new RazorpayProvider()],
  ["square", new SquareProvider()],
  ["payu", new PayuProvider()],
  ["braintree", new BraintreeProvider()],
  ["checkoutcom", new CheckoutComProvider()],
  ["midtrans", new MidtransProvider()],
  ["duitku", new DuitkuProvider()],
  ["ipaymu", new IpaymuProvider()],
  ["xendit", new XenditProvider()],
  ["doku", new DokuProvider()],
  ["prismalink", new PrismalinkProvider()],
  ["faspay", new FaspayProvider()],
  ["finpay", new FinpayProvider()],
  ["nicepay", new NicepayProvider()],
  ["adyen", new AdyenProvider()],
  ["twocheckout", new TwoCheckoutProvider()],
  ["xenith", new XenithProvider()],
];

describe("SECURITY — fail-closed di 21/21 provider", () => {
  it("menguji tepat 21 provider", () => {
    expect(CASES.length).toBe(21);
  });

  for (const [name, provider] of CASES) {
    it(`${name}: webhook tanpa kredensial TIDAK boleh isValid`, async () => {
      const result = await provider.verifyCallback(LOOKS_PAID[name], EMPTY);
      expect(result.isValid).toBe(false);
    });

    it(`${name}: webhook tanpa kredensial TIDAK boleh isPaid`, async () => {
      const result = await provider.verifyCallback(LOOKS_PAID[name], EMPTY);
      // Kombinasi isValid:false + isPaid:true adalah skenario pemesanan order palsu.
      expect(result.isPaid).toBe(false);
    });
  }
});

describe("SECURITY — facade verifyWebhook juga fail-closed", () => {
  for (const [name] of CASES) {
    it(`${name}: facade menolak webhook tanpa signature`, async () => {
      const buayar = new Buayar({ provider: name });
      const result = await buayar.verifyWebhook(LOOKS_PAID[name], {});
      expect(result.isValid).toBe(false);
      expect(result.isPaid).toBe(false);
    });
  }
});
