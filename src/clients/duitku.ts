import { ProviderConfig } from "../types";
import { sha256 } from "../utils/crypto";
import {
  getDuitkuPaymentMethodsSignature,
  getDuitkuStatusSignatures,
} from "../providers/duitku/signature";
import {
  DUITKU_DISBURSEMENT_PATHS,
  DuitkuDisbursementCredentials,
  DuitkuDisbursementError,
  duitkuDisbursementErrorHint,
  getDuitkuDisbursementSimpleSignature,
  getDuitkuDisbursementStatusSignature,
  getDuitkuInquiryDisbursementSignature,
  getDuitkuTransferDisbursementSignature,
  isDuitkuDisbursementSuccess,
} from "../providers/duitku/disbursement";
import { httpFetch } from "../utils/http";

export interface DuitkuDisbursementParams {
  bankCode: string;
  bankAccount: string;
  amount: number;
  purpose: string;
  /**
   * `disburseId` dari {@link DuitkuClient.inquiryBankAccount}.
   *
   * Bila diisi bersama `accountHolderName` dan `custRefNumber`, inquiry
   * dilewati karena pemanggil sudah menjalankannya sendiri.
   */
  disburseId?: string;
  /** Nama pemilik rekening resmi, dari hasil inquiry. */
  accountHolderName?: string;
  /** Nomor referensi customer, dari hasil inquiry. */
  custRefNumber?: string;
  senderName?: string;
  senderId?: string;
}

export class DuitkuClient {
  private merchantCode: string;
  private apiKey: string;
  private sandbox: boolean;
  private config: ProviderConfig;

  constructor(config: ProviderConfig | { merchantCode?: string; apiKey?: string; sandbox?: boolean; [key: string]: any }) {
    this.config = config as ProviderConfig;
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

    const response = await httpFetch(url, fetchOptions);
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
  //
  // Rujukan: https://docs.duitku.com/disbursement/id/ → "Transfer Online".
  //
  // API ini TIDAK memakai `merchantCode` dan TIDAK memakai API key pembayaran.
  // Yang dipakai: `userId` numerik, email registrasi, dan secret key
  // disbursement tersendiri. Semua signature memakai SHA256 atas
  // `email + timestamp + … + secretKey` — lihat `../providers/duitku/disbursement`.
  //
  // Endpoint disbursement menjawab HTTP 200 bahkan untuk kegagalan bisnis,
  // dengan `responseCode` negatif di body. Karena itu setiap metode di bawah
  // menilai `responseCode`, bukan `response.ok`.

  /**
   * Mengumpulkan kredensial disbursement, atau melempar error yang menyebut
   * persis field mana yang kurang.
   *
   * Sengaja TIDAK ada fallback ke `apiKey` pembayaran: signature yang salah
   * akan ditolak provider, dan `-120 User not found` yang muncul membuat
   * saldo selalu terbaca nol.
   */
  private disbursementCredentials(): DuitkuDisbursementCredentials {
    const raw = this.config as ProviderConfig & {
      disbursementUserId?: string | number;
      disbursementEmail?: string;
      disbursementSecretKey?: string;
    };
    const extra = (raw.extra || {}) as Record<string, any>;

    const userId = String(
      raw.disbursementUserId ?? extra.disbursementUserId ?? process.env.DUITKU_DISBURSEMENT_USER_ID ?? ""
    ).trim();
    const email = String(raw.disbursementEmail ?? extra.disbursementEmail ?? process.env.DUITKU_DISBURSEMENT_EMAIL ?? "").trim();
    const secretKey = String(
      raw.disbursementSecretKey ?? extra.disbursementSecretKey ?? process.env.DUITKU_DISBURSEMENT_SECRET_KEY ?? ""
    ).trim();

    const kurang: string[] = [];
    if (!userId) kurang.push("disbursementUserId (env: DUITKU_DISBURSEMENT_USER_ID)");
    if (!email) kurang.push("disbursementEmail (env: DUITKU_DISBURSEMENT_EMAIL)");
    if (!secretKey) kurang.push("disbursementSecretKey (env: DUITKU_DISBURSEMENT_SECRET_KEY)");

    if (kurang.length) {
      throw new DuitkuDisbursementError(
        "Duitku disbursement butuh kredensial tersendiri yang belum diisi: " +
          kurang.join(", ") +
          ". Ketiganya diberikan Duitku setelah fitur disbursement diaktifkan, dan TIDAK bisa memakai " +
          "merchantCode / API key pembayaran. Aktifkan dulu fitur disbursement di dashboard Duitku."
      );
    }

    return { userId, email, secretKey };
  }

  /**
   * Request ke API Disbursement. Melempar {@link DuitkuDisbursementError}
   * bila `responseCode` bukan `"00"`, dengan petunjuk aksi dari tabel status.
   */
  private async disbursementRequest(
    path: string,
    body: Record<string, any>
  ): Promise<{ data: any; signature: string }> {
    const signature = String(body.signature ?? "");
    const data = await this.request("POST", path, body, { baseUrl: "passport" });

    if (!isDuitkuDisbursementSuccess(data)) {
      const responseCode = String(data?.responseCode ?? "").trim();
      const responseDesc = String(data?.responseDesc ?? "").trim();
      const hint = duitkuDisbursementErrorHint(responseCode);
      const bagian = [responseDesc || "Duitku menolak permintaan disbursement."];
      if (responseCode) bagian.push(`(responseCode ${responseCode})`);
      if (hint) bagian.push(`— ${hint}`);
      throw new DuitkuDisbursementError(bagian.join(" "), { responseCode, responseDesc, raw: data });
    }

    return { data, signature };
  }

  /**
   * Cek saldo merchant (Disbursement Check Balance).
   *
   * `balance` dan `effectiveBalance` bisa benar-benar nol. Nol itu nilai yang
   * sah, jadi diperiksa dengan `!= null` — bukan `if (balance)`, yang akan
   * mengubah saldo nol menjadi `undefined` dan membuat pemanggil mengira saldo
   * tidak terbaca.
   */
  async checkBalance(): Promise<{ success: boolean; balance?: number; effectiveBalance?: number; rawResponse: any; error?: string }> {
    const cred = this.disbursementCredentials();
    const timestamp = Date.now().toString();
    const signature = getDuitkuDisbursementSimpleSignature(cred, timestamp);

    try {
      const { data } = await this.disbursementRequest(DUITKU_DISBURSEMENT_PATHS.checkBalance(), {
        userId: Number(cred.userId),
        email: cred.email,
        timestamp: Number(timestamp),
        signature,
      });

      return {
        success: true,
        balance: data?.balance != null ? Number(data.balance) : undefined,
        effectiveBalance: data?.effectiveBalance != null ? Number(data.effectiveBalance) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        rawResponse: e instanceof DuitkuDisbursementError ? e.raw ?? null : null,
        error: e.message || "Gagal mengecek saldo disbursement Duitku",
      };
    }
  }

  /**
   * Daftar bank yang didukung untuk transfer (Disbursement List Bank).
   */
  async listBanks(): Promise<{ success: boolean; banks: Array<{ bankCode: string; bankName: string; maxAmountTransfer?: number }>; rawResponse: any; error?: string }> {
    const cred = this.disbursementCredentials();
    const timestamp = Date.now().toString();
    const signature = getDuitkuDisbursementSimpleSignature(cred, timestamp);

    try {
      const { data } = await this.disbursementRequest(DUITKU_DISBURSEMENT_PATHS.listBank(), {
        userId: Number(cred.userId),
        email: cred.email,
        timestamp: Number(timestamp),
        signature,
      });

      const banks = Array.isArray(data?.Banks) ? data.Banks : [];
      return { success: true, banks, rawResponse: data };
    } catch (e: any) {
      return {
        success: false,
        banks: [],
        rawResponse: e instanceof DuitkuDisbursementError ? e.raw ?? null : null,
        error: e.message || "Gagal mengambil daftar bank disbursement Duitku",
      };
    }
  }

  /**
   * Langkah 1 disbursement Transfer Online (inquiry).
   *
   * Mengembalikan `disburseId` yang WAJIB dipakai pada langkah transfer,
   * sekaligus nama pemilik rekening dan nomor referensi customer yang
   * ditera oleh Duitku. Melempar {@link DuitkuDisbursementError} bila
   * `responseCode` bukan `"00"`.
   */
  async inquiryBankAccount(params: {
    bankCode: string;
    bankAccount: string;
    amount: number;
    purpose?: string;
    senderName?: string;
    senderId?: string;
  }): Promise<{
    success: true;
    disburseId: string;
    accountHolderName: string;
    custRefNumber: string;
    rawResponse: any;
  }> {
    const cred = this.disbursementCredentials();
    const timestamp = Date.now().toString();
    const purpose = params.purpose || "Disbursement";
    const signature = getDuitkuInquiryDisbursementSignature(
      cred,
      timestamp,
      params.bankCode,
      params.bankAccount,
      params.amount,
      purpose
    );

    const body: Record<string, any> = {
      userId: Number(cred.userId),
      amountTransfer: Math.round(params.amount),
      bankAccount: params.bankAccount,
      bankCode: params.bankCode,
      email: cred.email,
      purpose,
      timestamp: Number(timestamp),
      signature,
    };
    if (params.senderId) body.senderId = Number(params.senderId);
    if (params.senderName) body.senderName = params.senderName;

    const { data } = await this.disbursementRequest(DUITKU_DISBURSEMENT_PATHS.inquiry(this.sandbox), body);

    // `disburseId` dinormalisasi ke string karena dokumentasi menyebutnya
    // string(255),ZB tapi contoh respons memakai angka. Yang penting: nilai 0
    // berarti inquiry memang tidak menghasilkan apa-apa (Duitku mengirim
    // `disburseId: 0` bersamaan `responseCode: "-120"`), jadi harus
    // ditolak — `String(0)` adalah `"0"` yang truthy, tidak bisa dipakai
    // sebagai penanda.
    const disburseId = String(data.disburseId ?? "").trim();

    return {
      success: true,
      disburseId,
      accountHolderName: String(data.accountName ?? ""),
      custRefNumber: String(data.custRefNumber ?? ""),
      rawResponse: data,
    };
  }

  /**
   * Langkah 2 disbursement Transfer Online (transfer).
   *
   * WAJIB dijalankan setelah {@link inquiryBankAccount} sukses, memakai
   * `disburseId` yang dikembalikan inquiry. Menjalankan transfer tanpa
   * `disburseId` ditolak Duitku dengan `NF` (belum tercatat di gateway).
   */
  async transferDisbursement(params: {
    disburseId: string;
    bankCode: string;
    bankAccount: string;
    amount: number;
    purpose: string;
    accountHolderName: string;
    custRefNumber: string;
  }): Promise<{ success: true; rawResponse: any }> {
    const cred = this.disbursementCredentials();
    const timestamp = Date.now().toString();
    const signature = getDuitkuTransferDisbursementSignature(
      cred,
      timestamp,
      params.bankCode,
      params.bankAccount,
      params.accountHolderName,
      params.custRefNumber,
      params.amount,
      params.purpose,
      params.disburseId
    );

    const { data } = await this.disbursementRequest(DUITKU_DISBURSEMENT_PATHS.transfer(this.sandbox), {
      disburseId: params.disburseId,
      userId: Number(cred.userId),
      email: cred.email,
      bankCode: params.bankCode,
      bankAccount: params.bankAccount,
      amountTransfer: Math.round(params.amount),
      accountName: params.accountHolderName,
      custRefNumber: params.custRefNumber,
      purpose: params.purpose,
      timestamp: Number(timestamp),
      signature,
    });

    return { success: true, rawResponse: data };
  }

  /**
   * Eksekusi transfer dana / payout (Disbursement Transfer Online).
   *
   * Duitku mewajibkan dua langkah: inquiry dulu, baru transfer memakai
   * `disburseId` hasil inquiry. Metode ini menjalankan keduanya berurutan
   * dan berhenti pada langkah pertama yang gagal, sehingga transfer tanpa
   * inquiry yang sah tidak pernah terkirim.
   *
   * Lewati inquiry hanya bila pemanggil sudah menjalankan
   * {@link inquiryBankAccount} dan meneruskan `disburseId`, `accountHolderName`,
   * dan `custRefNumber` miliknya sendiri.
   *
   * Mengembalikan `success: false` (bukan melempar) bila either langkah
   * ditolak, supaya pemanggil tidak mengirim uang dua kali.
   */
  async disburse(params: DuitkuDisbursementParams): Promise<{
    success: boolean;
    disburseId?: string;
    step?: "inquiry" | "transfer";
    rawResponse: any;
    error?: string;
  }> {
    const amount = Math.round(params.amount);
    const purpose = params.purpose || "Disbursement";
    const punyaInquiry =
      !!params.disburseId && !!params.accountHolderName && !!params.custRefNumber;

    try {
      const inquiry = punyaInquiry
        ? {
            success: true as const,
            disburseId: params.disburseId as string,
            accountHolderName: params.accountHolderName as string,
            custRefNumber: params.custRefNumber as string,
            rawResponse: null,
          }
        : await this.inquiryBankAccount({
            bankCode: params.bankCode,
            bankAccount: params.bankAccount,
            amount,
            purpose,
            senderName: params.senderName,
          });

      if (!inquiry.disburseId || inquiry.disburseId === "0") {
        return {
          success: false,
          step: "inquiry",
          rawResponse: inquiry.rawResponse,
          error:
            "Inquiry disbursement Duitku tidak mengembalikan disburseId, jadi transfer tidak bisa dilanjutkan. " +
            "Periksa responseCode pada rawResponse.",
        };
      }

      const hasil = await this.transferDisbursement({
        disburseId: inquiry.disburseId,
        bankCode: params.bankCode,
        bankAccount: params.bankAccount,
        amount,
        purpose,
        accountHolderName: inquiry.accountHolderName,
        custRefNumber: inquiry.custRefNumber,
      });

      return { success: true, disburseId: inquiry.disburseId, step: "transfer", rawResponse: hasil.rawResponse };
    } catch (e: any) {
      const responseCode = e instanceof DuitkuDisbursementError ? e.responseCode : undefined;
      const responseDesc = e instanceof DuitkuDisbursementError ? e.responseDesc : undefined;
      // `NF` menandai transfer yang Duitku tidak reckam, jadi appeal-nya
      // pastilah di inquiry. Sisanya belum tahu tahap mana.
      const step = responseCode === "NF" ? "transfer" : punyaInquiry ? "transfer" : "inquiry";
      return {
        success: false,
        disburseId: params.disburseId,
        step,
        rawResponse: e instanceof DuitkuDisbursementError ? e.raw ?? null : null,
        error:
          e.message ||
          `Disbursement Duitku ditolak pada langkah ${step}${responseDesc ? ` (${responseDesc})` : ""}`,
      };
    }
  }

  /**
   * Cek status disbursement lewat `disburseId` (Disbursement Inquiry Status).
   *
   * Parameter sebelumnya bernama `merchantOrderId`, padahal endpoint ini tidak
   * mengenal `merchantOrderId` sama sekali — yang dicari adalah `disburseId`
   * dari inquiry.
   */
  async checkDisbursementStatus(disburseId: string): Promise<{ success: boolean; rawResponse: any; error?: string }> {
    const cred = this.disbursementCredentials();
    const timestamp = Date.now().toString();
    const signature = getDuitkuDisbursementStatusSignature(cred, timestamp, disburseId);

    try {
      const { data } = await this.disbursementRequest(DUITKU_DISBURSEMENT_PATHS.inquiryStatus(), {
        disburseId,
        userId: Number(cred.userId),
        email: cred.email,
        timestamp: Number(timestamp),
        signature,
      });
      return { success: true, rawResponse: data };
    } catch (e: any) {
      return {
        success: false,
        rawResponse: e instanceof DuitkuDisbursementError ? e.raw ?? null : null,
        error: e.message || "Gagal mengecek status disbursement Duitku",
      };
    }
  }
}
