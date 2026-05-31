export interface CreateInvoiceParams {
  orderId: string;
  amount: number;
  productDetails: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  returnUrl: string;
  callbackUrl: string;
  /** Specific Duitku payment method code (e.g. "BCA", "I1", "OV"). If omitted, all methods are available via Duitku's redirect page. */
  paymentMethod?: string;
}

export interface InvoiceResponse {
  success: boolean;
  paymentUrl?: string;
  reference?: string;
  /** Virtual Account number (for bank VA methods) */
  vaNumber?: string;
  /** QRIS string for display in a QR code */
  qrString?: string;
  /** Duitku-hosted QR code image URL */
  qrCodeUrl?: string;
  /** Generic payment code (for retail/minimarket methods like Indomaret) */
  paymentCode?: string;
  rawResponse: any;
  error?: string;
}

export interface VerifyCallbackResult {
  isValid: boolean;
  orderId: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  rawPayload: any;
}

export interface ProviderConfig {
  merchantCode: string;
  apiKey: string;
  sandbox: boolean;
}

// ─── Get Payment Methods ───────────────────────────────────────────────────────

export interface GetPaymentMethodsParams {
  /** Transaction amount (integer, no decimal) */
  amount: number;
}

export interface PaymentMethod {
  /** Provider-specific method code, e.g. "BT", "I1", "OL" */
  paymentMethod: string;
  /** Human-readable name, e.g. "BCA Virtual Account" */
  paymentName: string;
  /** URL to payment method logo/image */
  paymentImage: string;
  /** Total transaction fee in IDR (string from API) */
  totalFee: string;
  /** Categorized payment channel (Virtual Account, QRIS, E-Wallet, Retail / Gerai, Kartu Kredit, Paylater / Cicilan, Lainnya) */
  category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya";
}

export interface GetPaymentMethodsResult {
  success: boolean;
  methods: PaymentMethod[];
  error?: string;
  rawResponse: any;
}

// ─── Check Transaction ─────────────────────────────────────────────────────────

export interface CheckTransactionParams {
  /** The merchant order ID used when creating the invoice */
  merchantOrderId: string;
}

export interface CheckTransactionResult {
  success: boolean;
  orderId: string;
  reference: string;
  amount: number;
  /** "00" = success/paid, "01" = pending, "02" = failed/expired */
  statusCode: string;
  status: "paid" | "pending" | "failed";
  statusMessage: string;
  error?: string;
  rawResponse: any;
}

