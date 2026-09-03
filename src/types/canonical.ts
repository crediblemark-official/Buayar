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
  | "artajasa_va"
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
  // Paylater & Cicilan
  | "kredivo"
  | "akulaku"
  | "indodana"
  | string;
