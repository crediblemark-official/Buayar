/**
 * Logika Payout / Transfer Dana (Kirim DOKU Domestic Payouts)
 *
 * Rujukan resmi: developers.doku.com/payout/kirim-doku → account-inquiry.md dan transfer-bank.md
 *
 * Kirim DOKU adalah produk SNAP, bukan REST Jokul. Endpoint resminya:
 *   POST /snap/v1.1/emoney/bank-account-inquiry
 *   POST /snap/v1.1/emoney/transfer-bank
 *
 * Autentikasi: B2B access token (asimetris RSA) + symmetric signature HMAC-SHA512.
 * Keduanya ditangani oleh SnapClient.
 */

import {
  ProviderConfig,
  DisburseParams,
  DisburseResult,
  ValidateBankAccountParams,
} from "../../types";
import { SnapClient } from "../../clients/snap";

/** Kode error SNAP yang menandakan field wajib tidak ada di body. */
export const DOKU_REQUIRED_FIELD_CODES = ["4004200", "4004202", "4004302", "4004300"];

export function createDokuSnapPayoutClient(
  config: ProviderConfig,
  clientId: string,
  secretKey: string,
  sandbox: boolean
): SnapClient {
  const raw = config as ProviderConfig & { privateKey?: string; extra?: Record<string, any> };
  const privateKey = String(raw.privateKey ?? config.extra?.privateKey ?? "").trim();
  const clientSecret = secretKey;

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
    clientId,
    clientSecret,
    privateKey,
    sandbox,
    merchantId: config.extra?.merchantId || config.projectId || "",
    channelId: config.extra?.channelId || "H2H",
  });
}

export function requireDokuFields(values: Record<string, any>, labels: Record<string, string>): void {
  const kurang = Object.entries(labels)
    .filter(([k]) => values[k] === undefined || values[k] === null || String(values[k]).trim() === "")
    .map(([, v]) => v);
  if (kurang.length) {
    throw new Error(`DOKU Kirim DOKU mewajibkan field berikut: ${kurang.join(", ")}.`);
  }
}

/**
 * Account Inquiry (validasi rekening tujuan) — `bank-account-inquiry`.
 * Mengembalikan `sessionId` yang WAJIB dikirim ulang di `transfer-bank`.
 */
export async function validateDokuBankAccount(
  config: ProviderConfig,
  clientId: string,
  secretKey: string,
  sandbox: boolean,
  params: ValidateBankAccountParams
): Promise<{
  success: true;
  accountHolderName: string;
  sessionId: string;
  rawResponse: any;
}> {
  requireDokuFields(
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

  const snap = createDokuSnapPayoutClient(config, clientId, secretKey, sandbox);
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
 * Bila `params.sessionId` kosong, Buayar menjalankan inquiry sendiri lebih dulu.
 */
export async function transferDokuBank(
  config: ProviderConfig,
  clientId: string,
  secretKey: string,
  sandbox: boolean,
  params: DisburseParams
): Promise<any> {
  requireDokuFields(
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

  const snap = createDokuSnapPayoutClient(config, clientId, secretKey, sandbox);
  const bankCode = String(params.bankCode).toUpperCase();

  let sessionId = String(params.sessionId ?? "").trim();
  let accountHolderName = String(params.accountHolderName ?? "").trim();
  if (!sessionId) {
    const inquiry = await validateDokuBankAccount(config, clientId, secretKey, sandbox, {
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
 * Eksekusi disbursement DOKU terpadu dengan penanganan kode respon resmi.
 */
export async function executeDokuDisburse(
  config: ProviderConfig,
  clientId: string,
  secretKey: string,
  sandbox: boolean,
  params: DisburseParams
): Promise<DisburseResult> {
  try {
    const data = await transferDokuBank(config, clientId, secretKey, sandbox, params);

    const responseCode = String(data?.responseCode ?? data?.response_code ?? "");
    const rawStatus = String(data?.status || "").toUpperCase();

    const isAccepted =
      responseCode === "2004300" || responseCode === "2024300" || rawStatus === "SUCCESS";
    const isPending = responseCode === "2024300" || rawStatus === "PENDING";

    return {
      success: isAccepted,
      supported: true,
      provider: "doku",
      reference:
        data?.referenceNo ||
        data?.reference_no ||
        data?.partnerReferenceNo ||
        data?.partner_reference_no ||
        params.externalId,
      status: isPending ? "PENDING" : rawStatus || (responseCode === "2004300" ? "SUCCESS" : "FAILED"),
      error: isAccepted
        ? undefined
        : data?.responseMessage ||
          data?.response_message ||
          `DOKU menolak payout (responseCode ${responseCode || "tidak ada"}).`,
      rawResponse: data,
    };
  } catch (e: any) {
    return {
      success: false,
      supported: true,
      provider: "doku",
      status: "FAILED",
      rawResponse: e?.raw ?? null,
      error: e.message || "DOKU disbursement failed",
    };
  }
}
