import { ProviderConfig } from "../types";
import { serializeStripeParams } from "../providers/stripe/signature";

export class StripeClient {
  private secretKey: string;

  constructor(config: ProviderConfig | { apiKey?: string; serverKey?: string; secretKey?: string }) {
    this.secretKey = config.apiKey || (config as any).serverKey || (config as any).secretKey || "";
  }

  private getBaseUrl(): string {
    return "https://api.stripe.com/v1";
  }

  /**
   * Helper HTTP Request ke Stripe API
   */
  async request(method: "GET" | "POST" | "DELETE", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.secretKey}`,
      "Accept": "application/json",
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === "POST" && body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      fetchOptions.body = serializeStripeParams(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok || data?.error) {
      throw new Error(data?.error?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Ambil detail Checkout Session
   */
  async retrieveCheckoutSession(sessionId: string): Promise<any> {
    return this.request("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  }

  /**
   * Ambil detail Payment Intent
   */
  async retrievePaymentIntent(paymentIntentId: string): Promise<any> {
    return this.request("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}`);
  }

  /**
   * Cek saldo akun Stripe (Balance)
   */
  async checkBalance(): Promise<any> {
    return this.request("GET", "/balance");
  }

  /**
   * Buat refund dana
   */
  async createRefund(paymentIntentId: string, amount?: number): Promise<any> {
    const payload: any = {
      payment_intent: paymentIntentId,
    };
    if (amount) {
      payload.amount = Math.round(amount);
    }
    return this.request("POST", "/refunds", payload);
  }
}
