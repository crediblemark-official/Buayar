import { BasePaymentProvider } from "./providers/base";
import { DuitkuProvider } from "./providers/duitku";
import { CreateInvoiceParams, InvoiceResponse, VerifyCallbackResult, ProviderConfig } from "./types";

export * from "./types";
export * from "./providers/base";
export * from "./providers/duitku";

export class PaymentManager {
  private providers: Map<string, BasePaymentProvider> = new Map();

  constructor() {
    // Register default providers
    this.registerProvider(new DuitkuProvider());
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
}

export const paymentManager = new PaymentManager();
