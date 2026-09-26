/**
 * Helper bersama untuk semua skrip `scripts/probe-*`.
 *
 * Tujuan: setiap probe dapat memancarkan **ringkasan JSON terstruktur** yang dapat
 * diagregasi oleh `scripts/probe.ts` (CLI terpadu) tanpa bergantung pada parsing
 * output manusia.
 */

export interface ProbeChannelResult {
  method: string;
  group?: string;
  ok: boolean;
  /** Kegagalan yang memang diharapkan (mis. kanal SNAP-only tanpa mode SNAP). */
  expected?: boolean;
  statusCode?: string | number;
  error?: string;
  hint?: string;
  /** Ringkasan hasil sukses (mis. `VA=123 (bca)`). */
  detail?: string;
}

export interface ProbeSummary {
  provider: string;
  /** `live` | `static` | nama versi API, bila relevan. */
  source?: string;
  tested: number;
  passed: number;
  expected: number;
  failed: number;
  /** true bila probe dilewati (mis. kredensial tidak ada). */
  skipped?: boolean;
  reason?: string;
  results: ProbeChannelResult[];
  sideEffects?: number;
  notes?: string[];
}

/** Penanda baris JSON di stdout agar mudah diekstrak dari output manusia. */
export const PROBE_JSON_PREFIX = "__PROBE_JSON__";

export function isProbeJsonMode(): boolean {
  const v = process.env.PROBE_JSON;
  return v === "1" || v === "true";
}

/** Cetak ringkasan JSON sekali (hanya bila `PROBE_JSON=1`). */
export function emitProbeJson(summary: ProbeSummary): void {
  if (!isProbeJsonMode()) return;
  console.log(PROBE_JSON_PREFIX + JSON.stringify(summary));
}

/** Hitung agregat dari daftar hasil. */
export function summarize(
  provider: string,
  results: ProbeChannelResult[],
  extra: Partial<ProbeSummary> = {}
): ProbeSummary {
  const passed = results.filter((r) => r.ok).length;
  const expected = results.filter((r) => !r.ok && r.expected).length;
  return {
    provider,
    tested: results.length,
    passed,
    expected,
    failed: results.length - passed - expected,
    results: results.map((r) => ({
      method: r.method,
      ...(r.group ? { group: r.group } : {}),
      ok: r.ok,
      ...(r.expected ? { expected: true } : {}),
      ...(r.statusCode !== undefined ? { statusCode: r.statusCode } : {}),
      ...(r.error ? { error: r.error } : {}),
      ...(r.hint ? { hint: r.hint } : {}),
      ...(r.detail ? { detail: r.detail } : {}),
    })),
    ...extra,
  };
}

/** Opsi untuk pemeriksaan target probe. */
export interface ProbeSafetyOptions {
  /** Nama provider, untuk pesan error. */
  provider: string;
  /** Mode sandbox yang akan dipakai probe ini. */
  sandbox: boolean;
  /** Kredensial yang dipakai, bila provider bisa membedakannya lewat prefix. */
  apiKey?: string;
  /**
   * Prefix yang menandai kredensial produksi. Provider yang tidak punya
   * prefix baku (iPaymu, DOKU) andalkan flag `sandbox` saja.
   */
  liveKeyPrefixes?: readonly string[];
}

/**
 * Penjaga: probe TIDAK BOLEH menembak akun produksi tanpa opt-in eksplisit.
 *
 * Probe adalah skrip yang mengubah state: Midtrans dan iPaymu membuat puluhan
 * transaksi lalu membatalkannya, dan niat probe itu adalah membersihkan
 * dashboard sandbox. Tapi `sandbox` hanya sebuah default `true` — begitu ada
 * yang menyetel `MIDTRANS_SANDBOX=false`, atau memakai server key produksi
 * sementara env-nya lupa diubah, probe berjalan terhadap akun merchant yang
 * sungguhan:
 *
 *   • puluhan transaksi nyata muncul di dashboard produksi,
 *   • kanal e-wallet dan paylater bisa memicu notifikasi ke nomor pelanggan,
 *   • lalu semuanya dibatalkan, jadi laporan bulanan merchant ikut kotor.
 *
 * Kerugiannya nyata dan tidak bisa ditarik kembali. Karena itu default-nya
 * fail-closed: probe berhenti sebelum request pertama, kecuali ada opt-in yang
 * disengaja.
 *
 * Dua lapis pemeriksaan, karena masing-masing menangkap kesalahan yang berbeda:
 *
 *   1. Flag `sandbox` bernilai false → memang diarahkan ke produksi.
 *   2. Prefix kredensial produksi sementara sandbox aktif → kredensial dan flag
 *      tercampur, yang paling sering terjadi karena keduanya diisi di tempat
 *      berbeda.
 *
 * Lapis kedua hanya dipasang untuk provider yang prefix produsinya sudah
 * terverifikasi (Xendit). Midtrans, iPaymu, dan DOKU hanya andalkan lapis
 * pertama. Midtrans khususnya sengaja TIDAK memakai daftar putih prefix sandbox
 * meski dokumentasi menyebut "SB-Mid-": kredensial sandbox yang dipakai tim
 * ini tidak mengikuti pola itu, jadi whitelist akan memblokir probe yang
 * sebenarnya bekerja.
 */
export function assertProbeTargetsSandbox(opts: ProbeSafetyOptions): void {
  const force = process.env.PROBE_ALLOW_PRODUCTION === "1";
  if (force) return;

  const berhenti = (alasan: string) => {
    console.error(
      `\n[!] Probe ${opts.provider} berhenti sebelum berjalan.\n` +
        `    ${alasan}\n\n` +
        `    Probe ini membuat transaksi lalu membatalkannya, jadi terhadap akun\n` +
        `    produksi itu berarti:\n` +
        `      • puluhan transaksi nyata muncul di dashboard merchant,\n` +
        `      • kanal e-wallet/paylater bisa memicu notifikasi ke pelanggan,\n` +
        `      • dan semuanya dibatalkan, jadi laporan bulanan ikut kotor.\n\n` +
        `    Kalau ini memang yang kamu mau, set:\n` +
        `      PROBE_ALLOW_PRODUCTION=1\n`,
    );
    process.exit(1);
  };

  if (opts.sandbox === false) {
    berhenti("Mode produksi terdeteksi (sandbox: false).");
  }

  const key = (opts.apiKey || "").trim();
  if (!key) return;

  if ((opts.liveKeyPrefixes || []).some((prefix) => key.startsWith(prefix))) {
    berhenti(
      `Kredensial ${opts.provider} terdeteksi sebagai kunci produksi, sementara ` +
        `sandbox aktif.`,
    );
  }
}
