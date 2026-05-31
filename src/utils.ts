export function getPaymentMethodCategory(code: string, name: string = ""): "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya" {
  const c = code.toUpperCase();
  const n = name.toUpperCase();
  if (c.includes("QR") || n.includes("QRIS")) return "QRIS";
  if (c.includes("VA") || n.includes("VA") || n.includes("VIRTUAL ACCOUNT") || ["I1", "BT", "A1", "M2", "V1", "B1", "AG", "NC", "BR", "S1", "BS", "MY"].some(p => c.startsWith(p.slice(0, 2)))) return "Virtual Account";
  if (["OV", "GO", "SH", "DA", "LA", "OL", "SL", "GP", "OP", "DN", "JA", "JN", "JP"].some(p => c.startsWith(p.slice(0, 2))) || n.includes("OVO") || n.includes("DANA") || n.includes("GOPAY") || n.includes("LINKAJA") || n.includes("SHOPEEPAY") || n.includes("JENIUS")) return "E-Wallet";
  if (c.startsWith("FT") || c.startsWith("AL") || n.includes("INDOMARET") || n.includes("ALFAMART") || n.includes("RETAIL")) return "Retail / Gerai";
  if (c.startsWith("VC") || n.includes("CREDIT CARD") || n.includes("KARTU KREDIT")) return "Kartu Kredit";
  if (n.includes("PAYLATER") || n.includes("INDODANA") || n.includes("AKULAKU") || n.includes("KREDIVO")) return "Paylater / Cicilan";
  return "Lainnya";
}
