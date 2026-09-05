import { PaymentMethod, PaymentMethodDescriptor } from "../types";

export type PaymentMethodDescriptorType = PaymentMethodDescriptor["type"];

/**
 * Sandingkan kategori resmi Buayar menjadi tipe singkat UI.
 * Kategori bisa berbeda antar provider, oleh karena itu mapping dilakukan
 * di sini (sentral) agar konsumen tidak perlu tahu detail kategori per PG.
 */
export function mapCategoryToDescriptorType(category: string, paymentMethod?: string): PaymentMethodDescriptorType {
  const cat = (category || "").toLowerCase();
  const method = (paymentMethod || "").toLowerCase();

  const isVa = cat === "virtual account" || method.includes("_va");
  const isQr = cat === "qris" || method === "qris";
  const isEwallet = cat === "e-wallet" || cat === "ewallet" || method === "ewallet";
  const isRetail = cat === "retail / gerai" || cat === "cstore" || method === "cstore";
  const isCard = cat === "kartu kredit" || cat === "cc";
  const isPaylater = cat === "paylater / cicilan" || cat === "paylater" || method === "paylater";

  if (isQr) return "qris";
  if (isVa) return "va";
  if (isEwallet) return "ewallet";
  if (isRetail) return "retail";
  if (isCard) return "card";
  if (isPaylater) return "paylater";
  return "other";
}

function iconForType(type: PaymentMethodDescriptorType): string {
  switch (type) {
    case "qris":
    case "ewallet":
      return "📱";
    case "va":
      return "🏦";
    case "retail":
      return "🏪";
    case "card":
    case "paylater":
    default:
      return "💳";
  }
}

function badgeForType(type: PaymentMethodDescriptorType): string {
  switch (type) {
    case "qris":
      return "Instan Bebas Biaya";
    case "va":
      return "Otomatis 24 Jam";
    case "ewallet":
      return "E-Wallet Instan";
    case "retail":
      return "Gerai Retail";
    case "card":
      return "Visa / Mastercard";
    case "paylater":
      return "Cicilan PayLater";
    default:
      return "Tersedia Otomatis";
  }
}

/**
 * Bangun satu deskriptor kanonikal siap-render dari objek PaymentMethod.
 *
 * @param pm  Hasil mentah provider (lihat `PaymentMethod`).
 * @param _providerName  Nama provider aktif (disimpan untuk keperluan lattice
 *   masa depan; saat ini mapping kategori sudah generik).
 */
export function buildPaymentMethodDescriptor(pm: PaymentMethod, _providerName?: string): PaymentMethodDescriptor {
  const category = pm.category || "";
  const code = (pm.code || pm.paymentMethod || "").toUpperCase();
  const type = mapCategoryToDescriptorType(category, pm.paymentMethod);
  const icon = iconForType(type);
  let badge = badgeForType(type);

  // "-" dipakai beberapa provider sebagai penanda "tidak ada fee" — jangan
  // tampilkan sebagai `• Fee -`.
  const feeDisplay = pm.totalFee && pm.totalFee !== "-" ? pm.totalFee : "";
  return {
    id: code,
    name: pm.paymentName,
    type,
    icon,
    badge: feeDisplay ? `${badge} • Fee ${feeDisplay}` : badge,
    image: pm.paymentImage || undefined,
    category,
    coming_soon: false,
    totalFee: feeDisplay || undefined,
  };
}

/**
 * Bangun daftar deskriptor kanonikal dari hasil `getPaymentMethods()`.
 */
export function buildPaymentMethodDescriptors(
  methods: PaymentMethod[],
  providerName?: string
): PaymentMethodDescriptor[] {
  return methods.map((pm) => buildPaymentMethodDescriptor(pm, providerName));
}