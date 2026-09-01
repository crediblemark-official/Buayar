import { ProviderConfig } from "../types";
import { getXenditAuthHeader } from "../providers/xendit/signature";

export interface XenditDisbursementParams {
  externalId: string;
  bankCode: string;
  accountHolderName: string;
  accountNumber: string;
  description: string;
  amount: number;
}

export class XenditClient {
  private apiKey: string;

  constructor(config: ProviderConfig | { apiKey?: string; secretKey?: string }) {
    this.apiKey = config.apiKey || (config as any).secretKey || (config as any).serverKey || "";
  }

  private getBaseUrl(): string {
    return "https://api.xendit.co";
  }

  /**
   * HTTP Request helper bertanda tangan Basic Auth Xendit
   */
  async request(method: "GET" | "POST" | "PATCH", endpoint: string, body?: any): Promise<any> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.getBaseUrl()}${endpoint}`;
    const authHeader = getXenditAuthHeader(this.apiKey);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": authHeader,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if ((method === "POST" || method === "PATCH") && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(data?.message || data?.error_code || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek Saldo Merchant Xendit
   */
  async checkBalance(accountType: "CASH" | "HOLDING" | "TAX" = "CASH"): Promise<{ success: boolean; balance?: number; rawResponse: any; error?: string }> {
    try {
      const data = await this.request("GET", `/balance?account_type=${accountType}`);
      return {
        success: data.balance !== undefined,
        balance: data.balance !== undefined ? Number(data.balance) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        rawResponse: null,
        error: e.message || "Failed to check Xendit balance",
      };
    }
  }

  /**
   * Memaksa sebuah invoice kadaluwarsa (Expire Invoice)
   */
  async expireInvoice(invoiceId: string): Promise<any> {
    return this.request("POST", `/invoices/${invoiceId}/expire!`);
  }

  /**
   * Eksekusi transfer dana / disbursement
   */
  async createDisbursement(params: XenditDisbursementParams): Promise<any> {
    return this.request("POST", "/disbursements", {
      external_id: params.externalId,
      bank_code: params.bankCode,
      account_holder_name: params.accountHolderName,
      account_number: params.accountNumber,
      description: params.description,
      amount: Math.round(params.amount),
    });
  }
}
