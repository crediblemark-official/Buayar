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
  /** Parameter kustom tambahan untuk provider spesifik (opsional) */
  providerParams?: any;
}

export interface MandiriBillInfo {
  billerCode?: string;
  billKey?: string;
}

export interface InvoiceResponse {
  success: boolean;
  /** Provider yang memproses invoice ini ('midtrans' | 'duitku') */
  provider?: string;
  /** Order ID unik dari merchant */
  orderId?: string;
  /** Nominal transaksi */
  amount?: number;
  /** URL Checkout / Redirect untuk mode Semi-Integrasi */
  paymentUrl?: string;
  /** Reference number dari Payment Gateway */
  reference?: string;

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

  /** Raw response asli dari API provider */
  rawResponse: any;
  /** Pesan error jika gagal */
  error?: string;
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
  category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya";
}

export interface PaymentMethod {
  paymentMethod: string;
  paymentName: string;
  paymentImage: string;
  totalFee: string;
  category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya";
  code?: string;
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
