import { ProviderConfig } from "../types";
import { buildTwoCheckoutAuth } from "../providers/twocheckout/signature";

export class TwoCheckoutClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox !== false
      ? "https://api.sandbox.2checkout.com/rest"
      : "https://api.2checkout.com/rest";
  }

  private buildHeaders(): Record<string, string> {
    const merchantCode = this.config.merchantCode || this.config.merchantId || "";
    const secretKey = this.config.apiKey || this.config.secretKey || "";
    const { header } = buildTwoCheckoutAuth(merchantCode, secretKey);
    return {
      "X-Avangate-Authentication": header,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
  }

  /** Ambil detail order 2Checkout berdasarkan Reference Number */
  async getOrder(refNo: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/6.0/orders/${refNo}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Refund order 2Checkout */
  async refundOrder(refNo: string, amount: number, comment?: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/6.0/orders/${refNo}/refund`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ amount, comment: comment || "Refund", reason: "NOT_SATISFIED" }),
    });
    return response.json();
  }

  /** Ambil detail subscription */
  async getSubscription(subscriptionRef: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/6.0/subscriptions/${subscriptionRef}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** List semua orders merchant */
  async listOrders(page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams({
      Pagination: JSON.stringify({ Page: page || 1, Limit: limit || 10 }),
    });
    const response = await fetch(`${this.getBaseUrl()}/6.0/orders?${params}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }
}
