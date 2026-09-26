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
  //
  // Rujukan: developers.doku.com/payout/kirim-doku → account-inquiry.md dan
  // transfer-bank.md.
  //
  // Kirim DOKU adalah produk SNAP, bukan REST Jokul. Endpoint resminya:
  //   POST /snap/v1.1/emoney/bank-account-inquiry
  //   POST /snap/v1.1/emoney/transfer-bank
  //
  // Path versi lama `/kirim-doku/v1/*` tidak ada sama sekali — diverifikasi
  // live 2026-09-26: DOKU menjawab `404 "No static resource"`, sedangkan path
  // SNAP di atas menjawab dengan kode error DOKU yang asli (4004202/4004302).
  //
  // Autentikasi demanding: B2B access token (asimetris RSA) + symmetric
  // signature HMAC-SHA512. Keduanya ditangani `SnapClient`.

  /** Kode error SNAP yang menandakan field wajib tidak ada di body. */
  private static readonly REQUIRED_FIELD_CODES = ["4004200", "4004202", "4004302", "4004300"];

  private snapPayout(): SnapClient {
    const raw = this.config as ProviderConfig & { privateKey?: string; extra?: Record<string, any> };
    const privateKey = String(raw.privateKey ?? this.config.extra?.privateKey ?? "").trim();
    const clientSecret = this.secretKey;

    // `config.privateKey` jatuh ke `apiKey` di lapisan config, dan untuk DOKU
    // nilai apiKey adalah Secret Key simetris — bukan RSA. Tanpa guard ini,
    // OpenSSL melempar `NO_START_LINE` yang tidak menjelaskan apa pun.
    if (!privateKey || !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(privateKey)) {
      throw new Error(
        "DOKU disbursement (Kirim DOKU) berjalan di jalur SNAP dan butuh RSA private key untuk " +
          "mengambil B2B access token. Secret Key simetris tidak bisa dipakai untuk itu. " +
          "Isi config.privateKey (env: DOKU_PRIVATE_KEY atau BUAYAR_PRIVATE_KEY) dengan RSA private key berformat PEM " +
          "dari dashboard DOKU."
      );
    }
    if (!clientSecret) {
      throw new Error("DOKU disbursement butuh Secret Key (config.apiKey) untuk symmetric signature HMAC-SHA512.");
    }

    return new SnapClient({
      clientId: this.clientId,
      clientSecret,
      privateKey,
      sandbox: this.sandbox,
      merchantId: this.config.extra?.merchantId || this.config.projectId || "",
      channelId: this.config.extra?.channelId || "H2H",
    });
  }

  private static requireFields(values: Record<string, any>, labels: Record<string, string>): void {
    const kurang = Object.entries(labels)
      .filter(([k]) => values[k] === undefined || values[k] === null || String(values[k]).trim() === "")
      .map(([, v]) => v);
    if (kurang.length) {
      throw new Error(`DOKU Kirim DOKU mewajibkan field berikut: ${kurang.join(", ")}.`);
    }
  }

  /**
   * Account Inquiry (validasi rekening tujuan) — `bank-account-inquiry`.
   *
   * Mengembalikan `sessionId` yang WAJIB dikirim ulang di `transfer-bank`.
   * Field `additionalInfo.beneficiaryBankCode` sengaja diisi dua kali: DOKU
   * mewajibkannya di `additionalInfo` terpisah dari field utama, dan nilainya
   * harus sama.
   */
  async validateBankAccount(params: ValidateBankAccountParams): Promise<{
    success: true;
    accountHolderName: string;
    sessionId: string;
    rawResponse: any;
  }> {
    DokuClient.requireFields(
      {
        customerNumber: params.customerNumber,
        beneficiaryAccountNumber: params.accountNumber,
        beneficiaryAccountName: params.accountHolderName,
        beneficiaryBankCode: params.bankCode,
        amount: params.amount,
      },
      {
        customerNumber: "customerNumber (nomor HP pemilik rekening, format 62/0)",
        beneficiaryAccountNumber: "beneficiaryAccountNumber (nomor rekening)",
        beneficiaryAccountName: "accountHolderName (additionalInfo.beneficiaryAccountName)",
        beneficiaryBankCode: "bankCode (kode bank BI)",
        amount: "amount (nominal yang akan ditransfer)",
      }
    );

    const snap = this.snapPayout();
    const body: Record<string, any> = {
      partnerReferenceNo: params.providerParams?.partnerReferenceNo,
      customerNumber: params.customerNumber,
      amount: { value: Number(params.amount).toFixed(2), currency: "IDR" },
      beneficiaryAccountNumber: params.accountNumber,
      additionalInfo: {
        channelCode: params.providerParams?.channelCode,
        beneficiaryBankCode: String(params.bankCode).toUpperCase(),
        beneficiaryAccountName: params.accountHolderName,
        senderCountryCode: params.providerParams?.senderCountryCode || "ID",
      },
    };
    if (body.partnerReferenceNo === undefined) delete body.partnerReferenceNo;
    if (body.additionalInfo.channelCode === undefined) delete body.additionalInfo.channelCode;

    const data = await snap.request("POST", "/snap/v1.1/emoney/bank-account-inquiry", body);

    // Fail-closed: inquiry tanpa `sessionId` tidak ada gunanya, karena
    // `transfer-bank` mewajibkannya. Jadi sessionId adalah penanda sukses
    // yang jujur, bukan `responseCode` yang bisa berubah.
    const sessionId = String(data?.sessionId ?? "").trim();
    if (!sessionId) {
      throw new Error(
        "DOKU account inquiry tidak mengembalikan sessionId, jadi transfer tidak bisa dilanjutkan. " +
          `Respons DOKU: ${data?.responseCode ?? "tidak ada"} ${data?.responseMessage ?? ""}`.trim()
      );
    }

    return {
      success: true,
      accountHolderName: String(data?.beneficiaryAccountName ?? ""),
      sessionId,
      rawResponse: data,
    };
  }

  /**
   * Transfer Bank (payout) — `transfer-bank`.
   *
   * DOKU mewajibkan `sessionId` hasil account inquiry lebih dulu. Bila
   * `params.sessionId` kosong, Buayar menjalankan inquiry sendiri lalu memakai
   * sessionId hasilnya, sehingga transfer tanpa inquiry tidak pernah terkirim.
   */
  async disburse(params: DisburseParams): Promise<any> {
    DokuClient.requireFields(
      {
        customerNumber: params.customerNumber,
        beneficiaryAccountNumber: params.accountNumber,
        beneficiaryBankCode: params.bankCode,
        amount: params.amount,
      },
      {
        customerNumber: "customerNumber (nomor HP pemilik rekening, format 62/0)",
        beneficiaryAccountNumber: "beneficiaryAccountNumber (nomor rekening)",
        beneficiaryBankCode: "bankCode (kode bank BI)",
        amount: "amount (nominal transfer)",
      }
    );

    const snap = this.snapPayout();
    const bankCode = String(params.bankCode).toUpperCase();

    let sessionId = String(params.sessionId ?? "").trim();
    let accountHolderName = String(params.accountHolderName ?? "").trim();
    if (!sessionId) {
      const inquiry = await this.validateBankAccount({
        bankCode,
        accountNumber: params.accountNumber,
        accountHolderName: accountHolderName || undefined,
        amount: params.amount,
        customerNumber: params.customerNumber,
        providerParams: params.providerParams,
      });
      sessionId = inquiry.sessionId;
      accountHolderName = inquiry.accountHolderName || accountHolderName;
    }

    const extra = (params.providerParams?.additionalInfo || {}) as Record<string, any>;
    const pecahNama = (nama: string) => {
      const bersih = nama.trim();
      const potong = bersih.indexOf(" ");
      return potong === -1
        ? { firstName: bersih, lastName: bersih }
        : { firstName: bersih.slice(0, potong), lastName: bersih.slice(potong + 1) };
    };
    const penerima = pecahNama(accountHolderName);
    const pengirim = pecahNama(
      String(extra.senderName ?? params.accountHolderName ?? params.customerNumber ?? "SENDER")
    );

    const body: Record<string, any> = {
      partnerReferenceNo: params.externalId,
      customerNumber: params.customerNumber,
      beneficiaryAccountNumber: params.accountNumber,
      beneficiaryBankCode: bankCode,
      amount: { value: Number(params.amount).toFixed(2), currency: "IDR" },
      sessionId,
      additionalInfo: {
        channelCode: extra.channelCode,
        beneficiaryFirstName: extra.beneficiaryFirstName ?? penerima.firstName,
        beneficiaryLastName: extra.beneficiaryLastName ?? penerima.lastName,
        beneficiaryPhoneNumber: extra.beneficiaryPhoneNumber ?? params.customerNumber,
        beneficiaryAccountName: extra.beneficiaryAccountName ?? accountHolderName,
        senderCountryCode: extra.senderCountryCode || "ID",
        senderFirstName: extra.senderFirstName ?? pengirim.firstName,
        senderLastName: extra.senderLastName ?? pengirim.lastName,
        senderPersonalId: extra.senderPersonalId ?? "",
        senderPersonalIdType: extra.senderPersonalIdType ?? "KTP",
        remark: extra.remark ?? params.description,
      },
    };
    if (body.additionalInfo.channelCode === undefined) delete body.additionalInfo.channelCode;
    if (body.additionalInfo.remark === undefined) delete body.additionalInfo.remark;
    if (params.providerParams?.feeType) body.feeType = params.providerParams.feeType;

    return snap.request("POST", "/snap/v1.1/emoney/transfer-bank", body);
  }

  /**
   * Status transfer. DOKU tidak menyediakan endpoint status untuk Kirim DOKU —
   * status final dibaca dari `responseCode` pada respons `transfer-bank` dan
   * dari notifikasi callback. Karena itu method ini menolak dengan pesan
   * jelas, bukan menembak path yang tidak ada dan mengembalikan 404 yang
   * terlihat seperti hasil.
   */
  async checkPayoutStatus(referenceNo: string): Promise<any> {
    throw new Error(
      `DOKU Kirim DOKU tidak menyediakan endpoint status transfer (ref ${referenceNo}). ` +
        "Baca status dari responseCode pada respons transfer-bank, atau dari notifikasi callback DOKU."
    );
  }
}
