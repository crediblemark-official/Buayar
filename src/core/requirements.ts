/**
 * Field `customer` yang WAJIB diisi per provider.
 *
 * Kenapa modul ini ada: `CreateInvoiceParams.customer` mendeklarasikan `name`/`email`/`phone`
 * sebagai opsional supaya tetap portabel, tapi beberapa PG benar-benar
 * MENOLAK request tanpa field itu. Akibatnya kode aplikasi yang sama berhasil
 * di 6 provider lalu ditolak diam-diam di provider ke-7 dengan pesan dari
 * gateway ("phone wajib diisi.") yang tidak menjelaskan harusnya apa.
 *
 * Aturan di bawah diverifikasi langsung terhadap sandbox (lihat
 * `tests/provider-required-fields.test.ts`). Menambah provider baru cukup
 * menambah satu entri di sini — tidak perlu menyentuh provider mana pun.
 */

export interface CustomerFieldRule {
  /** Nama field pada `CreateInvoiceParams.customer`. */
  field: "name" | "email" | "phone";
  /** Pesan yang menyebut provider + field + cara memperbaikinya. */
  message: string;
  /** Validasi tambahan. Return string untuk menolak, undefined bila lolos. */
  validate?: (value: string) => string | undefined;
}

const digitsOnly = (value: string) => /^\d+$/.test(value.replace(/\s/g, ""));

/**
 * iPaymu (diverifikasi langsung terhadap sandbox iPaymu):
 *   - `name`  → "name wajib diisi."
 *   - `email` → "email wajib diisi."
 *   - `phone` → "phone wajib diisi." / "phone harus berupa angka."
 *              / "Panjang phone harus antara 5 dan 15 digit."
 */
const IPAYMU_RULES: Record<string, CustomerFieldRule> = {
  name: {
    field: "name",
    message:
      "customer.name is required by iPaymu. Fill it before calling createInvoice — " +
      "iPaymu's sandbox rejects the request with \"name wajib diisi.\" otherwise. " +
      "This is an iPaymu-specific requirement; the other 20 providers accept an empty name.",
  },
  email: {
    field: "email",
    message:
      "customer.email is required by iPaymu. Fill it before calling createInvoice — " +
      "iPaymu's sandbox rejects the request with \"email wajib diisi.\" otherwise.",
  },
  phone: {
    field: "phone",
    message:
      "customer.phone is required by iPaymu. Use 5-15 DIGITS without a '+' or dashes " +
      "(e.g. \"081234567890\") — iPaymu rejects \"+62812…\" with \"Panjang phone harus " +
      "diantara 5 dan 15 digit.\" and dashes with \"phone harus berupa angka.\"",
    validate: (value) => {
      if (!digitsOnly(value)) return "must contain digits only";
      const len = value.replace(/\s/g, "").length;
      if (len < 5 || len > 15) return "must be 5-15 digits";
      return undefined;
    },
  },
};

const RULES: Record<string, Record<string, CustomerFieldRule>> = {
  ipaymu: IPAYMU_RULES,
};

/** Provider yang punya aturan field customer khusus. */
export function providersWithRequiredCustomerFields(): string[] {
  return Object.keys(RULES);
}

/** Daftar field yang wajib untuk provider tsb (kosong = tidak ada aturan). */
export function requiredCustomerFields(providerName: string): string[] {
  return Object.keys(RULES[(providerName || "").toLowerCase()] || {});
}

/**
 * Kembalikan pesan error bila ada field wajib yang kosong/tidak valid,
 * atau `undefined` bila request aman dikirim.
 */
export function validateRequiredCustomerFields(
  providerName: string,
  customer: { name?: string; email?: string; phone?: string } | undefined
): string | undefined {
  const rules = RULES[(providerName || "").toLowerCase()];
  if (!rules) return undefined;

  const problems: string[] = [];
  for (const rule of Object.values(rules)) {
    const value = customer?.[rule.field];
    if (typeof value !== "string" || value.trim().length === 0) {
      problems.push(rule.message);
      continue;
    }
    const invalid = rule.validate?.(value.trim());
    if (invalid) {
      problems.push(rule.message.replace(/\.$/, "") + ` — got "${value}", which ${invalid}.`);
    }
  }

  return problems.length > 0 ? problems.join(" ") : undefined;
}
