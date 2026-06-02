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

export abstract class BasePaymentProvider {
  abstract readonly name: string;
  abstract createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse>;
  abstract verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult>;
  abstract getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult>;
  abstract checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult>;
  
  /** Probe/discover which payment methods are actually enabled/active for the merchant */
  async probePaymentMethods?(config: ProviderConfig): Promise<{ success: boolean; enabled: string[]; error?: string }>;
}

