import { ProviderConfig } from "../types";

export interface SumopodCreatePaymentParams {
  order_id: string;
  amount: number;
  currency?: string;
  expires_in_hours?: number;
  success_return_url?: string;
  cancel_return_url?: string;
  payment_method_type_code?: string;
  [key: string]: any;
}

export interface SumopodPaymentResponse {
  payment_id: string;
  order_id: string;
  amount: number;
  fee?: number;
  net_amount?: number;
  payment_link_url: string;
  status: string;
  expires_at?: string;
  [key: string]: any;
}

export class SumopodClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ProviderConfig | { apiKey?: string; customBaseUrl?: string; sandbox?: boolean }) {
    this.apiKey =
      config.apiKey ||
      (config as any).secretKey ||
      (config as any).serverKey ||
      "";
    this.baseUrl = config.customBaseUrl || (config.sandbox ? "https://api-pay-sandbox.sumopod.com" : "https://api-pay.sumopod.com");
  }

  /**
   * HTTP request helper dengan header autentikasi X-Api-Key SumoPod
   */
  async request(method: "GET" | "POST", endpoint: string, body?: any): Promise<any> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Api-Key": this.apiKey,
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
    } catch {}

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          `HTTP error! Status: ${response.status} - ${text}`
      );
    }

    return data;
  }

  /**
   * Buat payment link / sesi pembayaran baru di SumoPod
   */
  async createPayment(params: SumopodCreatePaymentParams): Promise<SumopodPaymentResponse> {
    return this.request("POST", "/api/v1/payments", {
      currency: "IDR",
      payment_method_type_code: "QRIS",
      ...params,
    });
  }

  /**
   * Ambil detail status pembayaran berdasarkan ID pembayaran
   */
  async getPayment(paymentId: string): Promise<SumopodPaymentResponse> {
    return this.request("GET", `/api/v1/payments/${encodeURIComponent(paymentId)}`);
  }
}
