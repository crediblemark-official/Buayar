import {
  ProviderConfig,
  DisburseParams,
  UpdateVaParams,
  DeleteVaParams,
  ValidateBankAccountParams,
} from "../types";
import { generateDokuHeaders } from "../providers/doku/signature";
import { SnapClient } from "./snap";
import { httpFetch } from "../utils/http";
import {
  createDokuSnapPayoutClient,
  validateDokuBankAccount,
  transferDokuBank,
} from "../providers/doku/disbursement";

export class DokuClient {
  private clientId: string;
  private secretKey: string;
  private sandbox: boolean;
  private config: ProviderConfig;

  constructor(config: ProviderConfig | { merchantCode?: string; clientId?: string; apiKey?: string; secretKey?: string; sandbox?: boolean; [key: string]: any }) {
    this.config = config as ProviderConfig;
    this.clientId = config.merchantCode || (config as any).clientId || (config as any).clientKey || "";
    this.secretKey = config.apiKey || (config as any).secretKey || (config as any).serverKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://api-sandbox.doku.com"
      : "https://api.doku.com";
  }

  private isSnap(): boolean {
    if (this.config.extra?.snap === true || this.config.extra?.snap === "true") return true;
    if (this.config.extra?.dokuMode === "snap") return true;
    const clientId = String(this.clientId).trim().toLowerCase();
    return /^doku[_:-]/.test(clientId);
  }

  private buildSnap(): SnapClient {
    return new SnapClient({
      clientId: this.clientId,
      clientSecret: this.secretKey,
      privateKey: this.config.privateKey,
      sandbox: this.sandbox,
      merchantId: this.config.extra?.merchantId || this.config.projectId || "",
      terminalId: this.config.extra?.terminalId || "",
      partnerServiceId: this.config.extra?.partnerServiceId || "",
      channelId: this.config.extra?.channelId || "H2H",
    });
  }

  /**
   * Helper request bertanda tangan DOKU Jokul v2
   */
  async request(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = generateDokuHeaders(this.clientId, this.secretKey, endpoint, body);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body !== undefined && method !== "GET") {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await httpFetch(url, fetchOptions);
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

  /**
   * Update Virtual Account (Jokul v2 atau BI-SNAP)
   * Mengubah nominal atau memperpanjang masa aktif pembayaran VA
   */
  async updateVirtualAccount(params: UpdateVaParams): Promise<any> {
    if (this.isSnap()) {
      const snap = this.buildSnap();
      const rawPartnerServiceId = (this.config.extra?.partnerServiceId || "").replace(/\s/g, "");
      const partnerServiceId = rawPartnerServiceId.padStart(8, " ").slice(0, 8);
      const customerNo = (this.config.extra?.customerNo || "").replace(/\s/g, "").slice(0, 20) || String(Date.now()).slice(-12);
      const virtualAccountNo = params.vaNumber || (partnerServiceId + customerNo).slice(0, 28);

      const body: any = {
        partnerServiceId,
        customerNo,
        virtualAccountNo,
        trxId: params.orderId,
      };

      if (params.amount !== undefined) {
        body.totalAmount = { value: Number(params.amount).toFixed(2), currency: "IDR" };
      }
      if (params.expiredTime) {
        body.expiredDate = params.expiredTime instanceof Date
          ? params.expiredTime.toISOString()
          : new Date(Date.now() + (params.expiredTime as number) * 60 * 1000).toISOString();
      }
      if (params.providerParams) {
        Object.assign(body, params.providerParams);
      }

      return snap.request("PUT", "/virtual-accounts/bi-snap-va/v1.1/transfer-va/update-va", body);
    }

    const bank = this.vaChannelName(params.bank);
    const endpoint = `/${bank}-virtual-account/v2/payment-code`;
    const payload: any = {
      order: {
        invoice_number: params.orderId,
      },
      virtual_account_info: {},
    };

    if (params.amount !== undefined) {
      payload.order.amount = Math.round(params.amount);
    }
    if (params.vaNumber) {
      payload.virtual_account_info.virtual_account_number = params.vaNumber;
    }
    if (params.expiredTime) {
      if (typeof params.expiredTime === "number") {
        payload.virtual_account_info.expired_time = params.expiredTime;
      } else if (params.expiredTime instanceof Date) {
        payload.virtual_account_info.expired_date = params.expiredTime.toISOString();
      }
    }
    if (params.providerParams) {
      Object.assign(payload, params.providerParams);
    }

    return this.request("PUT", endpoint, payload);
  }

  /**
   * Delete / Cancel Virtual Account (Jokul v2 atau BI-SNAP)
   */
  /**
   * Nama kanal VA Jokul v2. BSI memakai `bsm-` — `bsi-virtual-account` tidak ada
   * di DOKU ("No static resource"), diverifikasi live 2026-09-26.
   */
  private vaChannelName(bank?: string): string {
    const b = (bank || "bca").toLowerCase();
    return b === "bsi" ? "bsm" : b;
  }

  async deleteVirtualAccount(params: DeleteVaParams): Promise<any> {
    if (this.isSnap()) {
      const snap = this.buildSnap();
      const rawPartnerServiceId = (this.config.extra?.partnerServiceId || "").replace(/\s/g, "");
      const partnerServiceId = rawPartnerServiceId.padStart(8, " ").slice(0, 8);
      const customerNo = (this.config.extra?.customerNo || "").replace(/\s/g, "").slice(0, 20) || String(Date.now()).slice(-12);
      const virtualAccountNo = params.vaNumber || (partnerServiceId + customerNo).slice(0, 28);

      const body: any = {
        partnerServiceId,
        customerNo,
        virtualAccountNo,
        trxId: params.orderId,
        ...(params.providerParams || {}),
      };

      return snap.request("DELETE", "/virtual-accounts/bi-snap-va/v1.1/transfer-va/delete-va", body);
    }

    const bank = this.vaChannelName(params.bank);
    const endpoint = `/${bank}-virtual-account/v2/payment-code/${encodeURIComponent(params.orderId)}`;
    const payload = params.providerParams ? { ...params.providerParams } : undefined;
    return this.request("DELETE", endpoint, payload);
  }

  // ─── KIRIM DOKU (Disbursement) ──────────────────────────────────────────────
  // Logika resmi SNAP B2B Kirim DOKU dipusatkan di `src/providers/doku/disbursement.ts`.

  private snapPayout(): SnapClient {
    return createDokuSnapPayoutClient(this.config, this.clientId, this.secretKey, this.sandbox);
  }

  /**
   * Account Inquiry (validasi rekening tujuan) — `bank-account-inquiry`.
   */
  async validateBankAccount(params: ValidateBankAccountParams): Promise<{
    success: true;
    accountHolderName: string;
    sessionId: string;
    rawResponse: any;
  }> {
    return validateDokuBankAccount(this.config, this.clientId, this.secretKey, this.sandbox, params);
  }

  /**
   * Transfer Bank (payout) — `transfer-bank`.
   */
  async disburse(params: DisburseParams): Promise<any> {
    return transferDokuBank(this.config, this.clientId, this.secretKey, this.sandbox, params);
  }

  /**
   * Status transfer (DOKU tidak menyediakan endpoint query terpisah).
   */
  async checkPayoutStatus(referenceNo: string): Promise<any> {
    throw new Error(
      `DOKU Kirim DOKU tidak menyediakan endpoint status transfer (ref ${referenceNo}). ` +
        "Baca status dari responseCode pada respons transfer-bank, atau dari notifikasi callback DOKU."
    );
  }
}
