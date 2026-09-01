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
import { BasePaymentProvider } from "../providers/base";
import { resolveConfigFromEnv } from "./config";

export { resolveConfigFromEnv };

/**
 * Buayar - Unified Payment Gateway Client
 * 
 * Antarmuka tingkat tinggi untuk membuat transaksi, query channel pembayaran,
 * pengecekan status, dan verifikasi webhook universal tanpa perlu rombak kode.
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
   * Dapatkan nama provider aktif ('midtrans' | 'duitku' | 'ipaymu' | 'xendit' | 'doku' | 'prismalink' | 'faspay' | 'finpay' | 'nicepay' | 'oy' | 'stripe' | ...)
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
      const sigHeader = headers["stripe-signature"] || headers["Stripe-Signature"];
      if (sigHeader) {
        if (!mergedConfig.extra) mergedConfig.extra = {};
        mergedConfig.extra.signatureHeader = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      }
    }

    let providerName = (configOverride as any)?.provider || this.provider;

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
      } else if (payload.external_id || payload.event?.startsWith("payment.") || payload.event?.startsWith("qr.") || payload.data?.reference_id) {
        providerName = "xendit";
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

  getMidtransClient(configOverride?: Partial<ProviderConfig>): MidtransClient {
    return new MidtransClient({
      ...this.config,
      ...configOverride,
    });
  }

  getDuitkuClient(configOverride?: Partial<ProviderConfig>): DuitkuClient {
    return new DuitkuClient({
      ...this.config,
      ...configOverride,
    });
  }

  getIpaymuClient(configOverride?: Partial<ProviderConfig>): IpaymuClient {
    return new IpaymuClient({
      ...this.config,
      ...configOverride,
    });
  }

  getXenditClient(configOverride?: Partial<ProviderConfig>): XenditClient {
    return new XenditClient({
      ...this.config,
      ...configOverride,
    });
  }

  getDokuClient(configOverride?: Partial<ProviderConfig>): DokuClient {
    return new DokuClient({
      ...this.config,
      ...configOverride,
    });
  }

  getPrismalinkClient(configOverride?: Partial<ProviderConfig>): PrismalinkClient {
    return new PrismalinkClient({
      ...this.config,
      ...configOverride,
    });
  }

  getFaspayClient(configOverride?: Partial<ProviderConfig>): FaspayClient {
    return new FaspayClient({
      ...this.config,
      ...configOverride,
    });
  }

  getFinpayClient(configOverride?: Partial<ProviderConfig>): FinpayClient {
    return new FinpayClient({
      ...this.config,
      ...configOverride,
    });
  }

  getNicepayClient(configOverride?: Partial<ProviderConfig>): NicepayClient {
    return new NicepayClient({
      ...this.config,
      ...configOverride,
    });
  }

  getOyClient(configOverride?: Partial<ProviderConfig>): OyClient {
    return new OyClient({
      ...this.config,
      ...configOverride,
    });
  }

  getStripeClient(configOverride?: Partial<ProviderConfig>): StripeClient {
    return new StripeClient({
      ...this.config,
      ...configOverride,
    });
  }
}

export const buayar = new Buayar();
