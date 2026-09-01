import { ProviderConfig } from "../types";
import { sha256 } from "../utils/crypto";
import {
  getDuitkuPaymentMethodsSignature,
  getDuitkuStatusSignatures,
} from "../providers/duitku/signature";

export interface DuitkuDisbursementParams {
  bankCode: string;
  bankAccount: string;
  amount: number;
  purpose: string;
  merchantOrderId: string;
  senderName?: string;
  senderPhone?: string;
  callbackUrl?: string;
}

export class DuitkuClient {
  private merchantCode: string;
  private apiKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; apiKey?: string; sandbox?: boolean }) {
    this.merchantCode = config.merchantCode || "";
    this.apiKey = (config as any).apiKey || (config as any).serverKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getPassportBaseUrl(): string {
    return this.sandbox
      ? "https://sandbox.duitku.com/webapi"
      : "https://passport.duitku.com/webapi";
  }

  private getApiBaseUrl(): string {
    return this.sandbox
      ? "https://api-sandbox.duitku.com"
      : "https://api-prod.duitku.com";
  }

  /**
   * Request helper generic dengan kalkulasi signature Duitku otomatis
   */
  async request(
    method: "GET" | "POST",
    endpoint: string,
    body: any = {},
    options?: { baseUrl?: "passport" | "api"; customHeaders?: Record<string, string> }
  ): Promise<any> {
    const baseUrl = options?.baseUrl === "api" ? this.getApiBaseUrl() : this.getPassportBaseUrl();
    const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

    const timestamp = Date.now().toString();
    const headerSignature = sha256(this.merchantCode + timestamp + this.apiKey);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-duitku-signature": headerSignature,
      "x-duitku-timestamp": timestamp,
      "x-duitku-merchantcode": this.merchantCode,
      ...options?.customHeaders,
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
      throw new Error(data?.Message || data?.statusMessage || data?.responseMessage || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data || text;
  }

  // ─── TRANSACTIONS & PAYMENT METHODS ──────────────────────────────────────────

  /**
   * Cek status transaksi pembayaran berdasarkan merchant order ID
   */
  async checkTransaction(merchantOrderId: string): Promise<any> {
    const { bodySignature } = getDuitkuStatusSignatures(
      this.merchantCode,
      merchantOrderId,
      this.apiKey
    );

    return this.request(
      "POST",
      "/api/merchant/transactionStatus",
      {
        merchantCode: this.merchantCode,
        merchantOrderId,
        signature: bodySignature,
      },
      { baseUrl: "api" }
    );
  }

  /**
   * Ambil daftar channel pembayaran aktif dan kalkulasi fee dinamis
   */
  async getPaymentMethods(amount: number = 10000): Promise<any> {
    const integerAmount = Math.round(amount);
    const datetime = new Date().toISOString().replace("T", " ").slice(0, 19);
    const signature = getDuitkuPaymentMethodsSignature(this.merchantCode, integerAmount, datetime, this.apiKey);

    return this.request("POST", "/api/merchant/paymentmethod/getpaymentmethod", {
      merchantcode: this.merchantCode,
      amount: integerAmount,
      datetime,
      signature,
    });
  }

  // ─── DISBURSEMENT & BALANCE INQUIRY ──────────────────────────────────────────

  /**
   * Cek saldo merchant (Balance Inquiry)
   */
  async checkBalance(): Promise<{ success: boolean; balance?: number; rawResponse: any; error?: string }> {
    const timestamp = Date.now().toString();
    const signature = sha256(this.merchantCode + timestamp + this.apiKey);

    try {
      const data = await this.request(
        "POST",
        "/api/merchant/checkBalance",
        {
          merchantCode: this.merchantCode,
          signature,
        },
        { baseUrl: "api" }
      );

      return {
        success: data.responseCode === "00" || data.statusCode === "00",
        balance: data.balance ? Number(data.balance) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        rawResponse: null,
        error: e.message || "Failed to check Duitku merchant balance",
      };
    }
  }

  /**
   * Mengambil daftar bank yang didukung untuk transfer / penarikan dana
   */
  async listBanks(): Promise<any> {
    const timestamp = Date.now().toString();
    const signature = sha256(this.merchantCode + timestamp + this.apiKey);

    return this.request(
      "POST",
      "/api/disbursement/listBank",
      {
        merchantCode: this.merchantCode,
        signature,
      },
      { baseUrl: "api" }
    );
  }

  /**
   * Validasi nama pemilik rekening bank sebelum eksekusi transfer (Bank Account Inquiry)
   */
  async inquiryBankAccount(bankCode: string, bankAccount: string): Promise<any> {
    const timestamp = Date.now().toString();
    const signature = sha256(this.merchantCode + bankCode + bankAccount + this.apiKey);

    return this.request(
      "POST",
      "/api/disbursement/inquiry",
      {
        merchantCode: this.merchantCode,
        bankCode,
        bankAccount,
        signature,
      },
      { baseUrl: "api" }
    );
  }

  /**
   * Eksekusi transfer dana / payout (Disbursement Transfer)
   */
  async disburse(params: DuitkuDisbursementParams): Promise<any> {
    const integerAmount = Math.round(params.amount);
    const signature = sha256(
      this.merchantCode + params.merchantOrderId + params.bankCode + params.bankAccount + integerAmount.toString() + this.apiKey
    );

    const payload = {
      merchantCode: this.merchantCode,
      merchantOrderId: params.merchantOrderId,
      bankCode: params.bankCode,
      bankAccount: params.bankAccount,
      amount: integerAmount,
      purpose: params.purpose,
      senderName: params.senderName || "",
      senderPhone: params.senderPhone || "",
      callbackUrl: params.callbackUrl || "",
      signature,
    };

    return this.request("POST", "/api/disbursement/transfer", payload, { baseUrl: "api" });
  }

  /**
   * Cek status disbursement berdasarkan merchant order ID
   */
  async checkDisbursementStatus(merchantOrderId: string): Promise<any> {
    const signature = sha256(this.merchantCode + merchantOrderId + this.apiKey);

    return this.request(
      "POST",
      "/api/disbursement/checkStatus",
      {
        merchantCode: this.merchantCode,
        merchantOrderId,
        signature,
      },
      { baseUrl: "api" }
    );
  }
}
