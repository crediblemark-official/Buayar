import { ProviderConfig } from "../types";

export class SquareClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox !== false
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Authorization": `Bearer ${this.config.apiKey || this.config.secretKey || ""}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-01-17",
    };
  }

  /** Ambil detail payment Square */
  async getPayment(paymentId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v2/payments/${paymentId}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Batalkan payment Square */
  async cancelPayment(paymentId: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v2/payments/${paymentId}/cancel`, {
      method: "POST", headers: this.buildHeaders(), body: "{}",
    });
    return response.json();
  }

  /** Refund payment Square */
  async refundPayment(paymentId: string, amount: number, currency: string, idempotencyKey: string, reason?: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v2/refunds`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        payment_id: paymentId,
        amount_money: { amount, currency },
        reason,
      }),
    });
    return response.json();
  }

  /** Ambil saldo location Square */
  async retrieveBalance(locationId?: string): Promise<any> {
    const id = locationId || this.config.extra?.locationId || this.config.projectId || "";
    const response = await fetch(`${this.getBaseUrl()}/v2/locations/${id}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** List semua locations merchant */
  async listLocations(): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v2/locations`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }
}
