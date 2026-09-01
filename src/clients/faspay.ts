import { ProviderConfig } from "../types";
import { generateFaspaySignature } from "../providers/faspay/signature";

export class FaspayClient {
  private merchantId: string;
  private userId: string;
  private password: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; merchantId?: string; userId?: string; clientKey?: string; apiKey?: string; password?: string; sandbox?: boolean }) {
    this.merchantId = config.merchantCode || (config as any).merchantId || "";
    this.userId = config.clientKey || (config as any).userId || (config as any).extra?.userId || this.merchantId;
    this.password = config.apiKey || (config as any).password || (config as any).serverKey || (config as any).secretKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://sandbox.faspay.co.id"
      : "https://web.faspay.co.id";
  }

  /**
   * Helper HTTP Request ke endpoint Faspay
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
      throw new Error(data?.response_desc || data?.response_message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek status pembayaran tagihan Faspay
   */
  async checkTransaction(billNo: string): Promise<any> {
    const signature = generateFaspaySignature(this.userId, this.password, billNo);
    return this.request("/cvr/100004/10", {
      request: "Inquiry Payment Status",
      merchant_id: this.merchantId,
      bill_no: billNo,
      signature,
    });
  }

  /**
   * Batalkan tagihan pembayaran Faspay
   */
  async cancelTransaction(billNo: string, paymentChannel: string): Promise<any> {
    const signature = generateFaspaySignature(this.userId, this.password, billNo);
    return this.request("/cvr/100005/10", {
      request: "Cancel Transaction",
      merchant_id: this.merchantId,
      bill_no: billNo,
      payment_channel: paymentChannel,
      signature,
    });
  }
}
