export interface CreateInvoiceParams {
  orderId: string;
  amount: number;
  productDetails: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  returnUrl: string;
  callbackUrl: string;
}

export interface InvoiceResponse {
  success: boolean;
  paymentUrl?: string;
  reference?: string;
  rawResponse: any;
  error?: string;
}

export interface VerifyCallbackResult {
  isValid: boolean;
  orderId: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  rawPayload: any;
}

export interface ProviderConfig {
  merchantCode: string;
  apiKey: string;
  sandbox: boolean;
}
