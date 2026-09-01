import { ProviderConfig } from "../types";
import { generateOyHeaders } from "../providers/oy/signature";

export class OyClient {
  private username: string;
  private apiKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; username?: string; clientKey?: string; apiKey?: string; serverKey?: string; secretKey?: string; sandbox?: boolean }) {
    this.username = config.clientKey || (config as any).username || config.merchantCode || "";
    this.apiKey = config.apiKey || (config as any).serverKey || (config as any).secretKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://api-stg.oyindonesia.com/api"
      : "https://api.oyindonesia.com/api";
  }

  /**
   * Helper HTTP Request ke OY! Bisnis API
   */
  async request(method: "GET" | "POST", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = generateOyHeaders(this.username, this.apiKey);

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
      throw new Error(data?.status?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek status transaksi pembayaran
   */
  async checkTransaction(partnerTxId: string): Promise<any> {
    return this.request("GET", `/payment-checkout/status?partner_tx_id=${encodeURIComponent(partnerTxId)}&send_callback=false`);
  }

  /**
   * Cek saldo akun OY! Bisnis
   */
  async checkBalance(): Promise<any> {
    return this.request("GET", "/balance");
  }

  /**
   * Kirim dana / Transfer uang (Disbursement / Remittance)
   */
  async remit(params: {
    recipientBank: string;
    recipientAccount: string;
    amount: number;
    note?: string;
    partnerTrxId: string;
  }): Promise<any> {
    return this.request("POST", "/remit", {
      recipient_bank: params.recipientBank,
      recipient_account: params.recipientAccount,
      amount: params.amount,
      note: params.note || "Disbursement",
      partner_trx_id: params.partnerTrxId,
    });
  }
}
