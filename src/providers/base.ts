import { CreateInvoiceParams, InvoiceResponse, VerifyCallbackResult, ProviderConfig } from "../types";

export abstract class BasePaymentProvider {
  abstract readonly name: string;
  abstract createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse>;
  abstract verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult>;
}
