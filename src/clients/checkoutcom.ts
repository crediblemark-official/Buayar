import { ProviderConfig } from "../types";

export class CheckoutComClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox !== false
      ? "https://api.sandbox.checkout.com"
      : "https://api.checkout.com";
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.config.apiKey || this.config.secretKey || ""}`,
      "Content-Type": "application/json",
    };
  }

  /** Ambil detail payment berdasarkan Payment ID */
  async getPaymentDetails(paymentId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Void (batalkan) payment yang belum di-capture */
  async voidPayment(paymentId: string, reference?: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}/voids`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ reference }),
    });
    return response.json();
  }

  /** Refund payment yang sudah di-capture */
  async refundPayment(paymentId: string, amount?: number, reference?: string): Promise<any> {
    const body: any = { reference };
    if (amount) body.amount = amount;
    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    return response.json();
  }

  /** Cek saldo merchant di Checkout.com */
  async checkBalance(): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/balances`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Ambil daftar payment links */
  async listPaymentLinks(): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/payment-links`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }
}
