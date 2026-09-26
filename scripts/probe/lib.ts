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
