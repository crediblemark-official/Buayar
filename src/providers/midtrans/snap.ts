import crypto from "crypto";
import { InvoiceResponse, ProviderConfig } from "../../types";
import {
  generateSnapAsymmetricSignature,
  generateSnapSymmetricSignature,
  normalizeSnapPem,
  sha256Hex,
  snapTimestamp,
} from "../../utils/snap";

/**
 * Adapter **BI-SNAP Core API Midtrans** (Standar Nasional Open API Pembayaran).
 *
 * Referensi resmi:
 * - Overview & migrasi: https://docs.midtrans.com/reference/core-api-snap-open-api-overview
 * - Signature Generation: https://docs.midtrans.com/reference/signature-generation
 * - Access Token API: https://docs.midtrans.com/reference/access-token-api
 * - MPM (QRIS): https://docs.midtrans.com/reference/mpm-api-qris
 * - Bank Transfer (VA): https://docs.midtrans.com/reference/virtual-account-api-bank-transfer
 * - Klien resmi: https://github.com/Midtrans/midtrans-nodejs-client (lib/snapBi)
 *
 * Perbedaan penting vs Core API legacy (`api.midtrans.com/v2`):
 * - Domain: `merchants.sbx.midtrans.com` (sandbox) / `merchants.midtrans.com` (production).
 * - Kredensial: MID + merchant public key + Client ID (`X-CLIENT-KEY`) + client secret
 *   + Partner ID (`X-PARTNER-ID`), bukan Server Key Basic Auth.
 * - Autentikasi 2 langkah: Get B2B Access Token (asimetris) → setiap call transaksi ditandatangani (simetris).
 * - Status transaksi **numerik**: 00 success, 01 initiated, 03 pending, 04 refunded,
 *   05 canceled, 06 failed, 08 expiry, 09 rejected.
 * - Notifikasi per-jenis: `/v1.0/debit/notify`, `/v1.0/qr/qr-mpm-notify`
 *   (Virtual Account TETAP memakai notifikasi legacy).
 *
 * Implementasi ini **opt-in**: aktif hanya bila `config.extra.snap === true` atau
 * seluruh kredensial SNAP terisi. Tanpa itu, jalur legacy tidak berubah sama sekali.
 */

export const MIDTRANS_SNAP_DOMAINS = {
  sandbox: "https://merchants.sbx.midtrans.com",
  production: "https://merchants.midtrans.com",
} as const;

export const MIDTRANS_SNAP_PATHS = {
  accessToken: "/v1.0/access-token/b2b",
  qrisGenerate: "/v1.0/qr/qr-mpm-generate",
  qrisQuery: "/v1.0/qr/qr-mpm-query",
  qrisRefund: "/v1.0/qr/qr-mpm-refund",
  qrisCancel: "/v1.0/qr/qr-mpm-cancel",
  vaCreate: "/v1.0/transfer-va/create-va",
  vaStatus: "/v1.0/transfer-va/status",
  vaDelete: "/v1.0/transfer-va/delete-va",
  debitPayment: "/v1.0/debit/payment-host-to-host",
  debitStatus: "/v1.0/debit/status",
  debitRefund: "/v1.0/debit/refund",
  debitCancel: "/v1.0/debit/cancel",
} as const;

/** BI mewajibkan CHANNEL-ID berupa 5 digit numerik; nilai bebas selama format benar. */
export const MIDTRANS_SNAP_DEFAULT_CHANNEL_ID = "12345";
export const MIDTRANS_SNAP_DEFAULT_DEVICE_ID = "buayar-node-server";

export interface MidtransSnapCredentials {
  clientId: string;
  clientSecret: string;
  partnerId: string;
  channelId: string;
  privateKey: string;
  merchantId: string;
  deviceId: string;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Baca kredensial SNAP dari `ProviderConfig`.
 *
 * `config.extra.snap*` adalah sumber utama; beberapa field punya fallback ke
 * field kanonik (`clientKey`, `secretKey`, `merchantId`) agar konfigurasi ringkas.
 */
export function resolveMidtransSnapCredentials(config?: ProviderConfig): {
  credentials: MidtransSnapCredentials;
  missing: string[];
  enabled: boolean;
} {
  const extra = (config?.extra || {}) as Record<string, any>;
  const credentials: MidtransSnapCredentials = {
    clientId: str(extra.snapClientId) || str(config?.clientKey),
    clientSecret: str(extra.snapClientSecret) || str(config?.secretKey),
    partnerId: str(extra.snapPartnerId),
    channelId: str(extra.snapChannelId) || MIDTRANS_SNAP_DEFAULT_CHANNEL_ID,
    privateKey: str(extra.snapPrivateKey),
    merchantId: str(extra.snapMerchantId) || str(config?.merchantId),
    deviceId: str(extra.snapDeviceId) || MIDTRANS_SNAP_DEFAULT_DEVICE_ID,
  };

  const missing: string[] = [];
  if (!credentials.clientId) missing.push("clientId (config.clientKey atau config.extra.snapClientId)");
  if (!credentials.clientSecret) missing.push("clientSecret (config.secretKey atau config.extra.snapClientSecret)");
  if (!credentials.partnerId) missing.push("partnerId (config.extra.snapPartnerId)");
  if (!credentials.privateKey) missing.push("privateKey RSA (config.extra.snapPrivateKey)");

  const explicitlyDisabled = extra.snap === false;
  const enabled = !explicitlyDisabled && (extra.snap === true || missing.length === 0);

  return { credentials, missing, enabled };
}

/** Apakah jalur BI-SNAP Midtrans aktif untuk konfigurasi ini? */
export function isMidtransSnapEnabled(config?: ProviderConfig): boolean {
  return resolveMidtransSnapCredentials(config).enabled;
}

/** Kanal SNAP per bank — nilai `additionalInfo.bank` pada Create VA. */
export const MIDTRANS_SNAP_VA_BANKS: Record<string, string> = {
  bca_va: "bca",
  bni_va: "bni",
  bri_va: "bri",
  permata_va: "permata",
  cimb_va: "cimb",
  mandiri_va: "mandiri",
  danamon_va: "danamon",
  bsi_va: "bsi",
  seabank_va: "seabank",
};

/** Kanal SNAP QRIS — nilai `additionalInfo.acquirer` yang sah (huruf besar). */
export const MIDTRANS_SNAP_QRIS_ACQUIRER: Record<string, string> = {
  qris: "gopay",
  gopay_qris: "gopay",
  shopeepay_qris: "AIRPAY SHOPEE",
};

export type MidtransSnapMethod =
  | { kind: "va"; bank: string }
  | { kind: "qris"; acquirer: string };

/** Petakan kode kanonikal ke jenis flow SNAP yang didukung, atau undefined. */
export function toMidtransSnapMethod(method?: string): MidtransSnapMethod | undefined {
  if (!method) return undefined;
  const key = method.toLowerCase().trim();
  if (MIDTRANS_SNAP_VA_BANKS[key]) return { kind: "va", bank: MIDTRANS_SNAP_VA_BANKS[key] };
  if (MIDTRANS_SNAP_QRIS_ACQUIRER[key]) return { kind: "qris", acquirer: MIDTRANS_SNAP_QRIS_ACQUIRER[key] };
  return undefined;
}

/** Daftar kode kanonikal yang dapat dilayani lewat BI-SNAP. */
export const MIDTRANS_SNAP_SUPPORTED_METHODS: string[] = [
  ...Object.keys(MIDTRANS_SNAP_VA_BANKS),
  ...Object.keys(MIDTRANS_SNAP_QRIS_ACQUIRER),
];

/**
 * Status transaksi numerik BI-SNAP → status kanonikal Buayar.
 * 04 (refunded) dipetakan ke `failed` karena dana tidak lagi di merchant.
 */
export const MIDTRANS_SNAP_TRANSACTION_STATUS: Record<string, "paid" | "pending" | "failed" | "expired"> = {
  "00": "paid",
  "01": "pending",
  "03": "pending",
  "04": "failed",
  "05": "failed",
  "06": "failed",
  "08": "expired",
  "09": "failed",
};

export function mapMidtransSnapStatus(code?: string): "paid" | "pending" | "failed" | "expired" {
  const raw = String(code ?? "").trim();
  if (!raw) return "pending";
  const normalized = raw.length === 1 ? `0${raw}` : raw;
  return MIDTRANS_SNAP_TRANSACTION_STATUS[normalized] || "pending";
}

/** Apakah `responseCode` menandakan sukses (selalu berawalan "200"). */
export function isMidtransSnapSuccess(data: any): boolean {
  return String(data?.responseCode ?? "").startsWith("200");
}

/** Pesan error ringkas dari respons SNAP yang ditolak. */
export function describeMidtransSnapFailure(data: any): string {
  const message = data?.responseMessage || data?.message;
  const code = data?.responseCode ? ` (${data.responseCode})` : "";
  return message
    ? `${message}${code}`
    : `Midtrans BI-SNAP menolak request${code || " (responseCode tidak diketahui)"}`;
}

/** Nominal BI-SNAP dikirim sebagai string dengan 2 desimal ("1500.00"). */
export function formatSnapAmount(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

/**
 * Sanitasi ID transaksi agar lolos validasi `partnerReferenceNo` (maks 36 karakter,
 * hanya alfanumerik serta `- _ ~ .`).
 *
 * Nilai ini dipakai ganda sebagai `X-EXTERNAL-ID`, sesuai ketentuan dokumen:
 * "The value should also be the same as request_body.partnerReferenceNo".
 */
export function toMidtransSnapReferenceNo(orderId: string): string {
  const sanitized = (orderId || "").replace(/[^A-Za-z0-9._~-]/g, "").slice(0, 36);
  return sanitized || `REF${Date.now()}`;
}

/** UUID untuk `X-EXTERNAL-ID` saat pemanggil butuh ID unik di luar order id. */
export function midtransSnapExternalId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

// ─── Body builders ───────────────────────────────────────────────────────────

export interface MidtransSnapQrisInput {
  orderId: string;
  amount: number;
  currency?: string;
  acquirer: string;
  merchantId?: string;
  validityPeriod?: string;
  customer?: { name?: string; email?: string; phone?: string };
  items?: any[];
}

/**
 * Body `POST /v1.0/qr/qr-mpm-generate`.
 * `partnerReferenceNo` wajib sama dengan `X-EXTERNAL-ID`.
 */
export function buildMidtransSnapQrisBody(input: MidtransSnapQrisInput): any {
  const referenceNo = toMidtransSnapReferenceNo(input.orderId);
  const additionalInfo: Record<string, any> = {
    acquirer: input.acquirer,
    merchantOrderId: input.orderId,
  };
  if (input.customer) {
    additionalInfo.customerDetails = {
      ...(input.customer.name ? { firstName: input.customer.name } : {}),
      ...(input.customer.email ? { email: input.customer.email } : {}),
      ...(input.customer.phone ? { phone: input.customer.phone } : {}),
    };
  }
  if (input.items?.length) additionalInfo.items = input.items;

  return {
    partnerReferenceNo: referenceNo,
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    amount: { value: formatSnapAmount(input.amount), currency: (input.currency || "IDR").toUpperCase() },
    ...(input.validityPeriod ? { validityPeriod: input.validityPeriod } : {}),
    additionalInfo,
  };
}

export interface MidtransSnapVaInput {
  orderId: string;
  amount: number;
  currency?: string;
  bank: string;
  partnerServiceId: string;
  customerNo: string;
  virtualAccountName?: string;
  virtualAccountEmail?: string;
  virtualAccountPhone?: string;
  expiredDate?: string;
  merchantId?: string;
  customer?: { name?: string; email?: string; phone?: string };
  items?: any[];
  randomizeVaNumber?: boolean;
}

/**
 * Body `POST /v1.0/transfer-va/create-va`.
 *
 * `partnerServiceId` (8 karakter, left-padded) & `customerNo` adalah data akun
 * merchant yang diberikan Midtrans — tidak bisa ditebak, jadi wajib diisi eksplisit.
 */
export function buildMidtransSnapVaBody(input: MidtransSnapVaInput): any {
  const vaNumber = `${input.partnerServiceId}${input.customerNo}`;
  const additionalInfo: Record<string, any> = {
    bank: input.bank,
    flags: { shouldRandomizeVaNumber: input.randomizeVaNumber ?? true },
  };
  if (input.merchantId) additionalInfo.merchantId = input.merchantId;
  if (input.customer) {
    additionalInfo.customerDetails = {
      ...(input.customer.name ? { firstName: input.customer.name } : {}),
      ...(input.customer.email ? { email: input.customer.email } : {}),
      ...(input.customer.phone ? { phone: input.customer.phone } : {}),
    };
  }
  if (input.items?.length) additionalInfo.items = input.items;

  return {
    partnerServiceId: input.partnerServiceId,
    customerNo: input.customerNo,
    virtualAccountNo: vaNumber,
    ...(input.virtualAccountName ? { virtualAccountName: input.virtualAccountName } : {}),
    ...(input.virtualAccountEmail ? { virtualAccountEmail: input.virtualAccountEmail } : {}),
    ...(input.virtualAccountPhone ? { virtualAccountPhone: input.virtualAccountPhone } : {}),
    trxId: toMidtransSnapReferenceNo(input.orderId),
    totalAmount: { value: formatSnapAmount(input.amount), currency: (input.currency || "IDR").toUpperCase() },
    ...(input.expiredDate ? { expiredDate: input.expiredDate } : {}),
    additionalInfo,
  };
}

/** Body query status QRIS (`POST /v1.0/qr/qr-mpm-query`). */
export function buildMidtransSnapQrisQueryBody(input: {
  originalReferenceNo?: string;
  originalPartnerReferenceNo?: string;
  merchantId?: string;
  amount?: number;
  currency?: string;
  additionalInfo?: Record<string, any>;
}): any {
  return {
    ...(input.originalReferenceNo ? { originalReferenceNo: input.originalReferenceNo } : {}),
    ...(input.originalPartnerReferenceNo
      ? { originalPartnerReferenceNo: input.originalPartnerReferenceNo }
      : {}),
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    ...(input.amount !== undefined
      ? { amount: { value: formatSnapAmount(input.amount), currency: (input.currency || "IDR").toUpperCase() } }
      : {}),
    ...(input.additionalInfo ? { additionalInfo: input.additionalInfo } : {}),
  };
}

/** Body query status VA (`POST /v1.0/transfer-va/status`). */
export function buildMidtransSnapVaStatusBody(input: {
  partnerServiceId: string;
  customerNo: string;
  virtualAccountNo?: string;
  trxId?: string;
  additionalInfo?: Record<string, any>;
}): any {
  return {
    partnerServiceId: input.partnerServiceId,
    customerNo: input.customerNo,
    virtualAccountNo: input.virtualAccountNo || `${input.partnerServiceId}${input.customerNo}`,
    ...(input.trxId ? { trxId: input.trxId } : {}),
    ...(input.additionalInfo ? { additionalInfo: input.additionalInfo } : {}),
  };
}

// ─── Response parsers ────────────────────────────────────────────────────────

/** Bentuk `InvoiceResponse` dari respons MPM QRIS SNAP. */
export function parseMidtransSnapQrisResponse(data: any, orderId: string, amount: number): InvoiceResponse {
  const reference = data?.referenceNo || data?.partnerReferenceNo;
  return {
    success: true,
    provider: "midtrans",
    orderId: data?.partnerReferenceNo || orderId,
    amount,
    mode: "qris",
    reference,
    qrString: data?.qrContent,
    qrCodeUrl: data?.qrUrl,
    rawResponse: data,
  };
}

/** Bentuk `InvoiceResponse` dari respons Create VA SNAP. */
export function parseMidtransSnapVaResponse(
  data: any,
  orderId: string,
  amount: number,
  bank: string
): InvoiceResponse {
  const va = data?.virtualAccountData || {};
  const totalAmount = va?.totalAmount?.value;
  return {
    success: true,
    provider: "midtrans",
    orderId,
    amount: totalAmount ? Number(totalAmount) : amount,
    mode: "va",
    reference: data?.referenceNo || va?.trxId || orderId,
    vaNumber: va?.virtualAccountNo,
    vaBank: bank,
    expiresAt: va?.expiredDate ? new Date(va.expiredDate) : undefined,
    rawResponse: data,
  };
}

// ─── HTTP client ─────────────────────────────────────────────────────────────

/** Error SNAP Midtrans dengan konteks (endpoint, HTTP status, responseCode). */
export class MidtransSnapError extends Error {
  readonly status: number;
  readonly responseCode?: string;
  readonly endpoint?: string;
  readonly raw: any;

  constructor(
    message: string,
    opts: { status?: number; code?: string; endpoint?: string; raw?: any } = {}
  ) {
    super(message);
    this.name = "MidtransSnapError";
    this.status = opts.status ?? 0;
    this.responseCode = opts.code;
    this.endpoint = opts.endpoint;
    this.raw = opts.raw;
  }
}

/** Cache token B2B per kombinasi clientId + private key (TTL mengikuti `expiresIn`). */
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Klien HTTP BI-SNAP Midtrans: menangani cache access token + penandatanganan
 * setiap request transaksi sesuai rumus ASPI.
 */
export class MidtransSnapClient {
  private readonly credentials: MidtransSnapCredentials;
  private readonly sandbox: boolean;

  constructor(config: ProviderConfig) {
    const { credentials } = resolveMidtransSnapCredentials(config);
    this.credentials = credentials;
    this.sandbox = !!config.sandbox;
  }

  get baseUrl(): string {
    return this.sandbox ? MIDTRANS_SNAP_DOMAINS.sandbox : MIDTRANS_SNAP_DOMAINS.production;
  }

  get isConfigured(): boolean {
    const { clientId, clientSecret, privateKey, partnerId } = this.credentials;
    return Boolean(clientId && clientSecret && privateKey && partnerId);
  }

  private get cacheKey(): string {
    const { clientId, privateKey } = this.credentials;
    return `${this.sandbox ? "sbx" : "prod"}:${clientId}:${crypto.createHash("sha256").update(privateKey).digest("hex").slice(0, 16)}`;
  }

  /** Ambil (atau mint ulang) B2B access token. */
  async getAccessToken(): Promise<string> {
    const cached = accessTokenCache.get(this.cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) return cached.token;

    const { clientId, privateKey } = this.credentials;
    if (!clientId || !privateKey) {
      throw new MidtransSnapError(
        "Midtrans SNAP: clientId & privateKey RSA wajib untuk meminta access token",
        { endpoint: MIDTRANS_SNAP_PATHS.accessToken }
      );
    }

    const timestamp = snapTimestamp();
    const signature = generateSnapAsymmetricSignature(privateKey, clientId, timestamp);

    const body = { grantType: "client_credentials" };
    let data = await this.postAccessToken(body, clientId, timestamp, signature);

    // Dokumen resmi menuliskan field `grantType`, sementara klien resmi Node
    // mengirim `grant_type`. Coba keduanya agar tahan terhadap perbedaan versi.
    if (!data?.accessToken) {
      const retry = await this.postAccessToken(
        { grant_type: "client_credentials" },
        clientId,
        timestamp,
        signature
      );
      if (retry?.accessToken) data = retry;
    }

    if (!data?.accessToken) {
      const message = data?.responseMessage || data?.message || "Midtrans SNAP get-token gagal";
      throw new MidtransSnapError(
        `${message}${data?.responseCode ? ` (${data.responseCode})` : ""}`,
        { status: data?.__status, code: data?.responseCode, endpoint: MIDTRANS_SNAP_PATHS.accessToken, raw: data }
      );
    }

    const expiresIn = Number(data.expiresIn || 900);
    accessTokenCache.set(this.cacheKey, {
      token: data.accessToken,
      // Refresh 60 detik sebelum kedaluwarsa untuk menghindari balapan.
      expiresAt: now + Math.max(expiresIn - 60, 30) * 1000,
    });
    return data.accessToken as string;
  }

  clearToken(): void {
    accessTokenCache.delete(this.cacheKey);
  }

  private async postAccessToken(
    body: any,
    clientId: string,
    timestamp: string,
    signature: string
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}${MIDTRANS_SNAP_PATHS.accessToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CLIENT-KEY": clientId,
        "X-TIMESTAMP": timestamp,
        "X-SIGNATURE": signature,
      },
      body: JSON.stringify(body),
    });

    const data = await this.parseResponse(response);
    if (data && typeof data === "object") data.__status = response.status;
    return data;
  }

  /**
   * Request transaksi SNAP yang sudah ditandatangani.
   *
   * @param endpoint Request-target path, mis. `/v1.0/qr/qr-mpm-generate`.
   * @param body     Body JSON (string hasil serialisasi dipakai ulang untuk signature).
   * @param opts     Override `externalId` / `deviceId` / header tambahan.
   */
  async request(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    endpoint: string,
    body?: any,
    opts: {
      externalId?: string;
      deviceId?: string;
      ipAddress?: string;
      extraHeaders?: Record<string, string>;
      /**
       * Body mentah untuk signature — dipakai bila signature harus dihitung atas
       * serialisasi spesifik pemanggil, bukan `JSON.stringify(body)`.
       */
      rawBody?: string;
    } = {}
  ): Promise<any> {
    const { clientSecret, partnerId, channelId } = this.credentials;
    if (!clientSecret || !partnerId) {
      throw new MidtransSnapError(
        "Midtrans SNAP: clientSecret & partnerId wajib untuk request transaksi",
        { endpoint }
      );
    }

    const accessToken = await this.getAccessToken();
    const timestamp = snapTimestamp();
    const externalId = opts.externalId || midtransSnapExternalId();
    const serializedBody =
      opts.rawBody !== undefined
        ? opts.rawBody
        : body === undefined
          ? ""
          : JSON.stringify(body);

    const signature = generateSnapSymmetricSignature(
      clientSecret,
      method,
      endpoint,
      accessToken,
      serializedBody,
      timestamp
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-PARTNER-ID": partnerId,
      "X-EXTERNAL-ID": externalId,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": signature,
      "CHANNEL-ID": channelId,
      "X-DEVICE-ID": opts.deviceId || this.credentials.deviceId,
      ...(opts.ipAddress ? { "X-IP-ADDRESS": opts.ipAddress } : {}),
      ...(opts.extraHeaders || {}),
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      ...(body !== undefined && method !== "GET" ? { body: serializedBody } : {}),
    });

    const data = await this.parseResponse(response);

    if (!response.ok) {
      const message = data?.responseMessage || data?.message || `HTTP ${response.status}`;
      throw new MidtransSnapError(
        `${message}${data?.responseCode ? ` (${data.responseCode})` : ""}`,
        { status: response.status, code: data?.responseCode, endpoint, raw: data }
      );
    }

    return data;
  }

  private async parseResponse(response: any): Promise<any> {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** `POST /v1.0/qr/qr-mpm-generate` */
  async createQris(body: any, externalId?: string): Promise<any> {
    return this.request("POST", MIDTRANS_SNAP_PATHS.qrisGenerate, body, { externalId });
  }

  /** `POST /v1.0/transfer-va/create-va` */
  async createVa(body: any, externalId?: string): Promise<any> {
    return this.request("POST", MIDTRANS_SNAP_PATHS.vaCreate, body, { externalId });
  }

  /** `POST /v1.0/qr/qr-mpm-query` */
  async queryQris(body: any): Promise<any> {
    return this.request("POST", MIDTRANS_SNAP_PATHS.qrisQuery, body);
  }

  /** `POST /v1.0/transfer-va/status` */
  async queryVa(body: any): Promise<any> {
    return this.request("POST", MIDTRANS_SNAP_PATHS.vaStatus, body);
  }
}

// ─── Notifikasi ──────────────────────────────────────────────────────────────

/**
 * Verifikasi notifikasi SNAP Midtrans.
 *
 * Midtrans menandatangani notifikasi secara **asimetris** dengan private key-nya,
 * dan merchant memverifikasi memakai **Midtrans public key**:
 *
 *   stringToVerify = HTTPMethod + ":" + urlPath + ":" +
 *                    Lowercase(HexEncode(SHA-256(minify(body)))) + ":" + X-TIMESTAMP
 *
 * Catatan: notifikasi Virtual Account **tetap** memakai format legacy
 * (`signature_key` SHA-512), jadi fungsi ini hanya untuk flow SNAP
 * (MPM QRIS & Direct Debit).
 */
export function verifyMidtransSnapNotificationSignature(opts: {
  body: any;
  urlPath: string;
  timeStamp: string;
  signature: string;
  publicKey: string;
  httpMethod?: string;
}): boolean {
  const { body, urlPath, timeStamp, signature, publicKey } = opts;
  if (!body || !urlPath || !timeStamp || !signature || !publicKey) return false;

  const stringToVerify = `${(opts.httpMethod || "POST").toUpperCase()}:${urlPath}:${sha256Hex(body)}:${timeStamp}`;

  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(stringToVerify, "utf8");
    return verifier.verify(normalizeSnapPublicKey(publicKey), signature, "base64");
  } catch {
    return false;
  }
}

/** Terima public key dalam bentuk PEM utuh atau body base64 tanpa header. */
export function normalizeSnapPublicKey(key: string): string {
  const trimmed = (key || "").trim();
  if (trimmed.includes("-----BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") || trimmed;
  return ["-----BEGIN PUBLIC KEY-----", body, "-----END PUBLIC KEY-----"].join("\n");
}

/**
 * Ambil ID transaksi dari payload notifikasi SNAP.
 * QRIS memakai `originalPartnerReferenceNo`/`originalReferenceNo`,
 * Direct Debit memakai `originalPartnerReferenceNo`/`merchantId`.
 */
export function extractMidtransSnapNotificationOrderId(body: any): string {
  if (!body) return "";
  const extra = body?.additionalInfo || {};
  return (
    body.originalPartnerReferenceNo ||
    body.partnerReferenceNo ||
    body.originalExternalId ||
    body.originalReferenceNo ||
    extra.merchantOrderId ||
    body.order_id ||
    ""
  );
}
