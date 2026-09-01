import { ProviderConfig } from "../types";
import { generateDokuHeaders } from "../providers/doku/signature";

export class DokuClient {
  private clientId: string;
  private secretKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; clientId?: string; apiKey?: string; secretKey?: string; sandbox?: boolean }) {
    this.clientId = config.merchantCode || (config as any).clientId || (config as any).clientKey || "";
    this.secretKey = config.apiKey || (config as any).secretKey || (config as any).serverKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://api-sandbox.doku.com"
      : "https://api.doku.com";
  }

  /**
   * Helper request bertanda tangan DOKU Jokul v2
   */
  async request(method: "GET" | "POST", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = generateDokuHeaders(this.clientId, this.secretKey, endpoint, body);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
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
      throw new Error(data?.error?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek status transaksi pesanan di DOKU
   */
  async checkTransaction(invoiceNumber: string): Promise<any> {
    return this.request("GET", `/orders/v1/status/${invoiceNumber}`);
  }
}
