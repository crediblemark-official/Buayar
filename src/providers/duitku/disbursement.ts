/**
 * Signature & kontrak respons untuk **Disbursement API Duitku** (Transfer Online).
 *
 * Dokumen resmi: https://docs.duitku.com/disbursement/id/ → "Transfer Online".
 *
 * Semua signature adalah SHA256 hex lowercase atas rangkaian parameter
 * berurutan. Perhatikan: **tidak satu pun memakai `merchantCode`** dan
 * **tidak satu pun memakai API key pembayaran** — semuanya memakai
 * `disbursementEmail` + `disbursementSecretKey`, dan `disbursementUserId`
 * dikirim sebagai field body (bukan ikut signature).
 *
 *   inquiry        : SHA256(email + timestamp + bankCode + bankAccount
 *                           + amountTransfer + purpose + secretKey)
 *   transfer       : SHA256(email + timestamp + bankCode + bankAccount
 *                           + accountName + custRefNumber + amountTransfer
 *                           + purpose + disburseId + secretKey)
 *   inquiry status : SHA256(email + timestamp + disburseId + secretKey)
 *   check balance  : SHA256(email + timestamp + secretKey)
 *   list bank      : SHA256(email + timestamp + secretKey)
 */

import { sha256 } from "../../utils/crypto";

/** Kredensial khusus disbursement — berbeda dari kredensial pembayaran. */
export interface DuitkuDisbursementCredentials {
  /** ID numerik merchant, diberikan Duitku setelah fitur disbursement diaktifkan. */
  userId: string;
  /** Email registrasi merchant di Duitku. Wajib ikut signature. */
  email: string;
  /** Secret key khusus disbursement (bukan API key pembayaran). */
  secretKey: string;
}

export const DUITKU_DISBURSEMENT_BASES = {
  sandbox: "https://sandbox.duitku.com/webapi",
  production: "https://passport.duitku.com/webapi",
} as const;

/** Path relatif per endpoint. Sandbox memakai sufiks `sandbox` untuk 2 endpoint. */
export const DUITKU_DISBURSEMENT_PATHS = {
  inquiry: (sandbox: boolean) => `/api/disbursement/${sandbox ? "inquirysandbox" : "inquiry"}`,
  transfer: (sandbox: boolean) => `/api/disbursement/${sandbox ? "transfersandbox" : "transfer"}`,
  inquiryStatus: () => "/api/disbursement/inquirystatus",
  checkBalance: () => "/api/disbursement/checkbalance",
  listBank: () => "/api/disbursement/listBank",
} as const;

export function getDuitkuInquiryDisbursementSignature(
  cred: DuitkuDisbursementCredentials,
  timestamp: string,
  bankCode: string,
  bankAccount: string,
  amountTransfer: number,
  purpose: string
): string {
  return sha256(cred.email + timestamp + bankCode + bankAccount + String(Math.round(amountTransfer)) + purpose + cred.secretKey);
}

export function getDuitkuTransferDisbursementSignature(
  cred: DuitkuDisbursementCredentials,
  timestamp: string,
  bankCode: string,
  bankAccount: string,
  accountName: string,
  custRefNumber: string,
  amountTransfer: number,
  purpose: string,
  disburseId: string
): string {
  return sha256(
    cred.email +
      timestamp +
      bankCode +
      bankAccount +
      accountName +
      custRefNumber +
      String(Math.round(amountTransfer)) +
      purpose +
      disburseId +
      cred.secretKey
  );
}

export function getDuitkuDisbursementStatusSignature(
  cred: DuitkuDisbursementCredentials,
  timestamp: string,
  disburseId: string
): string {
  return sha256(cred.email + timestamp + disburseId + cred.secretKey);
}

export function getDuitkuDisbursementSimpleSignature(
  cred: DuitkuDisbursementCredentials,
  timestamp: string
): string {
  return sha256(cred.email + timestamp + cred.secretKey);
}

/** Kode respons sukses satu-satunya. Semua nilai lain = gagal. */
export const DUITKU_DISBURSEMENT_SUCCESS_CODE = "00";

/**
 * Petunjuk aksi per `responseCode` resmi (tabel "Status Code" di dokumentasi).
 * Dipakai untuk mengubah "-120" jadi kalimat yang bisa ditindaklanjuti merchant.
 */
const DUITKU_DISBURSEMENT_HINTS: Record<string, string> = {
  "-120":
    "User ID tidak ditemukan atau tidak punya akses ke API disbursement. Fitur disbursement harus diaktifkan Duitku dulu, dan userId + secret key-nya terpisah dari API key pembayaran.",
  "-123": "User merchant diblokir Duitku. Hubungi DOKU merchant support.",
  "-141": "Nominal transfer tidak valid. Transfer Online minimal Rp 10.000 dan maksimal Rp 100.000.000 per transaksi.",
  "-142": "Transaksi sudah selesai. Jangan mengulang disbursement yang sama.",
  "-149": "Bank tujuan tidak terdaftar. Ambil daftar bank yang valid lewat listBanks().",
  TO: "Timeout dari jaringan ATM Bersama. Jangan ulangi permintaan ini — cek status lewat inquiry status.",
  "-100": "Kesalahan lain di sisi Duitku. Jangan ulangi permintaan ini.",
  EE: "General error dari Duitku.",
  LD: "Gangguan link Duitku ke jaringan ATM Bersama.",
  NF: "Transaksi belum tercatat di gateway remittance. Coba lagi setelah beberapa saat.",
  "76": "Nomor rekening tujuan tidak valid.",
  "80": "Menunggu callback. Status akhir hanya diketahui lewat inquiry status.",
};

export function duitkuDisbursementErrorHint(responseCode: string): string | undefined {
  return DUITKU_DISBURSEMENT_HINTS[String(responseCode).trim()];
}

/**
 * Error dari API Disbursement Duitku.
 *
 * Penting: endpoint disbursement Duitku menjawab **HTTP 200** bahkan untuk
 * kegagalan bisnis, dengan `responseCode` negatif di dalam body. Jadi
 * `response.ok` tidak pernah cukup untuk menilai berhasil.
 */
export class DuitkuDisbursementError extends Error {
  readonly responseCode?: string;
  readonly responseDesc?: string;
  readonly raw: any;

  constructor(message: string, opts: { responseCode?: string; responseDesc?: string; raw?: any } = {}) {
    super(message);
    this.name = "DuitkuDisbursementError";
    this.responseCode = opts.responseCode;
    this.responseDesc = opts.responseDesc;
    this.raw = opts.raw;
  }
}

/** Mengembalikan true HANYA bila `responseCode` body adalah `"00"`. */
export function isDuitkuDisbursementSuccess(body: any): boolean {
  return String(body?.responseCode ?? "").trim() === DUITKU_DISBURSEMENT_SUCCESS_CODE;
}

import type { DisburseParams, DisburseResult, CheckBalanceResult, ProviderConfig } from "../../types";
import { DuitkuClient } from "../../clients/duitku";

export async function executeDuitkuDisburse(
  params: DisburseParams,
  config: ProviderConfig,
  client?: DuitkuClient
): Promise<DisburseResult> {
  try {
    const c = client || new DuitkuClient(config);
    const hasil = await c.disburse({
      bankCode: params.bankCode,
      bankAccount: params.accountNumber,
      amount: params.amount,
      purpose: params.description || "Disbursement",
      disburseId: params.providerParams?.disburseId,
      accountHolderName: params.providerParams?.accountHolderName,
      custRefNumber: params.providerParams?.custRefNumber,
    });

    return {
      success: hasil.success,
      supported: true,
      provider: "duitku",
      reference: hasil.disburseId || params.externalId,
      status: hasil.success ? "PENDING" : "FAILED",
      error: hasil.error,
      rawResponse: hasil.rawResponse,
    };
  } catch (e: any) {
    return {
      success: false,
      supported: true,
      provider: "duitku",
      reference: params.externalId,
      status: "FAILED",
      error: e.message || "Disbursement failed",
      rawResponse: null,
    };
  }
}

export async function executeDuitkuCheckBalance(
  config: ProviderConfig,
  client?: DuitkuClient
): Promise<CheckBalanceResult> {
  try {
    const c = client || new DuitkuClient(config);
    const result = await c.checkBalance();
    return {
      success: result.success,
      supported: true,
      provider: "duitku",
      balance: result.balance,
      rawResponse: result.rawResponse,
      error: result.error,
    };
  } catch (e: any) {
    return {
      success: false,
      supported: true,
      provider: "duitku",
      rawResponse: null,
      error: e.message || "Balance check failed",
    };
  }
}
