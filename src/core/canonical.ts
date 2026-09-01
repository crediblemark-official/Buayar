import type { CanonicalPaymentMethod } from "../types";

export type { CanonicalPaymentMethod };

/**
 * Mapping dari Canonical Payment Method ke kode internal Duitku
 */
export const CANONICAL_TO_DUITKU: Record<string, string> = {
  // Virtual Account
  bca_va: "BC",
  mandiri_va: "M2",
  bni_va: "I1",
  bri_va: "BR",
  permata_va: "BT",
  cimb_va: "B1",
  danamon_va: "DM",
  bsi_va: "BS",
  seabank_va: "S1",
  muamalat_va: "MY",
  artajasa_va: "AG",
  // QRIS
  qris: "SP",
  gopay_qris: "SP",
  shopeepay_qris: "SP",
  nobu_qris: "NQ",
  // E-Wallet
  gopay: "GP",
  shopeepay: "SA",
  ovo: "OV",
  dana: "DA",
  linkaja: "LA",
  jenius: "JA",
  // Retail
  alfamart: "AL",
  indomaret: "IR",
  pos: "FT",
  // Card
  credit_card: "VC",
  // Paylater
  indodana: "ID",
  akulaku: "AT",
  kredivo: "KV",
};

/**
 * Mapping dari kode internal Duitku ke Canonical Payment Method
 */
export const DUITKU_TO_CANONICAL: Record<string, string> = {
  BC: "bca_va",
  M2: "mandiri_va",
  I1: "bni_va",
  BR: "bri_va",
  BT: "permata_va",
  B1: "cimb_va",
  DM: "danamon_va",
  BS: "bsi_va",
  S1: "seabank_va",
  MY: "muamalat_va",
  AG: "artajasa_va",
  SP: "qris",
  NQ: "nobu_qris",
  GP: "gopay",
  SA: "shopeepay",
  OV: "ovo",
  DA: "dana",
  LA: "linkaja",
  JA: "jenius",
  AL: "alfamart",
  IR: "indomaret",
  FT: "pos",
  VC: "credit_card",
  ID: "indodana",
  AT: "akulaku",
  KV: "kredivo",
};

/**
 * Mapping dari Canonical Payment Method ke parameter charge Midtrans Core API
 */
export const CANONICAL_TO_MIDTRANS: Record<string, { payment_type: string; bank?: string }> = {
  bca_va: { payment_type: "bank_transfer", bank: "bca" },
  bni_va: { payment_type: "bank_transfer", bank: "bni" },
  bri_va: { payment_type: "bank_transfer", bank: "bri" },
  permata_va: { payment_type: "bank_transfer", bank: "permata" },
  cimb_va: { payment_type: "bank_transfer", bank: "cimb" },
  danamon_va: { payment_type: "bank_transfer", bank: "danamon" },
  bsi_va: { payment_type: "bank_transfer", bank: "bsi" },
  seabank_va: { payment_type: "bank_transfer", bank: "seabank" },
  mandiri_va: { payment_type: "echannel" },
  qris: { payment_type: "qris" },
  gopay_qris: { payment_type: "qris" },
  shopeepay_qris: { payment_type: "qris" },
  gopay: { payment_type: "gopay" },
  shopeepay: { payment_type: "shopeepay" },
  ovo: { payment_type: "ovo" },
  dana: { payment_type: "dana" },
  linkaja: { payment_type: "linkaja" },
  alfamart: { payment_type: "cstore" },
  indomaret: { payment_type: "cstore" },
  credit_card: { payment_type: "credit_card" },
  kredivo: { payment_type: "kredivo" },
  akulaku: { payment_type: "akulaku" },
};

/**
 * Mapping dari Canonical Payment Method ke parameter direct iPaymu
 */
export const CANONICAL_TO_IPAYMU: Record<string, { paymentMethod: string; paymentChannel: string }> = {
  bca_va: { paymentMethod: "va", paymentChannel: "bca" },
  bni_va: { paymentMethod: "va", paymentChannel: "bni" },
  bri_va: { paymentMethod: "va", paymentChannel: "bri" },
  mandiri_va: { paymentMethod: "va", paymentChannel: "mandiri" },
  cimb_va: { paymentMethod: "va", paymentChannel: "cimb" },
  permata_va: { paymentMethod: "va", paymentChannel: "permata" },
  danamon_va: { paymentMethod: "va", paymentChannel: "danamon" },
  bsi_va: { paymentMethod: "va", paymentChannel: "bsi" },
  qris: { paymentMethod: "qris", paymentChannel: "mpm" },
  gopay_qris: { paymentMethod: "qris", paymentChannel: "mpm" },
  shopeepay_qris: { paymentMethod: "qris", paymentChannel: "mpm" },
  alfamart: { paymentMethod: "cstore", paymentChannel: "alfamart" },
  indomaret: { paymentMethod: "cstore", paymentChannel: "indomaret" },
  credit_card: { paymentMethod: "cc", paymentChannel: "cc" },
  akulaku: { paymentMethod: "paylater", paymentChannel: "akulaku" },
  kredivo: { paymentMethod: "paylater", paymentChannel: "kredivo" },
};

/**
 * Mapping dari Canonical Payment Method ke parameter Payment Requests API Xendit
 */
export const CANONICAL_TO_XENDIT: Record<string, { type: string; channel_code?: string }> = {
  bca_va: { type: "VIRTUAL_ACCOUNT", channel_code: "BCA" },
  mandiri_va: { type: "VIRTUAL_ACCOUNT", channel_code: "MANDIRI" },
  bni_va: { type: "VIRTUAL_ACCOUNT", channel_code: "BNI" },
  bri_va: { type: "VIRTUAL_ACCOUNT", channel_code: "BRI" },
  permata_va: { type: "VIRTUAL_ACCOUNT", channel_code: "PERMATA" },
  cimb_va: { type: "VIRTUAL_ACCOUNT", channel_code: "CIMB" },
  danamon_va: { type: "VIRTUAL_ACCOUNT", channel_code: "DANAMON" },
  bsi_va: { type: "VIRTUAL_ACCOUNT", channel_code: "BSI" },
  seabank_va: { type: "VIRTUAL_ACCOUNT", channel_code: "SEABANK" },
  qris: { type: "QR_CODE", channel_code: "QRIS" },
  gopay_qris: { type: "QR_CODE", channel_code: "QRIS" },
  shopeepay_qris: { type: "QR_CODE", channel_code: "QRIS" },
  gopay: { type: "EWALLET", channel_code: "GOPAY" },
  shopeepay: { type: "EWALLET", channel_code: "SHOPEEPAY" },
  ovo: { type: "EWALLET", channel_code: "OVO" },
  dana: { type: "EWALLET", channel_code: "DANA" },
  linkaja: { type: "EWALLET", channel_code: "LINKAJA" },
  jenius: { type: "EWALLET", channel_code: "JENIUSPAY" },
  alfamart: { type: "OVER_THE_COUNTER", channel_code: "ALFAMART" },
  indomaret: { type: "OVER_THE_COUNTER", channel_code: "INDOMARET" },
  credit_card: { type: "CARD" },
  kredivo: { type: "PAYLATER", channel_code: "KREDIVO" },
  akulaku: { type: "PAYLATER", channel_code: "AKULAKU" },
};

/**
 * Mapping dari Canonical Payment Method ke endpoint Direct DOKU Jokul
 */
export const CANONICAL_TO_DOKU: Record<string, { endpoint: string; type: "va" | "qris" | "cstore" | "ewallet"; bank?: string }> = {
  bca_va: { endpoint: "/bca-virtual-account/v2/payment-code", type: "va", bank: "bca" },
  mandiri_va: { endpoint: "/mandiri-virtual-account/v2/payment-code", type: "va", bank: "mandiri" },
  bni_va: { endpoint: "/bni-virtual-account/v2/payment-code", type: "va", bank: "bni" },
  bri_va: { endpoint: "/bri-virtual-account/v2/payment-code", type: "va", bank: "bri" },
  permata_va: { endpoint: "/permata-virtual-account/v2/payment-code", type: "va", bank: "permata" },
  cimb_va: { endpoint: "/cimb-virtual-account/v2/payment-code", type: "va", bank: "cimb" },
  danamon_va: { endpoint: "/danamon-virtual-account/v2/payment-code", type: "va", bank: "danamon" },
  bsi_va: { endpoint: "/bsi-virtual-account/v2/payment-code", type: "va", bank: "bsi" },
  qris: { endpoint: "/qris-payment/v2/generate-qr-code", type: "qris" },
  gopay_qris: { endpoint: "/qris-payment/v2/generate-qr-code", type: "qris" },
  shopeepay_qris: { endpoint: "/qris-payment/v2/generate-qr-code", type: "qris" },
  alfamart: { endpoint: "/alfa-online/v2/payment-code", type: "cstore" },
  indomaret: { endpoint: "/indomaret-online/v2/payment-code", type: "cstore" },
  ovo: { endpoint: "/ovo-payment/v2/charge", type: "ewallet" },
  dana: { endpoint: "/dana-payment/v2/charge", type: "ewallet" },
  shopeepay: { endpoint: "/shopeepay-payment/v2/charge", type: "ewallet" },
};

/**
 * Mapping dari Canonical Payment Method ke kode channel PrismaLink
 */
export const CANONICAL_TO_PRISMALINK: Record<string, string> = {
  bca_va: "BCA_VA",
  mandiri_va: "MANDIRI_VA",
  bni_va: "BNI_VA",
  bri_va: "BRI_VA",
  permata_va: "PERMATA_VA",
  cimb_va: "CIMB_VA",
  danamon_va: "DANAMON_VA",
  bsi_va: "BSI_VA",
  qris: "QRIS",
  gopay_qris: "QRIS",
  shopeepay_qris: "QRIS",
  gopay: "GOPAY",
  ovo: "OVO",
  dana: "DANA",
  shopeepay: "SHOPEEPAY",
  linkaja: "LINKAJA",
  alfamart: "ALFAMART",
  indomaret: "INDOMARET",
  credit_card: "CREDIT_CARD",
};

/**
 * Mapping dari Canonical Payment Method ke kode channel Faspay
 */
export const CANONICAL_TO_FASPAY: Record<string, string> = {
  mandiri_va: "400",
  bni_va: "401",
  bca_va: "402",
  bri_va: "405",
  permata_va: "408",
  cimb_va: "702",
  danamon_va: "708",
  bsi_va: "800",
  qris: "704",
  gopay_qris: "704",
  shopeepay_qris: "704",
  kredivo: "703",
  alfamart: "706",
  indomaret: "707",
  linkaja: "808",
  akulaku: "711",
  ovo: "812",
  dana: "814",
  shopeepay: "819",
  credit_card: "500",
};

/**
 * Mapping dari Canonical Payment Method ke kode channel Finpay
 */
export const CANONICAL_TO_FINPAY: Record<string, string> = {
  bca_va: "BCA",
  mandiri_va: "MANDIRI",
  bni_va: "BNI",
  bri_va: "BRI",
  permata_va: "PERMATA",
  cimb_va: "CIMB",
  danamon_va: "DANAMON",
  bsi_va: "BSI",
  qris: "QRIS",
  gopay_qris: "QRIS",
  shopeepay_qris: "QRIS",
  gopay: "GOPAY",
  ovo: "OVO",
  dana: "DANA",
  shopeepay: "SHOPEEPAY",
  linkaja: "LINKAJA",
  alfamart: "ALFAMART",
  indomaret: "INDOMARET",
  pos: "POS",
  credit_card: "CC",
};

/**
 * Mapping dari Canonical Payment Method ke konfigurasi Nicepay
 */
export const CANONICAL_TO_NICEPAY: Record<string, { payMethod: string; bankCd?: string; mitraCd?: string }> = {
  bca_va: { payMethod: "02", bankCd: "BBBB" },
  mandiri_va: { payMethod: "02", bankCd: "BMRI" },
  bni_va: { payMethod: "02", bankCd: "BNIN" },
  bri_va: { payMethod: "02", bankCd: "BRIN" },
  permata_va: { payMethod: "02", bankCd: "BBBA" },
  cimb_va: { payMethod: "02", bankCd: "BNIA" },
  danamon_va: { payMethod: "02", bankCd: "BDIN" },
  bsi_va: { payMethod: "02", bankCd: "BBSI" },
  qris: { payMethod: "08" },
  gopay_qris: { payMethod: "08" },
  shopeepay_qris: { payMethod: "08" },
  alfamart: { payMethod: "03", mitraCd: "ALFA" },
  indomaret: { payMethod: "03", mitraCd: "INDO" },
  ovo: { payMethod: "05", mitraCd: "OVO" },
  dana: { payMethod: "05", mitraCd: "DANA" },
  shopeepay: { payMethod: "05", mitraCd: "SHOPEEPAY" },
  linkaja: { payMethod: "05", mitraCd: "LINKAJA" },
  credit_card: { payMethod: "01" },
  kredivo: { payMethod: "04", mitraCd: "KREDIVO" },
  akulaku: { payMethod: "04", mitraCd: "AKULAKU" },
};

/**
 * Mapping dari Canonical Payment Method ke konfigurasi OY! Bisnis
 */
export const CANONICAL_TO_OY: Record<string, { type: "va" | "qris" | "ewallet" | "cstore"; bank_code?: string; channel?: string }> = {
  bca_va: { type: "va", bank_code: "014" },
  mandiri_va: { type: "va", bank_code: "008" },
  bni_va: { type: "va", bank_code: "009" },
  bri_va: { type: "va", bank_code: "002" },
  permata_va: { type: "va", bank_code: "013" },
  cimb_va: { type: "va", bank_code: "022" },
  danamon_va: { type: "va", bank_code: "011" },
  bsi_va: { type: "va", bank_code: "451" },
  qris: { type: "qris" },
  gopay_qris: { type: "qris" },
  shopeepay_qris: { type: "qris" },
  ovo: { type: "ewallet", channel: "ovo" },
  dana: { type: "ewallet", channel: "dana" },
  shopeepay: { type: "ewallet", channel: "shopeepay" },
  linkaja: { type: "ewallet", channel: "linkaja" },
  alfamart: { type: "cstore", channel: "alfamart" },
  indomaret: { type: "cstore", channel: "indomaret" },
};

/**
 * Mapping dari Canonical Payment Method ke payment_method_types Stripe
 */
export const CANONICAL_TO_STRIPE: Record<string, string> = {
  credit_card: "card",
  qris: "qris",
  gopay_qris: "qris",
  shopeepay_qris: "qris",
  bca_va: "customer_balance",
  mandiri_va: "customer_balance",
  bni_va: "customer_balance",
  bri_va: "customer_balance",
  permata_va: "customer_balance",
};

/**
 * Ubah method code apapun (baik canonical maupun kode raw provider) ke kode Duitku yang valid
 */
export function toDuitkuPaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_DUITKU[lower]) {
    return CANONICAL_TO_DUITKU[lower];
  }
  return code.toUpperCase().trim();
}

/**
 * Ubah method code apapun ke format iPaymu direct channel
 */
export function toIpaymuPaymentMethod(code?: string): { paymentMethod: string; paymentChannel?: string } | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_IPAYMU[lower]) {
    return CANONICAL_TO_IPAYMU[lower];
  }
  if (lower.includes("va") || lower.includes("bca") || lower.includes("bni") || lower.includes("bri") || lower.includes("mandiri")) {
    return { paymentMethod: "va", paymentChannel: lower.replace("_va", "") };
  }
  if (lower.includes("qris")) {
    return { paymentMethod: "qris", paymentChannel: "mpm" };
  }
  if (lower.includes("alfa") || lower.includes("indo")) {
    return { paymentMethod: "cstore", paymentChannel: lower };
  }
  return { paymentMethod: lower };
}

/**
 * Ubah method code apapun ke format Payment Request Xendit
 */
export function toXenditPaymentMethod(code?: string): { type: string; channel_code?: string } | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_XENDIT[lower]) {
    return CANONICAL_TO_XENDIT[lower];
  }
  if (lower.includes("va")) {
    return { type: "VIRTUAL_ACCOUNT", channel_code: lower.replace("_va", "").toUpperCase() };
  }
  if (lower.includes("qris")) {
    return { type: "QR_CODE", channel_code: "QRIS" };
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format Direct API DOKU Jokul
 */
export function toDokuPaymentMethod(code?: string): { endpoint: string; type: "va" | "qris" | "cstore" | "ewallet"; bank?: string } | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_DOKU[lower]) {
    return CANONICAL_TO_DOKU[lower];
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format channel PrismaLink
 */
export function toPrismalinkPaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_PRISMALINK[lower]) {
    return CANONICAL_TO_PRISMALINK[lower];
  }
  return code.toUpperCase().trim();
}

/**
 * Ubah method code apapun ke format payment channel Faspay
 */
export function toFaspayPaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_FASPAY[lower]) {
    return CANONICAL_TO_FASPAY[lower];
  }
  return code.trim();
}

/**
 * Ubah method code apapun ke format channel Finpay
 */
export function toFinpayPaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_FINPAY[lower]) {
    return CANONICAL_TO_FINPAY[lower];
  }
  return code.toUpperCase().trim();
}

/**
 * Ubah method code apapun ke format Nicepay
 */
export function toNicepayPaymentMethod(code?: string): { payMethod: string; bankCd?: string; mitraCd?: string } | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_NICEPAY[lower]) {
    return CANONICAL_TO_NICEPAY[lower];
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format OY! Bisnis
 */
export function toOyPaymentMethod(code?: string): { type: "va" | "qris" | "ewallet" | "cstore"; bank_code?: string; channel?: string } | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_OY[lower]) {
    return CANONICAL_TO_OY[lower];
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format Stripe
 */
export function toStripePaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_STRIPE[lower]) {
    return CANONICAL_TO_STRIPE[lower];
  }
  return lower;
}

/**
 * Ubah method code apapun ke format canonical standar Buayar
 */
export function toCanonicalPaymentMethod(provider: string, code?: string): string {
  if (!code) return "";
  const upper = code.toUpperCase().trim();
  const lower = code.toLowerCase().trim();

  if (provider.toLowerCase() === "duitku" && DUITKU_TO_CANONICAL[upper]) {
    return DUITKU_TO_CANONICAL[upper];
  }

  if (
    CANONICAL_TO_MIDTRANS[lower] ||
    CANONICAL_TO_DUITKU[lower] ||
    CANONICAL_TO_IPAYMU[lower] ||
    CANONICAL_TO_XENDIT[lower] ||
    CANONICAL_TO_DOKU[lower] ||
    CANONICAL_TO_PRISMALINK[lower] ||
    CANONICAL_TO_FASPAY[lower] ||
    CANONICAL_TO_FINPAY[lower] ||
    CANONICAL_TO_NICEPAY[lower] ||
    CANONICAL_TO_OY[lower] ||
    CANONICAL_TO_STRIPE[lower]
  ) {
    return lower;
  }

  return lower;
}
