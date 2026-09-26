import crypto from "crypto";
import { ProviderConfig } from "../types";
import { httpFetch } from "../utils/http";
import { buildXenithRequestSignature } from "../providers/xenith/signature";

export class XenithClient {
  private accessKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(
    config:
      | ProviderConfig
      | {
          accessKey?: string;
          apiKey?: string;
          secretKey?: string;
          sandbox?: boolean;
          customBaseUrl?: string;
        }
  ) {
    this.accessKey =
      (config as any).accessKey ||
      config.apiKey ||
      (config as any).clientKey ||
      "";
    this.secretKey =
      config.secretKey ||
      (config as any).serverKey ||
      "";
    this.baseUrl =
      config.customBaseUrl ||
      (config.sandbox !== false
        ? "https://openapi.sandbox.xenithpay.com"
        : "https://openapi.xenithpay.com");
  }

  /**
   * HTTP request helper dengan penandatanganan HMAC-SHA256 Xenith resmi
   */
  async request<T = any>(
    method: "GET" | "POST",
    endpoint: string,
    body?: any
  ): Promise<T> {
    const isFullUrl = endpoint.startsWith("http");
    const fullUrl = isFullUrl ? endpoint : `${this.baseUrl}${endpoint}`;
    const urlObj = new URL(fullUrl);
    const pathWithQuery = urlObj.pathname + urlObj.search;

    const timestamp = new Date().toISOString();
    const bodyStr = method === "POST" && body ? JSON.stringify(body) : "";

    const signature = buildXenithRequestSignature({
      secretKey: this.secretKey,
      method,
      path: pathWithQuery,
      timestamp,
      body: bodyStr,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Xenith-Api-Key": this.accessKey,
      "Xenith-Request-Timestamp": timestamp,
      "Xenith-Request-Signature": signature,
    };

    if (method === "POST") {
      headers["X-Idempotency-Key"] = crypto.randomUUID();
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === "POST" && bodyStr) {
      fetchOptions.body = bodyStr;
    }

    const response = await httpFetch(fullUrl, fetchOptions);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      const msg =
        data?.message ||
        data?.code ||
        `HTTP error! Status: ${response.status} - ${typeof data === "string" ? data : JSON.stringify(data)}`;
      throw new Error(msg);
    }

    return data as T;
  }

  /**
   * Buat transaksi Direct Pay In (Virtual Account, QRIS, E-Wallet)
   * https://docs.xenithpay.com/reference/payin_create
   */
  async createPayIn(data: any): Promise<any> {
    return this.request("POST", "/v1/payins", data);
  }

  /**
   * Dapatkan detail transaksi Pay In berdasarkan ID transaksi
   * https://docs.xenithpay.com/reference/payin_get_detail
   */
  async getPayIn(transactionId: string): Promise<any> {
    return this.request("GET", `/v1/payins/${encodeURIComponent(transactionId)}`);
  }



  /**
   * Buat Payment Link (Hosted Checkout session)
   * https://docs.xenithpay.com/reference/paymentlink_create
   */
  async createPaymentLink(data: any): Promise<any> {
    return this.request("POST", "/v1/payment-links", data);
  }

  /**
   * Dapatkan detail Payment Link berdasarkan ID
   * https://docs.xenithpay.com/reference/paymentlink_getdetail
   */
  async getPaymentLink(paymentLinkId: string): Promise<any> {
    return this.request("GET", `/v1/payment-links/${encodeURIComponent(paymentLinkId)}`);
  }

  /**
   * Dapatkan saldo akun Xenith
   * https://docs.xenithpay.com/reference/balance_get
   */
  async getBalances(): Promise<any> {
    return this.request("GET", "/v1/balances");
  }

  /**
   * Buat transaksi Pay Out (Disbursement dana)
   * https://docs.xenithpay.com/reference/payout_create
   */
  async createPayout(data: any): Promise<any> {
    return this.request("POST", "/v1/payouts", data);
  }



  /**
   * Verifikasi rekening bank tujuan sebelum payout (Account Inquiry — Sync)
   * https://docs.xenithpay.com/reference/accountinquiry_sync
   */
  async syncAccountInquiry(data: {
    currency?: string;
    destinationPayoutMethod: string;
    destinationPayoutChannel: string;
    destinationPayoutAccount: string;
  }): Promise<any> {
    return this.request("POST", "/v1/account-inquiry/sync", {
      currency: "IDR",
      ...data,
    });
  }

  /**
   * Verifikasi rekening bank tujuan secara async — webhook dikirim saat selesai
   * https://docs.xenithpay.com/reference/accountinquiry_async
   */
  async asyncAccountInquiry(data: {
    currency?: string;
    destinationPayoutMethod: string;
    destinationPayoutChannel: string;
    destinationPayoutAccount: string;
    callbackUrl?: string;
  }): Promise<any> {
    return this.request("POST", "/v1/account-inquiry/async", {
      currency: "IDR",
      ...data,
    });
  }

  /**
   * Dapatkan daftar Pay Out dengan paginasi cursor
   * https://docs.xenithpay.com/reference/payout_getlist
   */
  async listPayOuts(params?: {
    limit?: number;
    order?: "ASC" | "DESC";
    cursor?: string;
    referenceCode?: string;
    status?: string;
    createdTimeGte?: string;
    createdTimeLte?: string;
  }): Promise<any> {
    const qs = this._buildQuery({ order: "DESC", ...params });
    return this.request("GET", `/v1/payouts${qs}`);
  }

  /**
   * Dapatkan detail Pay Out berdasarkan ID
   * https://docs.xenithpay.com/reference/payout_get_detail
   */
  async getPayout(id: string): Promise<any> {
    return this.request("GET", `/v1/payouts/${encodeURIComponent(id)}`);
  }

  /**
   * Dapatkan daftar Pay In dengan paginasi cursor
   * https://docs.xenithpay.com/reference/payin_getlist
   */
  async listPayIns(params?: {
    limit?: number;
    order?: "ASC" | "DESC";
    cursor?: string;
    referenceCode?: string;
    status?: string;
    createdTimeGte?: string;
    createdTimeLte?: string;
  }): Promise<any> {
    const qs = this._buildQuery(params);
    return this.request("GET", `/v1/payins${qs}`);
  }

  /**
   * Dapatkan daftar Payment Link dengan paginasi cursor
   * https://docs.xenithpay.com/reference/paymentlink_getlist
   */
  async listPaymentLinks(params?: {
    limit?: number;
    order?: "ASC" | "DESC";
    cursor?: string;
    status?: string;
  }): Promise<any> {
    const qs = this._buildQuery(params);
    return this.request("GET", `/v1/payment-links${qs}`);
  }

  /**
   * Expire (batalkan) Payment Link yang masih aktif
   * https://docs.xenithpay.com/reference/paymentlink_expire
   */
  async expirePaymentLink(id: string): Promise<any> {
    return this.request("POST", `/v1/payment-links/${encodeURIComponent(id)}/expire`, {});
  }

  /**
   * Dapatkan semua transaksi (PAY_IN, PAY_OUT, SETTLEMENT, TOP_UP, PAY_IN_CREDIT, dll.)
   * dalam satu feed cursor-paginated — ideal untuk rekonsiliasi
   * https://docs.xenithpay.com/reference/transaction_getall
   * Catatan: endpoint ini TIDAK mendukung parameter `order`
   */
  async listTransactions(params?: {
    limit?: number;
    cursor?: string;
    createdTimeGte?: string;
    createdTimeLte?: string;
  }): Promise<any> {
    // Hapus `order` — /v1/transactions tidak mendukungnya
    const { order: _order, ...safeParams } = (params || {}) as any;
    const qs = this._buildQuery(safeParams);
    return this.request("GET", `/v1/transactions${qs}`);
  }

  /**
   * Dapatkan kanal Pay In yang aktif untuk merchant
   * https://docs.xenithpay.com/reference/payinchannels_getlist
   */
  async listPayInChannels(currency = "IDR"): Promise<any> {
    return this.request("GET", `/v1/payins/channels?currency=${encodeURIComponent(currency)}`);
  }

  /**
   * Dapatkan kanal Pay Out yang aktif untuk merchant
   * https://docs.xenithpay.com/reference/payoutchannels_getlist
   */
  async listPayOutChannels(currency = "IDR"): Promise<any> {
    return this.request("GET", `/v1/payouts/channels?currency=${encodeURIComponent(currency)}`);
  }

  /**
   * Simulasikan status transaksi Pay In di sandbox
   * POST /v1/simulator/transaction
   * transactionStatus: "SUCCESS" | "FAILED" | "EXPIRED"
   */
  async simulateTransaction(data: {
    transactionId: string;
    transactionCategory: "payins";
    transactionStatus: "SUCCESS" | "FAILED" | "EXPIRED";
  }): Promise<any> {
    return this.request("POST", "/v1/simulator/transaction", data);
  }

  /** Helper: build query string dari object params */
  private _buildQuery(params?: Record<string, any>): string {
    if (!params) return "";
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) sp.append(k, String(v));
    }
    const q = sp.toString();
    return q ? `?${q}` : "";
  }
}
