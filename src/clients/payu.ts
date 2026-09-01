import { ProviderConfig } from "../types";
import { buildPayuBasicAuth } from "../providers/payu/signature";

export class PayuClient {
  private config: ProviderConfig;
  private accessToken: string | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox !== false
      ? "https://secure.snd.payu.com"
      : "https://secure.payu.com";
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const clientId = this.config.extra?.oauthClientId || this.config.clientKey || "";
    const clientSecret = this.config.extra?.oauthClientSecret || this.config.apiKey || this.config.secretKey || "";

    const response = await fetch(`${this.getBaseUrl()}/pl/standard/user/oauth/authorize`, {
      method: "POST",
      headers: { "Authorization": `Basic ${buildPayuBasicAuth(clientId, clientSecret)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });

    const data = await response.json();
    if (!data?.access_token) throw new Error("Failed to get PayU access token");
    this.accessToken = data.access_token;
    return this.accessToken!;
  }

  /** Ambil detail order PayU */
  async getOrder(orderId: string): Promise<any> {
    const token = await this.getToken();
    const response = await fetch(`${this.getBaseUrl()}/api/v2_1/orders/${orderId}`, {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return response.json();
  }

  /** Batalkan order PayU */
  async cancelOrder(orderId: string): Promise<any> {
    const token = await this.getToken();
    const response = await fetch(`${this.getBaseUrl()}/api/v2_1/orders/${orderId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return response.json();
  }

  /** Refund order PayU */
  async refundOrder(orderId: string, amount?: number, description?: string): Promise<any> {
    const token = await this.getToken();
    const body: any = { refund: { description: description || "Refund" } };
    if (amount) body.refund.amount = amount;

    const response = await fetch(`${this.getBaseUrl()}/api/v2_1/orders/${orderId}/refunds`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }
}
