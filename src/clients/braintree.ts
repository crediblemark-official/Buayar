import { ProviderConfig } from "../types";
import { buildBraintreeBasicAuth } from "../providers/braintree/signature";

export class BraintreeClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    const merchantId = this.config.merchantCode || this.config.merchantId || "";
    const base = this.config.sandbox !== false
      ? "https://api.sandbox.braintreegateway.com"
      : "https://api.braintreegateway.com";
    return `${base}/merchants/${merchantId}`;
  }

  private buildHeaders(): Record<string, string> {
    const publicKey = this.config.clientKey || this.config.extra?.publicKey || "";
    const privateKey = this.config.apiKey || this.config.secretKey || "";
    return {
      "Authorization": `Basic ${buildBraintreeBasicAuth(publicKey, privateKey)}`,
      "Content-Type": "application/json",
      "Braintree-Version": "2019-01-01",
    };
  }

  /** Generate Client Token untuk frontend Drop-in UI */
  async getClientToken(customerId?: string): Promise<string> {
    const body: any = {};
    if (customerId) body.client_token = { customer_id: customerId };
    const response = await fetch(`${this.getBaseUrl()}/client_token`, {
      method: "POST", headers: this.buildHeaders(), body: JSON.stringify(body),
    });
    const data = await response.json();
    return data.clientToken || "";
  }

  /** Ambil detail transaction */
  async findTransaction(transactionId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/transactions/${transactionId}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Refund transaction Braintree */
  async refundTransaction(transactionId: string, amount?: number): Promise<any> {
    const body: any = {};
    if (amount) body.transaction = { amount: (amount / 100).toFixed(2) };
    const response = await fetch(`${this.getBaseUrl()}/transactions/${transactionId}/refund`, {
      method: "POST", headers: this.buildHeaders(), body: JSON.stringify(body),
    });
    return response.json();
  }

  /** Void (batalkan) transaction sebelum settlement */
  async voidTransaction(transactionId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/transactions/${transactionId}/void`, {
      method: "PUT", headers: this.buildHeaders(), body: "{}",
    });
    return response.json();
  }
}
