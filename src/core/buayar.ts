import { PaymentManager, paymentManager } from "./manager";
import { buildPaymentMethodDescriptors } from "./descriptor";
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
  GetPaymentMethodDescriptorsResult,
  CheckTransactionParams,
  CheckTransactionResult,
  RefundParams,
  RefundResult,
  CheckBalanceResult,
  DisburseParams,
  DisburseResult,
  UpdateVaParams,
  UpdateVaResult,
  DeleteVaParams,
  DeleteVaResult,
  ValidateBankAccountParams,
  ValidateBankAccountResult,
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
import { SumopodClient } from "../clients/sumopod";
import { XenithClient } from "../clients/xenith";
import { BasePaymentProvider } from "../providers/base";
import { resolveConfigFromEnv } from "./config";
import { simulator, BuayarSimulator } from "../simulator";

export { resolveConfigFromEnv };

/**
 * Buayar - Unified Payment Gateway Client
 * 
 * Antarmuka tingkat tinggi untuk membuat transaksi, query channel pembayaran,
 * pengecekan status, dan verifikasi webhook universal tanpa perlu rombak kode.
 * 
 * Mendukung 20 Payment Gateway: Midtrans, Duitku, iPaymu, Xendit, DOKU, PrismaLink,
 * Faspay, Finpay, Nicepay, OY! Bisnis, Stripe, PayPal, Adyen, Checkout.com,
 * Razorpay, Square, PayU, Braintree, 2Checkout/Verifone, SumoPod.
 */
export class Buayar {
  private manager: PaymentManager;
  private config: BuayarConfig;
  private registry: ProviderRegistry;
  readonly simulator: BuayarSimulator = simulator;

  constructor(config?: BuayarConfig, manager?: PaymentManager, registry?: ProviderRegistry) {
    this.manager = manager || paymentManager;
    this.registry = registry || providerRegistry;
    this.config = resolveConfigFromEnv(config);
  }

  /**
   * Dapatkan salinan konfigurasi aktif saat ini
   */
  getConfig(): BuayarConfig {
    // `extra` ikut disalin menjadi objek baru. Kalau hanya `{ ...this.config }`,
    // pemanggil masih memegang reference ke `this.config.extra` dan bisa mengubah
    // konfigurasi instance dari luar.
    return { ...this.config, extra: { ...(this.config.extra || {}) } };
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
    return this.config.provider || "";
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
   * Deteksi nama provider dari struktur payload webhook dan opsional headers.
   */
  detectProviderFromPayload(
    payload: any,
    headers?: Record<string, string | string[] | undefined>
  ): string | undefined {
    return this.registry.detectFromWebhook(payload, headers as any);
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
   * Ambil daftar channel pembayaran aktif dalam bentuk deskriptor kanonikal
   * siap-render (id, name, type, icon, badge, image, category, totalFee).
   * Wrapper di atas {@link Buayar.getPaymentMethods} + `buildPaymentMethodDescriptors`,
   * sehingga konsumen UI/snapshot tidak perlu melakukan mapping ulang per provider.
   */
  async getPaymentMethodDescriptors(
    params?: GetPaymentMethodsParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<GetPaymentMethodDescriptorsResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    const generatedAt = new Date().toISOString();

    const res = await this.manager.getPaymentMethods(providerName, params || { amount: 10000 }, mergedConfig);
    if (!res.success) {
      return {
        success: false,
        provider: providerName,
        descriptors: [],
        error: res.error || "Failed to fetch payment methods",
        generatedAt,
      };
    }

    return {
      success: true,
      provider: providerName,
      descriptors: buildPaymentMethodDescriptors(res.methods, providerName),
      generatedAt,
    };
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
    // PENTING: `extra` disalin menjadi objek BARU, bukan hanya di-spread.
    //
    // `{ ...this.config }` hanya menyalin reference ke `extra`, sehingga
    // `mergedConfig.extra` === `this.config.extra`. Semua penulisan header di
    // bawah (`extra.headers`, `extra.oyUsername`, `extra.signatureHeader`, ...)
    // lalu menulis ke state instance secara permanen — dan BERTAHAN ke request
    // berikutnya. Akibatnya:
    //
    //   • Request tanpa `x-oy-username` jatuh ke `config.extra.oyUsername`
    //     milik request SEBELUMNYA (lihat OY!Provider) — fail-closed "header
    //     absen = tolak" jadi bisa dilewati.
    //   • `sumopod` punya pola sama via `config.extra.webhookTokenHeader`.
    //   • `extra.headers` dari request lain bisa dipakai untuk memverifikasi
    //     signature, termasuk lintas tenant pada aplikasi multi-merchant.
    //
    // Per-request merge di bawah membuat `this.config` benar-benar tak tersentuh.
    const mergedExtra: Record<string, any> = {
      ...(this.config.extra || {}),
      ...(configOverride?.extra || {}),
    };
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride, extra: mergedExtra };

    if (headers) {
      mergedExtra.headers = headers;

      // Stripe
      const stripeSig = headers["stripe-signature"] || headers["Stripe-Signature"];
      if (stripeSig) {
        mergedExtra.signatureHeader = Array.isArray(stripeSig) ? stripeSig[0] : stripeSig;
      }
      // Checkout.com
      const ckoSig = headers["cko-signature"] || headers["Cko-Signature"];
      if (ckoSig) {
        mergedExtra.signatureHeader = Array.isArray(ckoSig) ? ckoSig[0] : ckoSig;
      }
      // Razorpay
      const rzpSig = headers["x-razorpay-signature"] || headers["X-Razorpay-Signature"];
      if (rzpSig) {
        mergedExtra.signatureHeader = Array.isArray(rzpSig) ? rzpSig[0] : rzpSig;
      }
      // Square
      const squareSig = headers["x-square-hmacsha256-signature"] || headers["x-square-signature"];
      if (squareSig) {
        mergedExtra.signatureHeader = Array.isArray(squareSig) ? squareSig[0] : squareSig;
      }
      // PayU
      const payuSig = headers["openpayu-signature"] || headers["OpenPayU-Signature"];
      if (payuSig) {
        mergedExtra.signatureHeader = Array.isArray(payuSig) ? payuSig[0] : payuSig;
      }
      // Braintree
      const btSig = headers["bt_signature"] || (payload && typeof payload === "object" ? payload.bt_signature : undefined);
      const btPayload = headers["bt_payload"] || (payload && typeof payload === "object" ? payload.bt_payload : undefined);
      if (btSig && btPayload) {
        mergedExtra.btSignature = Array.isArray(btSig) ? btSig[0] : btSig;
        mergedExtra.btPayload = Array.isArray(btPayload) ? btPayload[0] : btPayload;
      }
      // Xendit
      const xenditToken = headers["x-callback-token"] || headers["X-Callback-Token"];
      if (xenditToken) {
        mergedExtra.callbackToken = Array.isArray(xenditToken) ? xenditToken[0] : xenditToken;
      }
      // DOKU
      const dokuSig = headers["signature"] || headers["Signature"];
      if (dokuSig) {
        mergedExtra.dokuSignature = Array.isArray(dokuSig) ? dokuSig[0] : dokuSig;
      }
      // Midtrans BI-SNAP (signature asimetris: X-SIGNATURE + X-TIMESTAMP)
      const mtSnapSig = headers["x-signature"] || headers["X-SIGNATURE"];
      const mtSnapTs = headers["x-timestamp"] || headers["X-TIMESTAMP"];
      if (mtSnapSig && mtSnapTs) {
        mergedExtra.snapSignature = Array.isArray(mtSnapSig) ? mtSnapSig[0] : mtSnapSig;
        mergedExtra.snapTimestamp = Array.isArray(mtSnapTs) ? mtSnapTs[0] : mtSnapTs;
      }
      // OY!
      const oyUser = headers["x-oy-username"] || headers["X-Oy-Username"];
      if (oyUser) {
        mergedExtra.oyUsername = Array.isArray(oyUser) ? oyUser[0] : oyUser;
      }
      // SumoPod
      const svixId = headers["svix-id"] || headers["Svix-Id"];
      const svixTimestamp = headers["svix-timestamp"] || headers["Svix-Timestamp"];
      const svixSignature = headers["svix-signature"] || headers["Svix-Signature"];
      const sumopodToken = headers["x-webhook-token"] || headers["X-Webhook-Token"];
      if (svixId) mergedExtra.svixId = Array.isArray(svixId) ? svixId[0] : svixId;
      if (svixTimestamp) mergedExtra.svixTimestamp = Array.isArray(svixTimestamp) ? svixTimestamp[0] : svixTimestamp;
      if (svixSignature) mergedExtra.svixSignature = Array.isArray(svixSignature) ? svixSignature[0] : svixSignature;
      if (sumopodToken) mergedExtra.webhookTokenHeader = Array.isArray(sumopodToken) ? sumopodToken[0] : sumopodToken;
      // Xenith
      const xenithSig = headers["x-xenith-signature"] || headers["X-Xenith-Signature"];
      const xenithTs = headers["x-xenith-timestamp"] || headers["X-Xenith-Timestamp"];
      if (xenithSig) mergedExtra.xenithSignature = Array.isArray(xenithSig) ? xenithSig[0] : xenithSig;
      if (xenithTs) mergedExtra.xenithTimestamp = Array.isArray(xenithTs) ? xenithTs[0] : xenithTs;
    }

    const overrideProvider = (configOverride as any)?.provider;
    let providerName = overrideProvider !== undefined && overrideProvider !== ""
      ? overrideProvider
      : this.provider;

    // Auto-detect provider dari payload / headers bila tidak ada provider eksplisit
    if (!providerName) {
      const detected = this.registry.detectFromWebhook(payload, headers as any);
      if (detected) providerName = detected;
    }

    if (!providerName) {
      return {
        isValid: false,
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        status: "failed",
        orderId: "",
        amount: 0,
        provider: "unknown",
        error: "Unable to detect payment provider for webhook. Please specify provider in configuration or override.",
        rawPayload: payload,
      };
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

  /**
   * Probe payment methods yang benar-benar aktif di akun merchant gateway.
   */
  async probePaymentMethods(
    configOverride?: Partial<ProviderConfig>
  ): Promise<{ success: boolean; enabled: string[]; source?: "live" | "static"; error?: string }> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;

    return this.manager.probePaymentMethods(providerName, mergedConfig);
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

  /**
   * Update Virtual Account (mis. perpanjang expired time atau ubah nominal VA).
   */
  async updateVirtualAccount(
    params: UpdateVaParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<UpdateVaResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    if (providerName.toLowerCase() === "doku") {
      return this.manager.getDokuProvider().updateVirtualAccount(params, mergedConfig);
    }
    return {
      success: false,
      provider: providerName,
      orderId: params.orderId,
      rawResponse: null,
      error: `Update Virtual Account is not supported for provider '${providerName}'`,
    };
  }

  /**
   * Delete / Cancel Virtual Account yang belum dibayar.
   */
  async deleteVirtualAccount(
    params: DeleteVaParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<DeleteVaResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    if (providerName.toLowerCase() === "doku") {
      return this.manager.getDokuProvider().deleteVirtualAccount(params, mergedConfig);
    }
    return {
      success: false,
      provider: providerName,
      orderId: params.orderId,
      rawResponse: null,
      error: `Delete Virtual Account is not supported for provider '${providerName}'`,
    };
  }

  /**
   * Validasi rekening bank / e-wallet tujuan sebelum transfer (Account Inquiry).
   */
  async validateBankAccount(
    params: ValidateBankAccountParams,
    configOverride?: Partial<ProviderConfig>
  ): Promise<ValidateBankAccountResult> {
    const mergedConfig: ProviderConfig = { ...this.config, ...configOverride };
    const providerName = (configOverride as any)?.provider || this.provider;
    if (providerName.toLowerCase() === "doku") {
      return this.manager.getDokuProvider().validateBankAccount(params, mergedConfig);
    }
    return {
      success: false,
      provider: providerName,
      bankCode: params.bankCode,
      accountNumber: params.accountNumber,
      rawResponse: null,
      error: `Bank account validation is not supported for provider '${providerName}'`,
    };
  }

  // ─── Direct Provider Client Escape Hatches (Advanced / Non-Portable) ───────
  // PERINGATAN: Memanggil client gateway spesifik di bawah ini mengunci kode aplikasi
  // Anda ke satu payment gateway dan menghilangkan portabilitas zero-code switching.
  // Gunakan metode unified Buayar (createInvoice, verifyWebhook, dll) agar aplikasi
  // dapat berganti provider hanya dengan memperbarui konfigurasi environment.

  /**
   * Escape hatch MidtransClient spesifik (Non-Portable).
   * @deprecated Disarankan memakai API unified `createInvoice` / `verifyWebhook` agar kode portabel saat switching provider.
   */
  getMidtransClient(configOverride?: Partial<ProviderConfig>): MidtransClient {
    return new MidtransClient({ ...this.config, ...configOverride });
  }

  /**
   * Escape hatch DuitkuClient spesifik (Non-Portable).
   * @deprecated Disarankan memakai API unified `createInvoice` / `verifyWebhook`.
   */
  getDuitkuClient(configOverride?: Partial<ProviderConfig>): DuitkuClient {
    return new DuitkuClient({ ...this.config, ...configOverride });
  }

  /**
   * Escape hatch IpaymuClient spesifik (Non-Portable).
   * @deprecated Disarankan memakai API unified `createInvoice` / `verifyWebhook`.
   */
  getIpaymuClient(configOverride?: Partial<ProviderConfig>): IpaymuClient {
    return new IpaymuClient({ ...this.config, ...configOverride });
  }

  /**
   * Escape hatch XenditClient spesifik (Non-Portable).
   * @deprecated Disarankan memakai API unified `createInvoice` / `verifyWebhook`.
   */
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

  getSumopodClient(configOverride?: Partial<ProviderConfig>): SumopodClient {
    return new SumopodClient({ ...this.config, ...configOverride });
  }

  getXenithClient(configOverride?: Partial<ProviderConfig>): XenithClient {
    return new XenithClient({ ...this.config, ...configOverride });
  }

  // ─── Xenith-Specific Extended API ──────────────────────────────────────────

  /**
   * Batch Disbursement Xenith — kirim banyak payout sekaligus.
   * Setiap item di-submit secara serial dan hasilnya dikembalikan dalam satu array.
   */
  async batchDisburse(
    items: Array<{
      externalId: string;
      bankCode: string;
      accountNumber: string;
      accountHolderName?: string;
      amount: number;
      description?: string;
    }>,
    configOverride?: Partial<ProviderConfig>
  ) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().batchDisburse(items, config);
  }

  /**
   * List semua transaksi Xenith dalam satu feed cursor-paginated
   * Mencakup: PAY_IN, PAY_OUT, SETTLEMENT, TOP_UP, PAY_IN_CREDIT, BALANCE_ADJUSTMENT, PAYMENT_LINK
   * Catatan: tidak mendukung filter `order` — gunakan createdTimeGte/Lte untuk filter rentang waktu
   */
  async listXenithTransactions(
    params?: { limit?: number; cursor?: string; createdTimeGte?: string; createdTimeLte?: string },
    configOverride?: Partial<ProviderConfig>
  ) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().listTransactions(params || {}, config);
  }

  /**
   * List Pay Out Xenith dengan paginasi cursor
   */
  async listXenithPayOuts(
    params?: { limit?: number; order?: "ASC" | "DESC"; cursor?: string; status?: string },
    configOverride?: Partial<ProviderConfig>
  ) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().listPayOuts(params || {}, config);
  }

  /**
   * List Pay In Xenith dengan paginasi cursor
   */
  async listXenithPayIns(
    params?: { limit?: number; order?: "ASC" | "DESC"; cursor?: string; status?: string },
    configOverride?: Partial<ProviderConfig>
  ) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().listPayIns(params || {}, config);
  }

  /**
   * List Payment Link Xenith dengan paginasi cursor
   */
  async listXenithPaymentLinks(
    params?: { limit?: number; order?: "ASC" | "DESC"; cursor?: string; status?: string },
    configOverride?: Partial<ProviderConfig>
  ) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().listPaymentLinks(params || {}, config);
  }

  /**
   * Expire (batalkan) Payment Link Xenith yang masih aktif
   */
  async expireXenithPaymentLink(id: string, configOverride?: Partial<ProviderConfig>) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().expirePaymentLink(id, config);
  }

  /**
   * Dapatkan detail Pay Out Xenith berdasarkan ID
   */
  async getXenithPayOut(id: string, configOverride?: Partial<ProviderConfig>) {
    const config: ProviderConfig = { ...this.config, ...configOverride };
    return this.manager.getXenithProvider().getPayOut(id, config);
  }
}

// ─── Default Instance (lazy) ────────────────────────────────────────────────

let defaultBuayarInstance: Buayar | undefined;

function getDefaultBuayar(): Buayar {
  if (!defaultBuayarInstance) {
    defaultBuayarInstance = new Buayar();
  }
  return defaultBuayarInstance;
}

/**
 * Instance default untuk pemakaian cepat: `buayar.createInvoice(...)`.
 *
 * Dibuat **lazy** melalui Proxy: instance `Buayar` sebenarnya baru di-construct saat
 * properti pertama diakses. Sebelumnya instance dibuat di module scope, sehingga
 * sekadar `import ... from "@crediblemark/buayar"` sudah membaca environment,
 * mendeteksi provider, dan mencetak peringatan autodetect — efek samping yang tidak
 * diinginkan saat import. Peringatan itu tetap muncul untuk pemakaian nyata
 * (mis. `new Buayar()` tanpa provider eksplisit saat environment sudah terisi).
 *
 * Catatan: karena target Proxy adalah objek kosong, `Object.keys(buayar)` tidak
 * mengembalikan anggota instance. Gunakan `new Buayar()` bila perlu enumerasi.
 */
export const buayar: Buayar = new Proxy({} as Buayar, {
  get(_target, property) {
    const instance = getDefaultBuayar();
    const value = Reflect.get(instance, property, instance);
    // Method dibind ke instance nyata agar aman dipakai setelah di-destructure.
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getDefaultBuayar(), property, value);
  },
  has(_target, property) {
    return property in getDefaultBuayar();
  },
  getPrototypeOf() {
    // Menjaga `buayar instanceof Buayar` tetap benar.
    return Buayar.prototype;
  },
});
