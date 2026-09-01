import { ProviderConfig } from "../types";
import { buildRazorpayBasicAuth } from "../providers/razorpay/signature";

export class RazorpayClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return "https://api.razorpay.com/v1";
  }

  private buildHeaders(): Record<string, string> {
    const keyId = this.config.clientKey || this.config.merchantCode || this.config.merchantId || "";
    const keySecret = this.config.apiKey || this.config.secretKey || "";
    return {
      "Authorization": `Basic ${buildRazorpayBasicAuth(keyId, keySecret)}`,
      "Content-Type": "application/json",
    };
  }

  /** Ambil detail payment */
  async fetchPayment(paymentId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Capture authorized payment */
  async capturePayment(paymentId: string, amount: number, currency?: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}/capture`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ amount, currency: currency || "INR" }),
    });
    return response.json();
  }

  /** Buat refund untuk payment */
  async createRefund(paymentId: string, amount?: number, notes?: Record<string, string>): Promise<any> {
    const body: any = { notes };
    if (amount) body.amount = amount;
    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}/refund`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    return response.json();
  }

  /** Cek saldo akun Razorpay */
  async checkBalance(): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/balance`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Ambil daftar semua payment */
  async listPayments(from?: number, to?: number, count?: number): Promise<any> {
    const params = new URLSearchParams();
    if (from) params.set("from", from.toString());
    if (to) params.set("to", to.toString());
    if (count) params.set("count", count.toString());

    const response = await fetch(`${this.getBaseUrl()}/payments?${params}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }
}
