/**
 * CLI TERPADU — jalankan probe live per-channel untuk semua provider sekaligus.
 *
 * Menjalankan setiap skrip `scripts/probe-<provider>-channels.ts` dengan `PROBE_JSON=1`,
 * menggabungkan ringkasan terstrukturnya, lalu mencetak tabel + JSON.
 *
 * Pemakaian:
 *   bun run scripts/probe.ts                       # semua provider yang kredensialnya ada
 *   bun run scripts/probe.ts midtrans doku         # provider tertentu
 *   PROBE_JSON=1 bun run scripts/probe.ts          # keluarkan ringkasan JSON saja
 *   PROBE_AMOUNT=1000 PROBE_ONLY=bca_va bun run scripts/probe.ts doku
 *
 * Variabel `PROBE_*` lain (PROBE_AMOUNT, PROBE_ONLY, PROBE_MCP, PROBE_API_VERSION,
 * PROBE_CASES, PROBE_NO_CANCEL, RAW, ...) diteruskan apa adanya ke setiap probe.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PROBE_JSON_PREFIX, isProbeJsonMode, type ProbeSummary } from "./lib";

interface ProviderSpec {
  id: string;
  label: string;
  script: string;
  /** true bila seluruh env yang diperlukan sudah diset. */
  hasCredentials: (env: NodeJS.ProcessEnv) => boolean;
  missingHint: string;
}

const ALL: ProviderSpec[] = [
  {
    id: "midtrans",
    label: "Midtrans",
    script: "midtrans/channels.ts",
    hasCredentials: (e) => Boolean(e.MIDTRANS_SERVER_KEY || e.BUAYAR_API_KEY),
    missingHint: "MIDTRANS_SERVER_KEY / BUAYAR_API_KEY",
  },
  {
    id: "ipaymu",
    label: "iPaymu",
    script: "ipaymu/channels.ts",
    hasCredentials: (e) =>
      Boolean(e.IPAYMU_API_KEY || e.BUAYAR_API_KEY) &&
      Boolean(e.IPAYMU_VA || e.IPAYMU_MERCHANT_CODE || e.BUAYAR_MERCHANT_CODE),
    missingHint: "IPAYMU_API_KEY + IPAYMU_VA (atau BUAYAR_*)",
  },
  {
    id: "xendit",
    label: "Xendit",
    script: "xendit/channels.ts",
    hasCredentials: (e) => Boolean(e.XENDIT_SECRET_KEY || e.BUAYAR_API_KEY),
    missingHint: "XENDIT_SECRET_KEY / BUAYAR_API_KEY",
  },
  {
    id: "doku",
    label: "DOKU",
    script: "doku/channels.ts",
    hasCredentials: (e) =>
      Boolean(e.DOKU_CLIENT_ID || e.DOKU_MERCHANT_ID) &&
      Boolean(e.DOKU_SECRET_KEY || e.BUAYAR_API_KEY),
    missingHint: "DOKU_CLIENT_ID + DOKU_SECRET_KEY",
  },
  {
    id: "duitku",
    label: "Duitku",
    script: "duitku/channels.ts",
    hasCredentials: (e) =>
      Boolean(e.DUITKU_MERCHANT_CODE || e.PAYMENT_MERCHANT_CODE) &&
      Boolean(e.DUITKU_API_KEY || e.PAYMENT_API_KEY),
    missingHint: "DUITKU_MERCHANT_CODE + DUITKU_API_KEY",
  },
  {
    id: "xenith",
    label: "Xenith",
    script: "xenith/channels.ts",
    hasCredentials: (e) =>
      Boolean(e.XENITH_ACCESS_KEY || e.BUAYAR_API_KEY) &&
      Boolean(e.XENITH_SECRET_KEY || e.BUAYAR_SECRET_KEY),
    missingHint: "XENITH_ACCESS_KEY + XENITH_SECRET_KEY",
  },
];

function parseTargets(): ProviderSpec[] {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const ids = (args.length ? args : (process.env.PROBE_PROVIDERS || "").split(","))
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  if (!ids.length) return ALL;

  const selected = ALL.filter((p) => ids.includes(p.id));
  const unknown = ids.filter((id) => !ALL.some((p) => p.id === id));
  if (unknown.length) {
    console.error(`❌ Provider tidak dikenal: ${unknown.join(", ")}`);
    console.error(`   Pilihan: ${ALL.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }
  return selected;
}

function runProbe(spec: ProviderSpec): ProbeSummary {
  const scriptPath = join(import.meta.dir, spec.script);
  const res = spawnSync("bun", ["run", scriptPath], {
    env: { ...process.env, PROBE_JSON: "1" },
    encoding: "utf8",
  });

  const stdout = res.stdout || "";
  const line = stdout
    .split("\n")
    .find((l) => l.startsWith(PROBE_JSON_PREFIX));

  if (!line) {
    return {
      provider: spec.id,
      skipped: true,
      tested: 0,
      passed: 0,
      expected: 0,
      failed: 0,
      results: [],
      reason:
        (res.stderr || "").trim().split("\n").pop() ||
        `probe tidak menghasilkan ringkasan (exit ${res.status})`,
    };
  }

  try {
    return JSON.parse(line.slice(PROBE_JSON_PREFIX.length)) as ProbeSummary;
  } catch (e: any) {
    return {
      provider: spec.id,
      skipped: true,
      tested: 0,
      passed: 0,
      expected: 0,
      failed: 0,
      results: [],
      reason: `ringkasan JSON tidak dapat diparsing: ${e?.message || e}`,
    };
  }
}

function printHuman(summaries: ProbeSummary[]): void {
  console.log("\n" + "=".repeat(96));
  console.log("RINGKASAN PROBE LIVE — semua provider");
  console.log("=".repeat(96));

  for (const s of summaries) {
    if (s.skipped) {
      console.log(`\n⏭️  ${s.provider.toUpperCase().padEnd(9)} dilewati — ${s.reason}`);
      continue;
    }
    console.log(
      `\n📦 ${s.provider.toUpperCase().padEnd(9)} sumber=${s.source ?? "-"} · ` +
        `${s.passed}/${s.tested} OK · ${s.expected} diharapkan · ${s.failed} gagal` +
        (s.sideEffects !== undefined ? ` · side-effect=${s.sideEffects}` : "")
    );
    for (const r of s.results) {
      const tag = r.ok ? "✅" : r.expected ? "⏸️ " : "❌";
      const label = `${r.group ? `${r.group} / ` : ""}${r.method}`.padEnd(42);
      const detail = r.ok ? r.detail || "—" : r.error || "—";
      console.log(`   ${tag} ${label} ${detail}`);
    }
  }

  const totals = summaries.reduce(
    (acc, s) => {
      if (s.skipped) return acc;
      acc.tested += s.tested;
      acc.passed += s.passed;
      acc.expected += s.expected;
      acc.failed += s.failed;
      return acc;
    },
    { tested: 0, passed: 0, expected: 0, failed: 0 }
  );

  console.log("\n" + "=".repeat(96));
  console.log(
    `TOTAL: ${totals.passed}/${totals.tested} diterima · ${totals.expected} diharapkan · ${totals.failed} gagal`
  );
  console.log("=".repeat(96));
}

function main(): void {
  const targets = parseTargets();
  const summaries: ProbeSummary[] = [];

  for (const spec of targets) {
    if (!spec.hasCredentials(process.env)) {
      summaries.push({
        provider: spec.id,
        skipped: true,
        tested: 0,
        passed: 0,
        expected: 0,
        failed: 0,
        results: [],
        reason: `kredensial belum diset (${spec.missingHint})`,
      });
      if (!isProbeJsonMode()) console.log(`⏭️  ${spec.label}: dilewati — butuh ${spec.missingHint}`);
      continue;
    }

    if (!isProbeJsonMode()) console.log(`▶️  Menjalankan probe ${spec.label}…`);
    summaries.push(runProbe(spec));
  }

  if (isProbeJsonMode()) {
    const totals = summaries.reduce(
      (acc, s) => {
        if (s.skipped) return acc;
        acc.tested += s.tested;
        acc.passed += s.passed;
        acc.expected += s.expected;
        acc.failed += s.failed;
        return acc;
      },
      { tested: 0, passed: 0, expected: 0, failed: 0 }
    );
    console.log(JSON.stringify({ totals, providers: summaries }, null, 2));
    return;
  }

  printHuman(summaries);
}

main();
