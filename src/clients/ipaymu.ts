import { ProviderConfig } from "../types";
import { generateIpaymuSignature } from "../providers/ipaymu/signature";

export class IpaymuClient {
  private va: string;
  private apiKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; merchantId?: string; apiKey?: string; sandbox?: boolean }) {
    this.va = config.merchantCode || (config as any).merchantId || "";
    this.apiKey = (config as any).apiKey || (config as any).serverKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://sandbox.ipaymu.com/api/v2"
      : "https://my.ipaymu.com/api/v2";
  }

  /**
   * Helper request bertanda tangan iPaymu v2
   */
  async request(method: "GET" | "POST", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const { signature, timestamp } = generateIpaymuSignature(method, this.va, this.apiKey, body);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "va": this.va,
      "signature": signature,
      "timestamp": timestamp,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
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
      throw new Error(data?.Message || data?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek saldo merchant iPaymu
   */
  async checkBalance(): Promise<{ success: boolean; balance?: number; rawResponse: any; error?: string }> {
    try {
      const payload = { account: this.va };
      const data = await this.request("POST", "/balance", payload);

      const success = data.Status === 200 || data.status === 200;
      const balance = data.Data?.MerchantBalance ? Number(data.Data.MerchantBalance) : undefined;

      return {
        success,
        balance,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        rawResponse: null,
        error: e.message || "Failed to check iPaymu balance",
      };
    }
  }

  /**
   * Cek detail transaksi iPaymu
   */
  async checkTransaction(transactionId: string): Promise<any> {
    return this.request("POST", "/transaction", { transactionId });
  }
}
