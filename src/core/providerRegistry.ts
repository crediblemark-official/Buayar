import {
  CANONICAL_TO_DUITKU, CANONICAL_TO_MIDTRANS, CANONICAL_TO_IPAYMU,
  CANONICAL_TO_XENDIT, CANONICAL_TO_DOKU, CANONICAL_TO_PRISMALINK,
  CANONICAL_TO_FASPAY, CANONICAL_TO_FINPAY, CANONICAL_TO_NICEPAY,
  CANONICAL_TO_OY, CANONICAL_TO_STRIPE,
} from "./canonical";

export interface ProviderCapability {
  /** Metode pembayaran kanonik yang didukung provider ini */
  methods: string[];
  /** Operasi lanjutan yang didukung */
  operations: { refund: boolean; checkBalance: boolean; disburse: boolean };
}

export interface ProviderDescriptor extends ProviderCapability {
  name: string;
  /** Kunci env kredensial yang menandakan provider ini aktif (untuk autodetect) */
  envKeys: string[];
}

/**
 * Pendeteksi / registrar provider dinamis.
 * Metadata provider terpusat di sini sehingga:
 *  - Daftar provider bisa ditambah tanpa ubah core (register(...)).
 *  - Provider aktif bisa di-autodetect dari kredensial .env.
 *  - Provider pengirim webhook bisa ditebak dari struktur payload.
 *  - Capability (metode + operasi) bisa di-query secara runtime.
 */
export class ProviderRegistry {
  private descriptors = new Map<string, ProviderDescriptor>();

  constructor(initial?: ProviderDescriptor[]) {
    // Provider kustom didaftarkan lebih dulu (boleh menimpa bawaan).
    for (const d of initial || []) this.register(d);
  }

  register(desc: ProviderDescriptor): void {
    this.descriptors.set(desc.name.toLowerCase().trim(), desc);
  }

  unregister(name: string): boolean {
    return this.descriptors.delete(name.toLowerCase().trim());
  }

  has(name: string): boolean {
    return this.descriptors.has(name.toLowerCase().trim());
  }

  get(name: string): ProviderDescriptor | undefined {
    return this.descriptors.get(name.toLowerCase().trim());
  }

  names(): string[] {
    return [...this.descriptors.keys()];
  }

  /**
   * Autodetect provider aktif dari variabel lingkungan.
   * Mengembalikan nama provider yang kredensial .env-nya terisi penuh,
   * atau undefined jika tidak ada / ambigu.
   */
  detectFromEnv(env: Record<string, string | undefined>): string | undefined {
    const present: { name: string; count: number }[] = [];
    for (const [name, desc] of this.descriptors) {
      const filled = desc.envKeys.filter((k) => {
        const v = env[k];
        return typeof v === "string" && v.trim().length > 0;
      });
      if (filled.length > 0) present.push({ name, count: filled.length });
    }
    if (present.length === 0) return undefined;
    // Ambil provider dengan jumlah kredensial terbanyak; anggap ambigu bila seri.
    present.sort((a, b) => b.count - a.count);
    const top = present[0];
    const ties = present.filter((p) => p.count === top.count);
    return ties.length === 1 ? top.name : undefined;
  }

  /**
   * Autodetect provider dari struktur payload webhook.
   * Mengembalikan nama provider jika dikenali, else undefined.
   */
  detectFromWebhook(payload: any): string | undefined {
    if (!payload) return undefined;
    const p = payload;

    if (p.signature_key && p.transaction_status) return "midtrans";
    if (p.merchantCode && p.merchantOrderId && p.resultCode) return "duitku";
    if (p.trx_id && (p.sid || p.reference_id || p.via)) return "ipaymu";
    if (p.service?.id || (p.order?.invoice_number && p.transaction?.status)) return "doku";
    if (p.bill_no && (p.payment_status_code !== undefined || p.payment_status_desc)) return "faspay";
    if (p.merchant_id && p.order_id && p.payment_status) return "finpay";
    if (p.tXid && p.merchantToken && (p.referenceNo || p.amt)) return "nicepay";
    if (p.partner_tx_id || p.partner_trx_id) return "oy";
    if (p.merchant_id && p.order_id && p.signature) return "prismalink";
    if (p.object === "event" || (p.type && p.data?.object && p.api_version)) return "stripe";
    if (p.event && p.payload?.payment?.entity) return "razorpay";
    if (p.external_id || p.event?.startsWith("payment.") || p.event?.startsWith("qr.") || p.data?.reference_id) return "xendit";
    if (p.event_type && p.resource && (p.event_type.startsWith("PAYMENT.") || p.event_type.startsWith("CHECKOUT.ORDER."))) return "paypal";
    if (p.notificationItems || (p.merchantAccountCode && p.pspReference && p.eventCode)) return "adyen";
    if (p.type && p.data?._links && (p.type.startsWith("payment_") || p.type.startsWith("refund_"))) return "checkoutcom";
    if (p.type && p.data?.object?.status && p.merchant_id) return "square";
    if (p.order && p.order?.status && p.order?.extOrderId) return "payu";
    if (p.kind && p.subject?.transaction) return "braintree";
    if (p.HASH && p.REFNOEXT && p.IPN_PID) return "twocheckout";

    return undefined;
  }
}

// Kredensial env yang menandakan tiap provider aktif.
const ENV_KEYS: Record<string, string[]> = {
  midtrans:     ["MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY"],
  duitku:       ["DUITKU_API_KEY", "DUITKU_MERCHANT_CODE"],
  ipaymu:       ["IPAYMU_API_KEY", "IPAYMU_VA"],
  xendit:       ["XENDIT_SECRET_KEY", "XENDIT_WEBHOOK_TOKEN"],
  doku:         ["DOKU_CLIENT_ID", "DOKU_SECRET_KEY"],
  prismalink:   ["PRISMALINK_MERCHANT_ID", "PRISMALINK_SECRET_KEY"],
  faspay:       ["FASPAY_MERCHANT_ID", "FASPAY_USER_ID", "FASPAY_PASSWORD"],
  finpay:       ["FINPAY_MERCHANT_ID", "FINPAY_MERCHANT_KEY"],
  nicepay:      ["NICEPAY_IMID", "NICEPAY_KEY"],
  oy:           ["OY_USERNAME", "OY_API_KEY"],
  stripe:       ["STRIPE_SECRET_KEY", "STRIPE_PUBLIC_KEY", "STRIPE_WEBHOOK_SECRET"],
  paypal:       ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID"],
  adyen:        ["ADYEN_API_KEY", "ADYEN_MERCHANT_ACCOUNT", "ADYEN_HMAC_KEY"],
  checkoutcom:  ["CHECKOUTCOM_SECRET_KEY", "CHECKOUTCOM_PUBLIC_KEY", "CHECKOUTCOM_WEBHOOK_SECRET"],
  razorpay:     ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  square:       ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID", "SQUARE_WEBHOOK_SIGNATURE_KEY"],
  payu:         ["PAYU_POS_ID", "PAYU_MD5_KEY"],
  braintree:    ["BRAINTREE_MERCHANT_ID", "BRAINTREE_PUBLIC_KEY", "BRAINTREE_PRIVATE_KEY"],
  twocheckout:  ["TWOCHECKOUT_MERCHANT_CODE", "TWOCHECKOUT_SECRET_KEY", "TWOCHECKOUT_SECRET_WORD"],
};

// Metode kanonik per provider (layout dari core/canonical + static internasional).
const WORKING_METHODS: Record<string, string[]> = {
  midtrans: Object.keys(CANONICAL_TO_MIDTRANS),
  duitku: Object.keys(CANONICAL_TO_DUITKU),
  ipaymu: Object.keys(CANONICAL_TO_IPAYMU),
  xendit: Object.keys(CANONICAL_TO_XENDIT),
  doku: Object.keys(CANONICAL_TO_DOKU),
  prismalink: Object.keys(CANONICAL_TO_PRISMALINK),
  faspay: Object.keys(CANONICAL_TO_FASPAY),
  finpay: Object.keys(CANONICAL_TO_FINPAY),
  nicepay: Object.keys(CANONICAL_TO_NICEPAY),
  oy: Object.keys(CANONICAL_TO_OY),
  stripe: Object.keys(CANONICAL_TO_STRIPE),
  paypal: ["credit_card", "paylater", "paypal", "bank_transfer"],
  adyen: ["credit_card", "paypal", "qris", "apple_pay", "google_pay", "klarna", "sepa"],
  checkoutcom: ["credit_card", "paypal", "apple_pay", "google_pay", "klarna", "sofort", "bank_transfer"],
  razorpay: ["credit_card", "wallet", "upi", "netbanking", "emi", "bank_transfer"],
  square: ["credit_card", "apple_pay", "google_pay", "afterpay", "cash_app"],
  payu: ["credit_card", "bank_transfer", "apple_pay", "google_pay", "blik", "installment"],
  braintree: ["credit_card", "paypal", "apple_pay", "google_pay", "venmo"],
  twocheckout: ["credit_card", "paypal", "paylater", "wire_transfer"],
};

// Operasi didukung (sinkron dengan switch di PaymentManager).
const OPERATIONS: Record<string, { refund: boolean; checkBalance: boolean; disburse: boolean }> = {
  midtrans: { refund: true, checkBalance: true, disburse: false },
  duitku: { refund: false, checkBalance: true, disburse: true },
  ipaymu: { refund: false, checkBalance: true, disburse: false },
  xendit: { refund: false, checkBalance: true, disburse: true },
  doku: { refund: false, checkBalance: false, disburse: false },
  prismalink: { refund: false, checkBalance: false, disburse: false },
  faspay: { refund: false, checkBalance: false, disburse: false },
  finpay: { refund: false, checkBalance: false, disburse: false },
  nicepay: { refund: false, checkBalance: false, disburse: false },
  oy: { refund: false, checkBalance: true, disburse: true },
  stripe: { refund: true, checkBalance: true, disburse: false },
  paypal: { refund: true, checkBalance: true, disburse: false },
  adyen: { refund: true, checkBalance: false, disburse: false },
  checkoutcom: { refund: true, checkBalance: true, disburse: false },
  razorpay: { refund: true, checkBalance: true, disburse: false },
  square: { refund: true, checkBalance: true, disburse: false },
  payu: { refund: true, checkBalance: false, disburse: false },
  braintree: { refund: true, checkBalance: false, disburse: false },
  twocheckout: { refund: true, checkBalance: false, disburse: false },
};

export function buildDefaultDescriptors(): ProviderDescriptor[] {
  return Object.keys(ENV_KEYS).map((name) => ({
    name,
    envKeys: ENV_KEYS[name],
    methods: WORKING_METHODS[name] || [],
    operations: OPERATIONS[name] || { refund: false, checkBalance: false, disburse: false },
  }));
}

export const providerRegistry = new ProviderRegistry(buildDefaultDescriptors());
