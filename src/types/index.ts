import { CanonicalPaymentMethod } from "./canonical";

export * from "./canonical";

export interface CustomerDetails {
  name: string;
  email: string;
  phone?: string;
}

export interface CreateInvoiceParams {
  orderId: string;
  amount: number;
  productDetails: string;
  customer: CustomerDetails;
  returnUrl?: string;
  callbackUrl?: string;
  /**
   * Payment method code.
   * Mendukung Canonical Code (contoh: "bca_va", "mandiri_va", "qris", "gopay", "shopeepay", "alfamart", "indomaret")
   * atau kode raw spesifik provider (contoh Duitku: "BC", "M2", "SP").
   * Jika dikosongkan, akan beralih ke Mode Semi Integrasi (Redirect Checkout).
   */
  paymentMethod?: CanonicalPaymentMethod | string;
  /**
   * Kode mata uang ISO 4217 (opsional). Default: 'IDR'.
   * Contoh: 'idr', 'usd', 'sgd'
   */
  currency?: string;
  /**
   * Pilihan pembebanan biaya transaksi (didukung iPaymu dll).
   * 'MERCHANT' = biaya transaksi dipotong dari omset merchant (default).
   * 'BUYER' = biaya transaksi ditambahkan ke total tagihan pembeli.
   */
  feeDirection?: "MERCHANT" | "BUYER";
  /**
   * Mengaktifkan sistem Escrow (Rekening Bersama) jika didukung provider.
   */
  escrow?: boolean;
  /**
   * Rincian item produk (opsional, untuk multi-item cart / logistik).
   */
  items?: Array<{
    id?: string;
    name: string;
    price: number;
    quantity: number;
    description?: string;
    weight?: number;
    length?: number;
    width?: number;
    height?: number;
  }>;
  /**
   * Nomor sub-account / child account tujuan split payment (didukung iPaymu dll).
   * Pada iPaymu, diisi nomor Virtual Account (VA) child account milik agen / reseller / mitra.
   */
  subAccountId?: string;
  /** Parameter kustom tambahan untuk provider spesifik (opsional) */
  providerParams?: any;
  /** Konfigurasi atau data kustom tambahan untuk provider (opsional) */
  extra?: Record<string, any>;
}

export interface MandiriBillInfo {
  billerCode?: string;
  billKey?: string;
}

export interface InvoiceResponse {
  success: boolean;
  /** Provider yang memproses invoice ini ('midtrans' | 'duitku' | 'doku' ...) */
  provider?: string;
  /** Order ID unik dari merchant */
  orderId?: string;
  /** Nominal transaksi */
  amount?: number;
  /** URL Checkout / Redirect untuk mode Semi-Integrasi */
  paymentUrl?: string;
  /** Reference number dari Payment Gateway */
  reference?: string;
  /** Dimensi hasil kanal spesifik (VA / QRIS / e-Wallet / Checkout) untuk typing strict. */
  mode?: PaymentMode;

  // ─── Direct API / Full Custom Native UI Fields ───────────────────────────
  /** Nomor Virtual Account (untuk metode Bank Transfer / VA) */
  vaNumber?: string;
  /** Nama Bank dari Virtual Account (misal: "bca", "bni", "bri", "mandiri", "permata") */
  vaBank?: string;
  /** Raw EMVCo QRIS string standar nasional untuk dirender ke Canvas / SVG QR */
  qrString?: string;
  /** URL Gambar QR Code langsung */
  qrCodeUrl?: string;
  /** Kode pembayaran gerai retail (Indomaret / Alfamart) */
  paymentCode?: string;
  /** Deep link URL untuk membuka langsung aplikasi e-wallet (GoPay, ShopeePay, DANA) di mobile */
  deeplink?: string;
  /** Informasi biller khusus Mandiri E-Channel */
  billInfo?: MandiriBillInfo;
  /** Waktu kedaluwarsa tagihan pembayaran */
  expiresAt?: Date | string;

  /** Raw response asli dari API provider (termasuk saat gagal) */
  rawResponse: any;
  /** Pesan error jika gagal */
  error?: string;
}

/** Kanal pembayaran hasil invoice — membantu typing strict dan rendering UI. */
export type PaymentMode = "checkout" | "va" | "qris" | "ewallet" | "retail" | "other";

/** Hasil invoice khusus Virtual Account (mode === 'va'). */
export interface VirtualAccountResponse extends InvoiceResponse {
  mode: "va";
  vaNumber: string;
  vaBank?: string;
}

/** Hasil invoice khusus QRIS (mode === 'qris'). */
export interface QrisResponse extends InvoiceResponse {
  mode: "qris";
  qrString: string;
  qrCodeUrl?: string;
}

/** Hasil invoice khusus e-Wallet (mode === 'ewallet'). */
export interface EWalletResponse extends InvoiceResponse {
  mode: "ewallet";
  checkoutUrl?: string;
  paymentUrl?: string;
  deeplink?: string;
}

export interface VerifyCallbackResult {
  isValid: boolean;
  provider?: string;
  orderId: string;
  amount: number;
  /** Status transaksi terstandarisasi */
  status: "paid" | "pending" | "failed" | "expired";
  /** Boolean helper: bernilai true jika transaksi sukses terbayar */
  isPaid: boolean;
  /** Boolean helper: bernilai true jika transaksi masih menunggu pembayaran */
  isPending: boolean;
  /** Boolean helper: bernilai true jika transaksi gagal/dibatalkan */
  isFailed: boolean;
  /** Boolean helper: bernilai true jika transaksi telah kedaluwarsa */
  isExpired: boolean;
  /** Kode status asli dari provider */
  statusCode?: string;
  /** Waktu transaksi dicatat */
  transactionTime?: Date | string;
  /** Raw payload callback asli dari webhook */
  rawPayload: any;
}

export interface ProviderConfig {
  merchantCode?: string;
  apiKey?: string;
  sandbox?: boolean;
  
  // Kredensial spesifik / universal tambahan jika dibutuhkan PG tertentu
  clientKey?: string;
  serverKey?: string;
  merchantId?: string;
  projectId?: string;
  publicKey?: string;
  privateKey?: string;
  secretKey?: string;
  customBaseUrl?: string;
  callbackUrl?: string;
  returnUrl?: string;
  
  /** Wadah konfigurasi ekstra fleksibel untuk custom provider */
  extra?: Record<string, any>;
}

export interface BuayarConfig extends ProviderConfig {
  /**
   * Nama provider aktif.
   * Contoh: "midtrans" | "duitku"
   * Jika tidak diisi, otomatis membaca process.env.PAYMENT_PROVIDER atau process.env.BUAYAR_PROVIDER
   */
  provider?: string;
}

// ─── Get Payment Methods (Accordion Ready) ───────────────────────────────────

export interface GetPaymentMethodsParams {
  /** Nominal transaksi (integer) untuk menghitung fee admin dinamis */
  amount?: number;
}

export interface PaymentMethodItem {
  /** Kode canonical Buayar, contoh: "bca_va", "qris", "gopay" */
  code: string;
  /** Kode asli bawaan provider, contoh: "BC", "SP", "bank_transfer" */
  providerCode: string;
  /** Nama metode pembayaran yang ramah pengguna, contoh: "BCA Virtual Account" */
  name: string;
  /** URL logo icon metode pembayaran */
  image: string;
  /** Biaya admin transaksi */
  fee: {
    flat: number;
    percent: number;
    totalFee: number;
  };
  /** Minimum & Maksimum transaksi yang diperbolehkan */
  minAmount?: number;
  maxAmount?: number;
  /** Status ketersediaan channel */
  isOnline: boolean;
  /** Kategori grup untuk Accordion UI */
  category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya" | string;
}

export interface PaymentMethod {
  paymentMethod: string;
  paymentName: string;
  paymentImage: string;
  totalFee: string;
  category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya" | string;
  code?: string;
  extra?: any;
  feeDetail?: {
    flat: number;
    percent: number;
    totalFee: number;
  };
}

export interface GetPaymentMethodsResult {
  success: boolean;
  provider?: string;
  /** Daftar seluruh channel metode pembayaran */
  methods: PaymentMethod[];
  /** Pengelompokan channel per kategori yang sudah siap dirender sebagai Accordion UI */
  categories?: Record<string, PaymentMethod[]>;
  error?: string;
  rawResponse: any;
}

/**
 * Deskriptor saluran pembayaran kanonikal siap-render untuk UI.
 * Dibangun dari {@link PaymentMethod} via `buildPaymentMethodDescriptors()` di
 * `core/descriptor.ts` sehingga konsumen (frontend, snapshot, CLI) selalu
 * mendapat bentuk seragam tanpa perlu mapping ulang per provider.
 */
export interface PaymentMethodDescriptor {
  /** Identifier uppercase yang dipakai sistem internal (mis. 'BCA_VA', 'QRIS', 'GOPAY') */
  id: string;
  /** Nama ramah pengguna */
  name: string;
  /** Tipe singkat untuk icon/badge rendering */
  type: "qris" | "va" | "ewallet" | "retail" | "card" | "paylater" | "other";
  /** Ikon emoji */
  icon: string;
  /** Badge teks (mis. "Instan Bebas Biaya") */
  badge: string;
  /** URL logo (opsional) */
  image?: string;
  /** Kategori resmi Buayar (Virtual Account, QRIS, E-Wallet, dll) */
  category?: string;
  /** Apakah channel tersedia (true) atau coming-soon (false) */
  coming_soon?: boolean;
  /** Fee admin (string deskriptif, mis. "0.7%" atau "IDR 4,000") */
  totalFee?: string;
}

export interface GetPaymentMethodDescriptorsResult {
  success: boolean;
  provider?: string;
  descriptors: PaymentMethodDescriptor[];
  error?: string;
  generatedAt: string;
}

// ─── Check Transaction ─────────────────────────────────────────────────────────

export interface CheckTransactionParams {
  /** Merchant order ID saat pembuatan transaksi */
  merchantOrderId: string;
}

export interface CheckTransactionResult {
  success: boolean;
  provider?: string;
  orderId: string;
  reference: string;
  amount: number;
  /** "00" = success/paid, "01" = pending, "02" = failed/expired */
  statusCode: string;
  status: "paid" | "pending" | "failed" | "expired";
  isPaid: boolean;
  isPending: boolean;
  isFailed: boolean;
  isExpired: boolean;
  statusMessage: string;
  paymentType?: string;
  transactionTime?: Date | string;
  error?: string;
  rawResponse: any;
}

// ─── Unified Refund / Balance / Disburse ────────────────────────────────────
// Lapisan operasi "mata tertutup": panggil satu API untuk semua provider yang
// mendukung fitur bersangkutan. Provider yang tidak mendukung akan mengembalikan
// result dengan `supported: false` — bukan error.

export interface RefundParams {
  /** ID transaksi / capture / payment sebagai target refund (per provider) */
  transactionId: string;
  /** Nominal refund (opsional; default = full refund) */
  amount?: number;
  /** Alasan refund (opsional bila didukung provider) */
  reason?: string;
  /** Kode mata uang (opsional, untuk provider internasional) */
  currency?: string;
}

export interface RefundResult {
  success: boolean;
  /** Provider yang menyatakan operasi ini tidak tersedia */
  supported: boolean;
  provider?: string;
  /** Reference / ID refund dari provider */
  reference?: string;
  /** Status refund dari provider (raw) */
  status?: string;
  error?: string;
  rawResponse: any;
}

export interface CheckBalanceResult {
  success: boolean;
  supported: boolean;
  provider?: string;
  /** Saldo merchant dalam satuan terkecil (minor unit) */
  balance?: number;
  /** Kode mata uang saldo (bila tersedia) */
  currency?: string;
  error?: string;
  rawResponse: any;
}

export interface DisburseParams {
  /** ID unik merchant untuk mengidentifikasi transfer (merchantOrderId / externalId / partnerTrxId) */
  externalId: string;
  /** Kode bank tujuan (mis. 'bca', '014', 'BCA' — ikuti aturan provider) */
  bankCode: string;
  /** Nama pemilik rekening tujuan (wajib untuk beberapa provider) */
  accountHolderName?: string;
  /** Nomor rekening tujuan */
  accountNumber: string;
  /** Nominal transfer */
  amount: number;
  /** Deskripsi / tujuan transfer */
  description?: string;
}

export interface DisburseResult {
  success: boolean;
  supported: boolean;
  provider?: string;
  /** Reference / status transfer dari provider */
  reference?: string;
  status?: string;
  error?: string;
  rawResponse: any;
}
