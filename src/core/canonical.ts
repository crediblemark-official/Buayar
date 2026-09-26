import {
  type CanonicalPaymentMethod,
  type PaymentMethodInput,
  resolvePaymentMethodCode,
} from "../types";

export type { CanonicalPaymentMethod, PaymentMethodInput };
export { resolvePaymentMethodCode };

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
  bag_va: { paymentMethod: "va", paymentChannel: "bag" },
  btn_va: { paymentMethod: "va", paymentChannel: "btn" },
  muamalat_va: { paymentMethod: "va", paymentChannel: "bmi" },
  bmi_va: { paymentMethod: "va", paymentChannel: "bmi" },
  // QRIS: `GET /api/v2/payment-channels` mengembalikan group `qris` dengan
  // `channel.Code = "mpm"` (diverifikasi langsung terhadap sandbox iPaymu) — jadi
  // tabel API docs benar dan konstanta SDK Go (`qris`) tidak dipakai.
  // Masih dapat dioverride lewat `providerParams.paymentChannel`.
  qris: { paymentMethod: "qris", paymentChannel: "mpm" },
  gopay_qris: { paymentMethod: "qris", paymentChannel: "mpm" },
  shopeepay_qris: { paymentMethod: "qris", paymentChannel: "mpm" },
  // E-Wallet: daftar channel live (sandbox) hanya mengaktifkan `dana` & `shopeepay`
  // (group `ewallet`), sedangkan `ovo`/`gopay`/`linkaja` berada di group `ewallet-asia`
  // yang belum aktif. Ketiganya tetap dipetakan agar merchant yang mengaktifkannya
  // bisa langsung memakainya; ketersediaan riil dibaca dari `getPaymentMethods()`.
  dana: { paymentMethod: "ewallet", paymentChannel: "dana" },
  shopeepay: { paymentMethod: "ewallet", paymentChannel: "shopeepay" },
  ovo: { paymentMethod: "ewallet", paymentChannel: "ovo" },
  gopay: { paymentMethod: "ewallet", paymentChannel: "gopay" },
  linkaja: { paymentMethod: "ewallet", paymentChannel: "linkaja" },
  alfamart: { paymentMethod: "cstore", paymentChannel: "alfamart" },
  indomaret: { paymentMethod: "cstore", paymentChannel: "indomaret" },
  credit_card: { paymentMethod: "cc", paymentChannel: "cc" },
  // Debit Online (B-Secure) — diverifikasi live: gateway memakai `paymentMethod: "cc"`
  // dengan `paymentChannel: "debitonline"`. Mengirim `paymentMethod: "debitonline"`
  // ditolak dengan "Invalid payment method" (nilai itu bukan paymentMethod resmi;
  // ia hanya nama group pada `GET /payment-channels`).
  debitonline: { paymentMethod: "cc", paymentChannel: "debitonline" },
  // Paylater: hanya `akulaku` (docs + SDK resmi). `kredivo` TIDAK tersedia untuk iPaymu.
  akulaku: { paymentMethod: "paylater", paymentChannel: "akulaku" },
  // COD: `GET /api/v2/payment-channels` mengembalikan group `cod` dengan
  // `channel.Code = "cod"` (diverifikasi langsung terhadap sandbox), sehingga nilai
  // itulah yang dikirim pada `paymentChannel`. Tabel dokumentasi & SDK Go menyebut
  // `rpx` (kurir RPX); nilai itu tetap diterima sebagai alias/override eksplisit.
  cod: { paymentMethod: "cod", paymentChannel: "cod" },
  rpx: { paymentMethod: "cod", paymentChannel: "rpx" },
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
export const CANONICAL_TO_DOKU: Record<
  string,
  {
    endpoint: string;
    type: "va" | "qris" | "cstore" | "ewallet";
    bank?: string;
    snapOnly?: boolean;
    /** D-16: tidak ada endpoint REST non-SNAP — terbitkan VA via DOKU MCP Server. */
    mcpOnly?: boolean;
  }
> = {
  bca_va: { endpoint: "/bca-virtual-account/v2/payment-code", type: "va", bank: "bca" },
  mandiri_va: { endpoint: "/mandiri-virtual-account/v2/payment-code", type: "va", bank: "mandiri" },
  bni_va: { endpoint: "/bni-virtual-account/v2/payment-code", type: "va", bank: "bni" },
  bri_va: { endpoint: "/bri-virtual-account/v2/payment-code", type: "va", bank: "bri" },
  permata_va: { endpoint: "/permata-virtual-account/v2/payment-code", type: "va", bank: "permata" },
  cimb_va: { endpoint: "/cimb-virtual-account/v2/payment-code", type: "va", bank: "cimb" },
  danamon_va: { endpoint: "/danamon-virtual-account/v2/payment-code", type: "va", bank: "danamon" },
  // BSI: nama kanal resmi DOKU adalah `bsm-virtual-account` (bukan `bsi-...`).
  // Diverifikasi live — `bsi-virtual-account` → "No static resource".
  bsi_va: { endpoint: "/bsm-virtual-account/v2/payment-code", type: "va", bank: "bsi" },
  // DOKU VA & Maybank VA: endpoint non-SNAP diverifikasi live 2026-09-26 (VA benar
  // terbit).
  doku_va: { endpoint: "/doku-virtual-account/v2/payment-code", type: "va", bank: "doku" },
  maybank_va: { endpoint: "/maybank-virtual-account/v2/payment-code", type: "va", bank: "maybank" },
  // D-16: BTN/BJB/BPD Bali/Sinarmas/OCBC/BNC/BSS **tidak punya endpoint REST non-SNAP**
  // (`/{bank}-virtual-account/v2/payment-code` → 404 untuk semua varian penamaan,
  // diverifikasi live 2026-09-26). Jalur non-SNAP-nya adalah layanan VA terpadu DOKU
  // (BI-SNAP VA dengan BIN aggregator merchant) yang diekspos via DOKU MCP Server
  // `create_virtual_account_payment` — ditandai `mcpOnly` (lihat `DOKU_MCP_ONLY_VA_CHANNELS`).
  btn_va: { endpoint: "", type: "va", bank: "btn", mcpOnly: true },
  bjb_va: { endpoint: "", type: "va", bank: "bjb", mcpOnly: true },
  bpd_bali_va: { endpoint: "", type: "va", bank: "bpd bali", mcpOnly: true },
  sinarmas_va: { endpoint: "", type: "va", bank: "sinarmas", mcpOnly: true },
  ocbc_va: { endpoint: "", type: "va", bank: "ocbc", mcpOnly: true },
  bnc_va: { endpoint: "", type: "va", bank: "bnc", mcpOnly: true },
  bss_va: { endpoint: "", type: "va", bank: "bss", mcpOnly: true },
  // QRIS TIDAK ADA di jalur Jokul Direct non-SNAP (daftar kanal resmi: Virtual Account,
  // O2O, Credit Card, E-Money, Direct Debit, P2P). Endpoint QRIS DOKU hanya tersedia via
  // SNAP (`/qris-payment/v2/generate-qr-code`), jadi ditandai `snapOnly`.
  qris: { endpoint: "", type: "qris", snapOnly: true },
  gopay_qris: { endpoint: "", type: "qris", snapOnly: true },
  shopeepay_qris: { endpoint: "", type: "qris", snapOnly: true },
  // Endpoint non-SNAP resmi DOKU untuk convenience store / O2O.
  alfamart: { endpoint: "/alfa-online-to-offline/v2/payment-code", type: "cstore" },
  indomaret: { endpoint: "/indomaret-online-to-offline/v2/payment-code", type: "cstore" },
  // OVO Push Payment non-SNAP (payload & checksum khusus, lihat provider).
  ovo: { endpoint: "/ovo-emoney/v1/payment", type: "ewallet" },
  // DANA & ShopeePay TIDAK memiliki endpoint non-SNAP di dokumentasi DOKU —
  // keduanya hanya tersedia lewat jalur SNAP (`config.extra.snap`). Entri ini
  // ditandai `snapOnly` agar tetap muncul di capability list tetapi ditolak
  // dengan pesan jelas bila SNAP belum diaktifkan.
  dana: { endpoint: "", type: "ewallet", snapOnly: true },
  shopeepay: { endpoint: "", type: "ewallet", snapOnly: true },
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
  // Mitra code Alfamart Group resmi di NICEPAY adalah "ALMA" (bukan "ALFA").
  alfamart: { payMethod: "03", mitraCd: "ALMA" },
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
  QRIS_SUMOPOD: "qris",
  qris_sumopod: "qris",
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
export function toDuitkuPaymentMethod(code?: PaymentMethodInput | string): string | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_DUITKU[lower]) {
    return CANONICAL_TO_DUITKU[lower];
  }
  return resolved.toUpperCase().trim();
}

/**
 * Ubah method code apapun ke format iPaymu direct channel
 */
export function toIpaymuPaymentMethod(code?: PaymentMethodInput | string): { paymentMethod: string; paymentChannel?: string } | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_IPAYMU[lower]) {
    return CANONICAL_TO_IPAYMU[lower];
  }
  if (lower.includes("va") || lower.includes("bca") || lower.includes("bni") || lower.includes("bri") || lower.includes("mandiri")) {
    return { paymentMethod: "va", paymentChannel: lower.replace("_va", "") };
  }
  if (lower.includes("qris")) {
    return { paymentMethod: "qris", paymentChannel: "mpm" };
  }
  if (lower.includes("debit")) {
    return { paymentMethod: "cc", paymentChannel: "debitonline" };
  }
  if (lower.includes("alfa") || lower.includes("indo")) {
    return { paymentMethod: "cstore", paymentChannel: lower };
  }
  if (lower.includes("dana") || lower.includes("shopee") || lower.includes("ovo") || lower.includes("gopay") || lower.includes("linkaja")) {
    return { paymentMethod: "ewallet", paymentChannel: lower };
  }
  // Kredivo bukan kanal paylater iPaymu (hanya Akulaku) → biarkan jatuh ke
  // mode Semi-Integrasi (hosted page) alih-alih mengirim kanal yang tidak ada.
  return { paymentMethod: lower };
}

/**
 * Ubah method code apapun ke format Payment Request Xendit
 */
export function toXenditPaymentMethod(code?: PaymentMethodInput | string): { type: string; channel_code?: string } | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
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
export function toDokuPaymentMethod(
  code?: PaymentMethodInput | string
): { endpoint: string; type: "va" | "qris" | "cstore" | "ewallet"; bank?: string; snapOnly?: boolean; mcpOnly?: boolean } | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_DOKU[lower]) {
    return CANONICAL_TO_DOKU[lower];
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format channel PrismaLink
 */
export function toPrismalinkPaymentMethod(code?: PaymentMethodInput | string): string | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_PRISMALINK[lower]) {
    return CANONICAL_TO_PRISMALINK[lower];
  }
  return resolved.toUpperCase().trim();
}

/**
 * Ubah method code apapun ke format payment channel Faspay
 */
export function toFaspayPaymentMethod(code?: PaymentMethodInput | string): string | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_FASPAY[lower]) {
    return CANONICAL_TO_FASPAY[lower];
  }
  return resolved.trim();
}

/**
 * Ubah method code apapun ke format channel Finpay
 */
export function toFinpayPaymentMethod(code?: PaymentMethodInput | string): string | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_FINPAY[lower]) {
    return CANONICAL_TO_FINPAY[lower];
  }
  return resolved.toUpperCase().trim();
}

/**
 * Ubah method code apapun ke format Nicepay
 */
export function toNicepayPaymentMethod(code?: PaymentMethodInput | string): { payMethod: string; bankCd?: string; mitraCd?: string } | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_NICEPAY[lower]) {
    return CANONICAL_TO_NICEPAY[lower];
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format OY! Bisnis
 */
export function toOyPaymentMethod(code?: PaymentMethodInput | string): { type: "va" | "qris" | "ewallet" | "cstore"; bank_code?: string; channel?: string } | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_OY[lower]) {
    return CANONICAL_TO_OY[lower];
  }
  return undefined;
}

/**
 * Ubah method code apapun ke format Stripe
 */
export function toStripePaymentMethod(code?: PaymentMethodInput | string): string | undefined {
  const resolved = resolvePaymentMethodCode(code);
  if (!resolved) return undefined;
  const lower = resolved.toLowerCase().trim();
  if (CANONICAL_TO_STRIPE[lower]) {
    return CANONICAL_TO_STRIPE[lower];
  }
  return lower;
}

/**
 * Mapping dari Canonical Payment Method ke kode SumoPod
 */
export const CANONICAL_TO_SUMOPOD: Record<string, string> = {
  qris: "QRIS",
  gopay_qris: "QRIS",
  shopeepay_qris: "QRIS",
  nobu_qris: "QRIS",
  qris_sumopod: "QRIS",
};

/**
 * Mapping dari kode SumoPod ke Canonical Payment Method
 */
export const SUMOPOD_TO_CANONICAL: Record<string, string> = {
  QRIS: "qris",
  qris: "qris",
};

/**
 * Ubah method code apapun ke format SumoPod
 */
export function toSumopodPaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_SUMOPOD[lower]) {
    return CANONICAL_TO_SUMOPOD[lower];
  }
  return code;
}

export const CANONICAL_TO_XENITH: Record<string, string> = {
  bca_va: "BCA.VA",
  mandiri_va: "MDR.VA",
  bni_va: "BNI.VA",
  bri_va: "BRI.VA",
  permata_va: "PTB.VA",
  cimb_va: "CIMBN.VA",
  danamon_va: "BDMN.VA",
  maybank_va: "BMI.VA",
  bag_va: "BAG.VA",
  bss_va: "BSS.VA",
  qris: "QRIS",
  gopay_qris: "QRIS",
  shopeepay_qris: "QRIS",
  nobu_qris: "QRIS",
  dana: "DANA",
  ovo: "OVO",
};

export const XENITH_TO_CANONICAL: Record<string, string> = {
  "BCA.VA": "bca_va",
  "MDR.VA": "mandiri_va",
  "BNI.VA": "bni_va",
  "BRI.VA": "bri_va",
  "PTB.VA": "permata_va",
  "CIMBN.VA": "cimb_va",
  "BDMN.VA": "danamon_va",
  "BMI.VA": "maybank_va",
  "BAG.VA": "bag_va",
  "BSS.VA": "bss_va",
  "QRIS": "qris",
  "DANA": "dana",
  "OVO": "ovo",
};

export function toXenithPaymentMethod(code?: string): string | undefined {
  if (!code) return undefined;
  const lower = code.toLowerCase().trim();
  if (CANONICAL_TO_XENITH[lower]) {
    return CANONICAL_TO_XENITH[lower];
  }
  return code;
}

export const CANONICAL_TO_XENITH_PAYOUT: Record<string, string> = {
  bca: "CENAIDJA",
  mandiri: "BMRIIDJA",
  bni: "BNINIDJA",
  bri: "BRINIDJA",
  permata: "BBBAIDJA",
  cimb: "BNIAIDJA",
  danamon: "BDINIDJA",
  bsi: "BSMDIDJA",
  seabank: "SSPIIDJA",
  btn: "BBTNIDJA",
  panin: "PINBIDJA",
  maybank: "MBBEIDJA",
  btpn: "SUNIIDJA",
  neo: "YUDBIDJ1",
};

export function toXenithPayoutChannel(bankCode: string): string {
  const lower = bankCode.toLowerCase().trim();
  return CANONICAL_TO_XENITH_PAYOUT[lower] || bankCode.toUpperCase();
}

export const CANONICAL_TO_PAYU: Record<string, string> = {
  credit_card: "c",
  blik: "blik",
  apple_pay: "ap",
  google_pay: "gp",
  bank_transfer: "m",
  installment: "ai",
};

export const PAYU_TO_CANONICAL: Record<string, string> = {
  c: "credit_card",
  blik: "blik",
  ap: "apple_pay",
  gp: "google_pay",
  m: "bank_transfer",
  ai: "installment",
};

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

  if (provider.toLowerCase() === "sumopod" && SUMOPOD_TO_CANONICAL[upper]) {
    return SUMOPOD_TO_CANONICAL[upper];
  }

  if (provider.toLowerCase() === "xenith" && XENITH_TO_CANONICAL[upper]) {
    return XENITH_TO_CANONICAL[upper];
  }

  if (provider.toLowerCase() === "payu" && PAYU_TO_CANONICAL[lower]) {
    return PAYU_TO_CANONICAL[lower];
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
    CANONICAL_TO_STRIPE[lower] ||
    CANONICAL_TO_SUMOPOD[lower] ||
    CANONICAL_TO_PAYU[lower]
  ) {
    return lower;
  }

  return lower;
}


