import { ProviderConfig } from "../types";
import { generatePrismalinkSignature } from "../providers/prismalink/signature";

export class PrismalinkClient {
  private merchantId: string;
  private secretKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; merchantId?: string; apiKey?: string; secretKey?: string; sandbox?: boolean }) {
    this.merchantId = config.merchantCode || (config as any).merchantId || "";
    this.secretKey = config.apiKey || (config as any).secretKey || (config as any).serverKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://sandbox-api.prismalink.co.id"
      : "https://api.prismalink.co.id";
  }

  /**
   * Helper HTTP Request ke API PrismaLink
   */
  async request(method: "GET" | "POST", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };

    if (method === "POST" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(data?.message || data?.response_message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek status transaksi pesanan di PrismaLink
   */
  async checkTransaction(orderId: string): Promise<any> {
    const signature = generatePrismalinkSignature(this.merchantId, orderId, 0, this.secretKey);
    return this.request("POST", "/api/v1/payment/status", {
      merchant_id: this.merchantId,
      order_id: orderId,
      signature,
    });
  }
}
