import { BasePaymentProvider } from "../providers/base";
import { DuitkuProvider } from "../providers/duitku/provider";
import { MidtransProvider } from "../providers/midtrans/provider";
import { IpaymuProvider } from "../providers/ipaymu/provider";
import { XenditProvider } from "../providers/xendit/provider";
import { DokuProvider } from "../providers/doku/provider";
import { PrismalinkProvider } from "../providers/prismalink/provider";
import { FaspayProvider } from "../providers/faspay/provider";
import { FinpayProvider } from "../providers/finpay/provider";
import { NicepayProvider } from "../providers/nicepay/provider";
import { OyProvider } from "../providers/oy/provider";
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
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
} from "../types";

export class PaymentManager {
  private providers: Map<string, BasePaymentProvider> = new Map();

  constructor() {
    // Register default providers
    this.registerProvider(new DuitkuProvider());
    this.registerProvider(new MidtransProvider());
    this.registerProvider(new IpaymuProvider());
    this.registerProvider(new XenditProvider());
    this.registerProvider(new DokuProvider());
    this.registerProvider(new PrismalinkProvider());
    this.registerProvider(new FaspayProvider());
    this.registerProvider(new FinpayProvider());
    this.registerProvider(new NicepayProvider());
    this.registerProvider(new OyProvider());
  }

  registerProvider(provider: BasePaymentProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  getProvider(name: string): BasePaymentProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Payment provider '${name}' is not registered`);
    }
    return provider;
  }

  getMidtransProvider(): MidtransProvider {
    return this.getProvider("midtrans") as MidtransProvider;
  }

  getMidtransClient(config: ProviderConfig): MidtransClient {
    return new MidtransClient(config);
  }

  getDuitkuProvider(): DuitkuProvider {
    return this.getProvider("duitku") as DuitkuProvider;
  }

  getDuitkuClient(config: ProviderConfig): DuitkuClient {
    return new DuitkuClient(config);
  }

  getIpaymuProvider(): IpaymuProvider {
    return this.getProvider("ipaymu") as IpaymuProvider;
  }

  getIpaymuClient(config: ProviderConfig): IpaymuClient {
    return new IpaymuClient(config);
  }

  getXenditProvider(): XenditProvider {
    return this.getProvider("xendit") as XenditProvider;
  }

  getXenditClient(config: ProviderConfig): XenditClient {
    return new XenditClient(config);
  }

  getDokuProvider(): DokuProvider {
    return this.getProvider("doku") as DokuProvider;
  }

  getDokuClient(config: ProviderConfig): DokuClient {
    return new DokuClient(config);
  }

  getPrismalinkProvider(): PrismalinkProvider {
    return this.getProvider("prismalink") as PrismalinkProvider;
  }

  getPrismalinkClient(config: ProviderConfig): PrismalinkClient {
    return new PrismalinkClient(config);
  }

  getFaspayProvider(): FaspayProvider {
    return this.getProvider("faspay") as FaspayProvider;
  }

  getFaspayClient(config: ProviderConfig): FaspayClient {
    return new FaspayClient(config);
  }

  getFinpayProvider(): FinpayProvider {
    return this.getProvider("finpay") as FinpayProvider;
  }

  getFinpayClient(config: ProviderConfig): FinpayClient {
    return new FinpayClient(config);
  }

  getNicepayProvider(): NicepayProvider {
    return this.getProvider("nicepay") as NicepayProvider;
  }

  getNicepayClient(config: ProviderConfig): NicepayClient {
    return new NicepayClient(config);
  }

  getOyProvider(): OyProvider {
    return this.getProvider("oy") as OyProvider;
  }

  getOyClient(config: ProviderConfig): OyClient {
    return new OyClient(config);
  }

  async createInvoice(
    providerName: string,
    params: CreateInvoiceParams,
    config: ProviderConfig
  ): Promise<InvoiceResponse> {
    const provider = this.getProvider(providerName);
    return provider.createInvoice(params, config);
  }

  async verifyCallback(
    providerName: string,
    body: any,
    config: ProviderConfig
  ): Promise<VerifyCallbackResult> {
    const provider = this.getProvider(providerName);
    return provider.verifyCallback(body, config);
  }

  async getPaymentMethods(
    providerName: string,
    params: GetPaymentMethodsParams,
    config: ProviderConfig
  ): Promise<GetPaymentMethodsResult> {
    const provider = this.getProvider(providerName);
    return provider.getPaymentMethods(params, config);
  }

  async checkTransaction(
    providerName: string,
    params: CheckTransactionParams,
    config: ProviderConfig
  ): Promise<CheckTransactionResult> {
    const provider = this.getProvider(providerName);
    return provider.checkTransaction(params, config);
  }

  async probePaymentMethods(
    providerName: string,
    config: ProviderConfig
  ): Promise<{ success: boolean; enabled: string[]; error?: string }> {
    const provider = this.getProvider(providerName);
    if (provider.probePaymentMethods) {
      return provider.probePaymentMethods(config);
    }
    return { success: false, enabled: [], error: `Provider '${providerName}' does not support payment methods probing` };
  }
}

export const paymentManager = new PaymentManager();
