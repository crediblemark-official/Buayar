import { ProviderConfig } from "../types";
import { generateFinpaySignature } from "../providers/finpay/signature";

export class FinpayClient {
  private merchantId: string;
  private merchantKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; merchantId?: string; apiKey?: string; serverKey?: string; secretKey?: string; sandbox?: boolean }) {
    this.merchantId = config.merchantCode || (config as any).merchantId || "";
    this.merchantKey = config.apiKey || (config as any).merchantKey || (config as any).serverKey || (config as any).secretKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://sandbox.finpay.co.id"
      : "https://api.finpay.id";
  }

  /**
   * Helper HTTP Request ke Finpay API
   */
  async request(endpoint: string, payload: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(data?.response_desc || data?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek status transaksi pembayaran Finpay
   */
  async checkTransaction(orderId: string): Promise<any> {
    const signature = generateFinpaySignature(this.merchantId, orderId, 0, this.merchantKey);
    return this.request("/pg/payment/status", {
      merchant_id: this.merchantId,
      order_id: orderId,
      signature,
    });
  }
}
