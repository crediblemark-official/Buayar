/**
 * `buayar audit` — melaporkan status verifikasi tiap provider secara jujur.
 *
 * Command ini sengaja tidak memakai warna/animasi supaya bisa dipakai di CI
 * dan di-output redirect ke file. Keluarannya juga tersedia sebagai JSON
 * (`--json`) supaya bisa di-consume skrip.
 *
 * Yang ditanyakan perintah ini: "provider mana yang sudah pernah saya
 * tampak ke server sungguhan, dan mana yang belum?" — jawaban yang salah di sini
 * berujung ke integrasi produksi yang gagal.
 */
import { providerRegistry } from "../core/providerRegistry";

export function printAuditHelp(): void {
  console.log(`
buayar audit — status verifikasi tiap payment provider

Pemakaian:
  buayar audit              Tabel status di stdout
  buayar audit --json       Keluaran JSON (untuk CI / skrip)
  buayar audit --only-unverified   Hanya yang belum terverifikasi live

Apa arti "verified"?
  true   Request nyata pernah sampai ke kredensial sandbox/production
         sungguhan dan balasannya diamati. Endpoint & shape payload terbukti.
  false  Implementasi lengkap dan terkunci test contract/simulator (webhook
         fail-closed, signature generator, pre-flight), TAPI belum pernah
         menyentuh API asli karena kredensial sandbox-nya belum tersedia.

"false" BUKAN berarti kode rusak atau belum jadi. Provider itu tetap berfungsi;
hanya belum dibuktikan end-to-end.

Contoh dipakai di CI (gagal bila ada provider yang tak terverifikasi dipFU):
  buayar audit --json | jq -e 'all(.providers[]; .verified)' >/dev/null
`);
}

export interface AuditRow {
  name: string;
  verified: boolean;
  note?: string;
  methods: number;
  serverForwarded: number;
  advisoryOnly: boolean;
}

export function collectAuditRows(): AuditRow[] {
  return providerRegistry.names().sort().map((name) => {
    const cap = providerRegistry.get(name)!;
    return {
      name,
      verified: cap.verified === true,
      note: cap.verificationNote,
      methods: cap.methods.length,
      serverForwarded: (cap.serverForwardedMethods || []).length,
      // true = tidak ada method yang bisa di-enforce server-side; PG yang menentukan
      advisoryOnly: (cap.serverForwardedMethods || []).length === 0,
    };
  });
}

/**
 * Padding based on DISPLAY WIDTH, not char count.
 *
 * `String.padEnd` menghitung unit kode UTF-16, sedangkan terminal menghitung
 * kolom. Emoji seperti ✅ (U+2705) dan ⏳ (U+23F3) memakai 2 kolom tapi hanya
 * unit kode — memakai padEnd langsung bikin seluruh tabel bergeser ke kanan.
 */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    // Lebar 2 untuk East Asian Wide/Fullwidth + emoji umum.
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      cp === 0x2705 || cp === 0x274c || cp === 0x26a0;
    w += wide ? 2 : 1;
  }
  return w;
}

function pad(s: string, n: number): string {
  const str = String(s ?? "");
  const diff = n - displayWidth(str);
  return diff > 0 ? str + " ".repeat(diff) : str;
}

export function runAudit(argv: string[]): number {
  const asJson = argv.includes("--json");
  const onlyUnverified = argv.includes("--only-unverified");

  const all = collectAuditRows();
  const rows = onlyUnverified ? all.filter((r) => !r.verified) : all;

  if (asJson) {
    console.log(JSON.stringify(
      {
        total: all.length,
        verified: all.filter((r) => r.verified).length,
        unverified: all.filter((r) => !r.verified).length,
        providers: rows,
      },
      null,
      2
    ));
    return 0;
  }

  const verified = all.filter((r) => r.verified);
  const unverified = all.filter((r) => !r.verified);

  console.log("\n════════ buayar audit · status verifikasi provider ════════\n");
  console.log(
    pad("provider", 13) + pad("verified", 10) + pad("methods", 9) +
    pad("fwd", 5) + "catatan"
  );
  console.log("─".repeat(96));

  for (const r of rows) {
    console.log(
      pad(r.name, 13) +
      pad(r.verified ? "✅ live" : "⏳ contract", 10) +
      pad(String(r.methods), 9) +
      pad(r.advisoryOnly ? "-" : String(r.serverForwarded), 5) +
      (r.note || (r.verified ? "" : "-"))
    );
  }

  console.log("\n" + "─".repeat(96));
  console.log(
    `Total ${all.length} provider · ${verified.length} terverifikasi live · ` +
    `${unverified.length} contract-tested saja`
  );

  if (unverified.length > 0) {
    console.log("\nProvider di kelompok kedua FUNGSI NORMAL — implementasinya lengkap dan");
    console.log("terkunci test. Yang belum ada hanya bukti end-to-end ke server asli,");
    console.log("karena kredensial sandbox-nya belum tersedia. Jangan otomatis");
    console.log("menganggapnya 'belum jadi'.");
  }

  const advisory = all.filter((r) => r.advisoryOnly);
  if (advisory.length > 0) {
    console.log(
      `\n⚠ ${advisory.length} provider tidak punya field payment method server-side ` +
      `(fwd = "-" di atas):\n  ${advisory.map((r) => r.name).join(", ")}`
    );
    console.log("  Untuk provider ini `paymentMethod` tidak dikirim ke PG — PG yang");
    console.log("  menentukan dari token/checkout sisi klien. Response createInvoice");
    console.log("  menandainya `paymentMethodApplied: \"advisory\"`.");
  }

  console.log();
  return 0;
}
