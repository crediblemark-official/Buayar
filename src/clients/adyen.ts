import { ProviderConfig } from "../types";

export class AdyenClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    if (this.config.sandbox === false) {
      const prefix = this.config.extra?.liveUrlPrefix || this.config.projectId || "";
      if (prefix) return `https://${prefix}-checkout-live.adyenpayments.com/checkout`;
    }
    return "https://checkout-test.adyen.com";
  }

  private buildHeaders(): Record<string, string> {
    return {
      "X-API-Key": this.config.apiKey || this.config.secretKey || "",
      "Content-Type": "application/json",
    };
  }

  /** Ambil detail payment berdasarkan PSP Reference */
  async getPaymentDetails(pspReference: string): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v68/payments/${pspReference}`, {
      method: "GET", headers: this.buildHeaders(),
    });
    return response.json();
  }

  /** Batalkan payment (sebelum capture) */
  async cancelPayment(pspReference: string, merchantAccount?: string): Promise<any> {
    const account = merchantAccount || this.config.merchantCode || this.config.merchantId || "";
    const response = await fetch(`${this.getBaseUrl()}/v68/payments/${pspReference}/cancels`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ merchantAccount: account }),
    });
    return response.json();
  }

  /** Refund payment yang sudah di-capture */
  async refundPayment(pspReference: string, amount: number, currency: string, merchantAccount?: string): Promise<any> {
    const account = merchantAccount || this.config.merchantCode || this.config.merchantId || "";
    const response = await fetch(`${this.getBaseUrl()}/v68/payments/${pspReference}/refunds`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        merchantAccount: account,
        amount: { value: amount, currency },
      }),
    });
    return response.json();
  }

  /** Capture authorized payment */
  async capturePayment(pspReference: string, amount: number, currency: string, merchantAccount?: string): Promise<any> {
    const account = merchantAccount || this.config.merchantCode || this.config.merchantId || "";
    const response = await fetch(`${this.getBaseUrl()}/v68/payments/${pspReference}/captures`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({
        merchantAccount: account,
        amount: { value: amount, currency },
      }),
    });
    return response.json();
  }

  /** Ambil daftar payment methods yang tersedia */
  async getAvailablePaymentMethods(merchantAccount: string, countryCode: string, currency: string, amount: number): Promise<any> {
    const response = await fetch(`${this.getBaseUrl()}/v68/paymentMethods`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ merchantAccount, countryCode, channel: "Web", amount: { value: amount, currency } }),
    });
    return response.json();
  }
}
