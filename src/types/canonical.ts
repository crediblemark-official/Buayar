export type CanonicalPaymentMethod =
  // Virtual Account
  | "bca_va"
  | "mandiri_va"
  | "bni_va"
  | "bri_va"
  | "permata_va"
  | "cimb_va"
  | "danamon_va"
  | "bsi_va"
  | "seabank_va"
  | "muamalat_va"
  | "bag_va"
  | "btn_va"
  | "artajasa_va"
  | "doku_va"
  | "maybank_va"
  | "bjb_va"
  | "bpd_bali_va"
  | "sinarmas_va"
  | "ocbc_va"
  | "bnc_va"
  | "bss_va"
  // QRIS
  | "qris"
  | "gopay_qris"
  | "shopeepay_qris"
  | "nobu_qris"
  // E-Wallet
  | "gopay"
  | "shopeepay"
  | "ovo"
  | "dana"
  | "linkaja"
  | "jenius"
  // Retail / Minimarket
  | "alfamart"
  | "indomaret"
  | "pos"
  // Kartu Kredit & Debit
  | "credit_card"
  | "debitonline"
  // Paylater & Cicilan
  | "kredivo"
  | "akulaku"
  | "indodana"
  // COD
  | "cod"
  // International Methods
  | "paypal"
  | "apple_pay"
  | "google_pay"
  | "bank_transfer"
  | "wallet"
  | "paylater"
  | "klarna"
  | "sepa"
  | "sofort"
  | "upi"
  | "netbanking"
  | "emi"
  | "afterpay"
  | "cash_app"
  | "blik"
  | "installment"
  | "venmo"
  | "wire_transfer";

/**
 * Escape hatch eksplisit untuk kode internal spesifik provider yang tidak portabel.
 * Menandakan dengan jelas saat code review bahwa metode ini sengaja non-portable.
 */
export type RawProviderMethod = {
  raw: string;
  providerOnly: true;
};

export type PaymentMethodInput = CanonicalPaymentMethod | RawProviderMethod;

/**
 * Helper untuk mengekstrak string kode pembayaran dari PaymentMethodInput.
 */
export function resolvePaymentMethodCode(method?: PaymentMethodInput | string): string | undefined {
  if (!method) return undefined;
  if (typeof method === "object" && method !== null && "raw" in method) {
    return method.raw;
  }
  return typeof method === "string" ? method : undefined;
}
