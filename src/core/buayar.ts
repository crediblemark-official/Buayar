import { PaymentManager, paymentManager } from "./manager";
import { ProviderRegistry, providerRegistry } from "./providerRegistry";
import type { ProviderCapability, ProviderDescriptor } from "./providerRegistry";
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
  RefundParams,
  RefundResult,
  CheckBalanceResult,
  DisburseParams,
  DisburseResult,
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
  private registry: ProviderRegistry;

  constructor(config?: BuayarConfig, manager?: PaymentManager, registry?: ProviderRegistry) {
    this.manager = manager || paymentManager;
    this.registry = registry || providerRegistry;
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
   * Daftar nama provider yang terdaftar (bawaan + kustom).
   */
  listProviders(): string[] {
    return this.registry.names();
  }

  /**
   * Registrasi metadata provider kustom untuk deteksi & capability.
   * Contoh: buayar.registerProviderDescriptor({ name, envKeys, methods, operations })
   */
  registerProviderDescriptor(desc: ProviderDescriptor): void {
    this.registry.register(desc);
  }

  /**
   * Cek capability (metode + operasi) provider tertentu — atau provider aktif bila kosong.
   * Jawab pertanyaan "provider ini dukung apa?" secara runtime, tanpa bongkar dokumen.
   */
  getCapabilities(name?: string): ProviderCapability | undefined {
    const n = name || this.provider;
    const desc = this.registry.get(n);
    if (!desc) return undefined;
    return { methods: desc.methods, operations: desc.operations };
  }

  /**
   * Deteksi nama provider dari struktur payload webhook.
   */
  detectProviderFromPayload(payload: any): string | undefined {
    return this.registry.detectFromWebhook(payload);
  }

  /**
   * Deteksi nama provider aktif dari variabel lingkungan (kredensial yang terisi).
   */
  detectProviderFromEnv(env?: Record<string, string | undefined>): string | undefined {
    return this.registry.detectFromEnv(env || (process.env as any));
  }

  /**
   * Logika "bisa pakai X dengan provider Y?" — helper untuk portabilitas.
   */
  supports(name: string, operation: "refund" | "checkBalance" | "disburse"): boolean {
    const desc = this.registry.get(name);
    return desc ? desc.operations[operation] : false;
  }

  /**
   * Daftar metode pembayaran yang benar2 tersedia untuk provider aktif.
   */
  getSupportedMethods(name?: string): string[] {
    const n = name || this.provider;
    return this.registry.get(n)?.methods || [];
  }

  /**
   * Iterasi CEPAT: apakah provider aktif mendukung method kanonik tertentu?
   */
  supportsMethod(method: string, name?: string): boolean {
    const n = name || this.provider;
    return this.registry.get(n)?.methods.includes(method) ?? false;
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
      if (!mergedConfig.extra) mergedConfig.extra = {};
      mergedConfig.extra.headers = headers;

      // Stripe
      const stripeSig = headers["stripe-signature"] || headers["Stripe-Signature"];
      if (stripeSig) {
        mergedConfig.extra.signatureHeader = Array.isArray(stripeSig) ? stripeSig[0] : stripeSig;
      }
      // Checkout.com
      const ckoSig = headers["cko-signature"] || headers["Cko-Signature"];
      if (ckoSig) {
        mergedConfig.extra.signatureHeader = Array.isArray(ckoSig) ? ckoSig[0] : ckoSig;
      }
      // Razorpay
      const rzpSig = headers["x-razorpay-signature"] || headers["X-Razorpay-Signature"];
      if (rzpSig) {
        mergedConfig.extra.signatureHeader = Array.isArray(rzpSig) ? rzpSig[0] : rzpSig;
      }
      // Square
      const squareSig = headers["x-square-hmacsha256-signature"] || headers["x-square-signature"];
      if (squareSig) {
        mergedConfig.extra.signatureHeader = Array.isArray(squareSig) ? squareSig[0] : squareSig;
      }
      // PayU
      const payuSig = headers["openpayu-signature"] || headers["OpenPayU-Signature"];
      if (payuSig) {
        mergedConfig.extra.signatureHeader = Array.isArray(payuSig) ? payuSig[0] : payuSig;
      }
      // Braintree
      const btSig = headers["bt_signature"];
      const btPayload = headers["bt_payload"];
      if (btSig && btPayload) {
        mergedConfig.extra.btSignature = Array.isArray(btSig) ? btSig[0] : btSig;
        mergedConfig.extra.btPayload = Array.isArray(btPayload) ? btPayload[0] : btPayload;
      }
      // Xendit
      const xenditToken = headers["x-callback-token"] || headers["X-Callback-Token"];
      if (xenditToken) {
        mergedConfig.extra.callbackToken = Array.isArray(xenditToken) ? xenditToken[0] : xenditToken;
      }
      // DOKU
      const dokuSig = headers["signature"] || headers["Signature"];
      if (dokuSig) {
        mergedConfig.extra.dokuSignature = Array.isArray(dokuSig) ? dokuSig[0] : dokuSig;
      }
      // OY!
      const oyUser = headers["x-oy-username"] || headers["X-Oy-Username"];
      if (oyUser) {
        mergedConfig.extra.oyUsername = Array.isArray(oyUser) ? oyUser[0] : oyUser;
      }
    }

    let providerName = (configOverride as any)?.provider || this.provider;

    // Auto-detect provider dari struktur payload (via registry terpusat)
    const detected = this.registry.detectFromWebhook(payload);
    if (detected) providerName = detected;

    return this.manager.verifyCallback(providerName, payload, mergedConfig);
  }

  async handleWebhook(
    payload: any,
    headers?: Record<string, string | string[] | undefined>,
    configOverride?: Partial<ProviderConfig>
  ): Promise<VerifyCallbackResult> {
    return this.verifyWebhook(payload, headers, configOverride);
  }

  /**
   * Unified Refund — berlaku untuk semua provider yang mendukung refund.
   * Provider tanpa fitur refund mengembalikan `{ supported: false }`, bukan error.
   */
  async refund(
    params: RefundParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<RefundResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    return this.manager.refund(providerName, params, mergedConfig);
  }

  /**
   * Unified Check Balance — ambil saldo merchant dari provider aktif.
   * Provider tanpa fitur balance mengembalikan `{ supported: false }`.
   */
  async checkBalance(configOverride?: Partial<ProviderConfig>): Promise<CheckBalanceResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    return this.manager.checkBalance(providerName, mergedConfig);
  }

  /**
   * Unified Disburse / Payout — transfer dana ke rekening bank tujuan.
   * Provider tanpa fitur disbursement mengembalikan `{ supported: false }`.
   */
  async disburse(
    params: DisburseParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<DisburseResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    return this.manager.disburse(providerName, params, mergedConfig);
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
