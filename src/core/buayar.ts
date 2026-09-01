import { PaymentManager, paymentManager } from "./manager";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  BuayarConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
} from "../types";
import { MidtransClient } from "../clients/midtrans";
import { DuitkuClient } from "../clients/duitku";
import { IpaymuClient } from "../clients/ipaymu";
import { XenditClient } from "../clients/xendit";
import { DokuClient } from "../clients/doku";
import { PrismalinkClient } from "../clients/prismalink";
import { FaspayClient } from "../clients/faspay";
import { FinpayClient } from "../clients/finpay";
import { NicepayClient } from "../clients/nicepay";
import { OyClient } from "../clients/oy";
import { StripeClient } from "../clients/stripe";
import { PaypalClient } from "../clients/paypal";
import { AdyenClient } from "../clients/adyen";
import { CheckoutComClient } from "../clients/checkoutcom";
import { RazorpayClient } from "../clients/razorpay";
import { SquareClient } from "../clients/square";
import { PayuClient } from "../clients/payu";
import { BraintreeClient } from "../clients/braintree";
import { TwoCheckoutClient } from "../clients/twocheckout";
import { BasePaymentProvider } from "../providers/base";
import { resolveConfigFromEnv } from "./config";

export { resolveConfigFromEnv };

/**
 * Buayar - Unified Payment Gateway Client
 * 
 * Antarmuka tingkat tinggi untuk membuat transaksi, query channel pembayaran,
 * pengecekan status, dan verifikasi webhook universal tanpa perlu rombak kode.
 * 
 * Mendukung 19 Payment Gateway: Midtrans, Duitku, iPaymu, Xendit, DOKU, PrismaLink,
 * Faspay, Finpay, Nicepay, OY! Bisnis, Stripe, PayPal, Adyen, Checkout.com,
 * Razorpay, Square, PayU, Braintree, 2Checkout/Verifone.
 */
export class Buayar {
  private manager: PaymentManager;
  private config: BuayarConfig;

  constructor(config?: BuayarConfig, manager?: PaymentManager) {
    this.manager = manager || paymentManager;
    this.config = resolveConfigFromEnv(config);
  }

  /**
   * Dapatkan salinan konfigurasi aktif saat ini
   */
  getConfig(): BuayarConfig {
    return { ...this.config };
  }

  /**
   * Perbarui konfigurasi saat runtime
   */
  setConfig(config: Partial<BuayarConfig>): void {
    this.config = resolveConfigFromEnv({ ...this.config, ...config });
  }

  /**
   * Dapatkan nama provider aktif
   */
  get provider(): string {
    return this.config.provider || "midtrans";
  }

  /**
   * Registrasi provider custom ke dalam PaymentManager
   */
  registerProvider(provider: BasePaymentProvider): void {
    this.manager.registerProvider(provider);
  }

  /**
   * Ambil instance provider kelas dasar
   */
  getProvider(name?: string): BasePaymentProvider {
    return this.manager.getProvider(name || this.provider);
  }

  /**
   * Buat transaksi pembayaran baru (Mendukung Semi dan Full Integrasi)
   */
  async createInvoice(
    params: CreateInvoiceParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<InvoiceResponse> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;

    return this.manager.createInvoice(providerName, params, mergedConfig);
  }

  /**
   * Ambil daftar channel pembayaran aktif (Accordion-Ready)
   */
  async getPaymentMethods(
    params?: GetPaymentMethodsParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<GetPaymentMethodsResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;

    return this.manager.getPaymentMethods(providerName, params || { amount: 10000 }, mergedConfig);
  }

  /**
   * Cek status transaksi pembayaran berdasarkan Order ID
   */
  async checkTransaction(
    params: CheckTransactionParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<CheckTransactionResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;

    return this.manager.checkTransaction(providerName, params, mergedConfig);
  }

  /**
   * Universal Webhook Handler
   * 
   * Memverifikasi keabsahan signature notifikasi pembayaran masuk dan menormalisasi payload menjadi format seragam.
   */
  async verifyWebhook(
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    configOverride?: Partial<ProviderConfig>
  ): Promise<VerifyCallbackResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };

    if (headers) {
      // Stripe
      const stripeSig = headers["stripe-signature"] || headers["Stripe-Signature"];
      if (stripeSig) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.signatureHeader = Array.isArray(stripeSig) ? stripeSig[0] : stripeSig;
      }
      // Checkout.com
      const ckoSig = headers["cko-signature"] || headers["Cko-Signature"];
      if (ckoSig) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.signatureHeader = Array.isArray(ckoSig) ? ckoSig[0] : ckoSig;
      }
      // Razorpay
      const rzpSig = headers["x-razorpay-signature"] || headers["X-Razorpay-Signature"];
      if (rzpSig) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.signatureHeader = Array.isArray(rzpSig) ? rzpSig[0] : rzpSig;
      }
      // Square
      const squareSig = headers["x-square-hmacsha256-signature"] || headers["x-square-signature"];
      if (squareSig) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.signatureHeader = Array.isArray(squareSig) ? squareSig[0] : squareSig;
      }
      // PayU
      const payuSig = headers["openpayu-signature"] || headers["OpenPayU-Signature"];
      if (payuSig) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.signatureHeader = Array.isArray(payuSig) ? payuSig[0] : payuSig;
      }
      // Braintree
      const btSig = headers["bt_signature"];
      const btPayload = headers["bt_payload"];
      if (btSig && btPayload) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.btSignature = Array.isArray(btSig) ? btSig[0] : btSig;
        mergedConfig.extra.btPayload = Array.isArray(btPayload) ? btPayload[0] : btPayload;
      }
    }

    let providerName = (configOverride as any)?.provider || this.provider;

    // Auto-detect provider from payload structure
    if (payload) {
      if (payload.signature_key && payload.transaction_status) {
        providerName = "midtrans";
      } else if (payload.merchantCode && payload.merchantOrderId && payload.resultCode) {
        providerName = "duitku";
      } else if (payload.trx_id && (payload.sid || payload.reference_id || payload.via)) {
        providerName = "ipaymu";
      } else if (payload.service?.id || (payload.order?.invoice_number && payload.transaction?.status)) {
        providerName = "doku";
      } else if (payload.bill_no && (payload.payment_status_code !== undefined || payload.payment_status_desc)) {
        providerName = "faspay";
      } else if (payload.merchant_id && payload.order_id && payload.payment_status) {
        providerName = "finpay";
      } else if (payload.tXid && payload.merchantToken && (payload.referenceNo || payload.amt)) {
        providerName = "nicepay";
      } else if (payload.partner_tx_id || payload.partner_trx_id) {
        providerName = "oy";
      } else if (payload.merchant_id && payload.order_id && payload.signature) {
        providerName = "prismalink";
      } else if (payload.object === "event" || (payload.type && payload.data?.object && payload.api_version)) {
        providerName = "stripe";
      } else if (payload.event && payload.payload?.payment?.entity) {
        providerName = "razorpay";
      } else if (payload.external_id || payload.event?.startsWith("payment.") || payload.event?.startsWith("qr.") || payload.data?.reference_id) {
        providerName = "xendit";
      } else if (payload.event_type && payload.resource && (payload.event_type.startsWith("PAYMENT.") || payload.event_type.startsWith("CHECKOUT.ORDER."))) {
        providerName = "paypal";
      } else if (payload.notificationItems || (payload.merchantAccountCode && payload.pspReference && payload.eventCode)) {
        providerName = "adyen";
      } else if (payload.type && payload.data?._links && (payload.type.startsWith("payment_") || payload.type.startsWith("refund_"))) {
        providerName = "checkoutcom";
      } else if (payload.event && payload.payload?.payment?.entity) {
        providerName = "razorpay";
      } else if (payload.type && payload.data?.object?.status && payload.merchant_id) {
        providerName = "square";
      } else if (payload.order && payload.order?.status && payload.order?.extOrderId) {
        providerName = "payu";
      } else if (payload.kind && payload.subject?.transaction) {
        providerName = "braintree";
      } else if (payload.HASH && payload.REFNOEXT && payload.IPN_PID) {
        providerName = "twocheckout";
      }
    }

    return this.manager.verifyCallback(providerName, payload, mergedConfig);
  }

  async handleWebhook(
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    configOverride?: Partial<ProviderConfig>
  ): Promise<VerifyCallbackResult> {
    return this.verifyWebhook(payload, headers, configOverride);
  }

  // ─── Indonesian Provider Client Getters ───────────────────────────────────

  getMidtransClient(configOverride?: Partial<ProviderConfig>): MidtransClient {
    return new MidtransClient({ ...this.config, ...configOverride });
  }

  getDuitkuClient(configOverride?: Partial<ProviderConfig>): DuitkuClient {
    return new DuitkuClient({ ...this.config, ...configOverride });
  }

  getIpaymuClient(configOverride?: Partial<ProviderConfig>): IpaymuClient {
    return new IpaymuClient({ ...this.config, ...configOverride });
  }

  getXenditClient(configOverride?: Partial<ProviderConfig>): XenditClient {
    return new XenditClient({ ...this.config, ...configOverride });
  }

  getDokuClient(configOverride?: Partial<ProviderConfig>): DokuClient {
    return new DokuClient({ ...this.config, ...configOverride });
  }

  getPrismalinkClient(configOverride?: Partial<ProviderConfig>): PrismalinkClient {
    return new PrismalinkClient({ ...this.config, ...configOverride });
  }

  getFaspayClient(configOverride?: Partial<ProviderConfig>): FaspayClient {
    return new FaspayClient({ ...this.config, ...configOverride });
  }

  getFinpayClient(configOverride?: Partial<ProviderConfig>): FinpayClient {
    return new FinpayClient({ ...this.config, ...configOverride });
  }

  getNicepayClient(configOverride?: Partial<ProviderConfig>): NicepayClient {
    return new NicepayClient({ ...this.config, ...configOverride });
  }

  getOyClient(configOverride?: Partial<ProviderConfig>): OyClient {
    return new OyClient({ ...this.config, ...configOverride });
  }

  // ─── International Provider Client Getters ────────────────────────────────

  getStripeClient(configOverride?: Partial<ProviderConfig>): StripeClient {
    return new StripeClient({ ...this.config, ...configOverride });
  }

  getPaypalClient(configOverride?: Partial<ProviderConfig>): PaypalClient {
    return new PaypalClient({ ...this.config, ...configOverride });
  }

  getAdyenClient(configOverride?: Partial<ProviderConfig>): AdyenClient {
    return new AdyenClient({ ...this.config, ...configOverride });
  }

  getCheckoutComClient(configOverride?: Partial<ProviderConfig>): CheckoutComClient {
    return new CheckoutComClient({ ...this.config, ...configOverride });
  }

  getRazorpayClient(configOverride?: Partial<ProviderConfig>): RazorpayClient {
    return new RazorpayClient({ ...this.config, ...configOverride });
  }

  getSquareClient(configOverride?: Partial<ProviderConfig>): SquareClient {
    return new SquareClient({ ...this.config, ...configOverride });
  }

  getPayuClient(configOverride?: Partial<ProviderConfig>): PayuClient {
    return new PayuClient({ ...this.config, ...configOverride });
  }

  getBraintreeClient(configOverride?: Partial<ProviderConfig>): BraintreeClient {
    return new BraintreeClient({ ...this.config, ...configOverride });
  }

  getTwoCheckoutClient(configOverride?: Partial<ProviderConfig>): TwoCheckoutClient {
    return new TwoCheckoutClient({ ...this.config, ...configOverride });
  }
}

export const buayar = new Buayar();
