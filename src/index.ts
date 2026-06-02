import { BasePaymentProvider } from "./providers/base";
import { DuitkuProvider } from "./providers/duitku";
import { MidtransProvider } from "./providers/midtrans";
import { MidtransClient } from "./clients/midtrans";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
} from "./types";

export * from "./types";
export * from "./providers/base";
export * from "./providers/duitku";
export * from "./providers/midtrans";
export * from "./clients/midtrans";

export class PaymentManager {
  private providers: Map<string, BasePaymentProvider> = new Map();

  constructor() {
    // Register default providers
    this.registerProvider(new DuitkuProvider());
    this.registerProvider(new MidtransProvider());
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

export { getPaymentMethodCategory } from "./utils";

