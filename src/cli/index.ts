#!/usr/bin/env node
import * as path from "node:path";
import * as fs from "node:fs";
import * as p from "@clack/prompts";
import { FRAMEWORKS, PROVIDERS, Framework } from "./templates";
import { selectPrompt, confirmPrompt } from "./prompts";
import { scaffold, printScaffoldSummary } from "./scaffold";

const VERSION = "0.8.5";

interface RawOptions {
  flag: string;
  value?: string;
}

function parseArgs(argv: string[]): { command: string; flags: RawOptions[]; rest: string[] } {
  const flags: RawOptions[] = [];
  const rest: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const idx = a.indexOf("=");
      if (idx !== -1) {
        flags.push({ flag: a.slice(2, idx), value: a.slice(idx + 1) });
        i++;
        continue;
      }
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags.push({ flag: name, value: next });
        i += 2;
      } else {
        flags.push({ flag: name, value: undefined });
        i++;
      }
    } else if (a.startsWith("-") && a.length === 2) {
      flags.push({ flag: a.slice(1), value: undefined });
      i++;
    } else {
      rest.push(a);
      i++;
    }
  }
  const command = rest.shift() || "init";
  return { command, flags, rest };
}

function getFlag(flags: RawOptions[], name: string): string | undefined {
  const found = flags.find((f) => f.flag === name);
  if (found) {
    if (found.value !== undefined) return found.value;
    return "";
  }
  return undefined;
}

function hasFlag(flags: RawOptions[], name: string): boolean {
  return flags.some((f) => f.flag === name);
}

function printHelp(): void {
  console.log(`
@crediblemark/buayar — Unified Payment Gateway SDK

Usage:
  buayar init                    Scaffold boilerplate (interaktif, arrow-key)
  buayar init --yes              Scaffold non-interaktif (defaults)
  buayar init --out <dir>        Direktori target (default: ./)
  buayar init --provider <id>    Paksa provider (default: midtrans)
  buayar init --framework <fw>   express | hono | nextjs (default: express)
  buayar init --force            Timpa file yang sudah ada
  buayar --version | -v          Tampilkan versi
  buayar --help | -h             Tampilkan bantuan

Contoh:
  buayar init --yes --framework hono --provider xendit
`);
}

async function runInit(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv);

  const yes = hasFlag(flags, "yes");
  const force = hasFlag(flags, "force");
  const outRaw = getFlag(flags, "out");
  const targetDir = outRaw ? (outRaw === "" ? "./" : outRaw) : "./";
  const resolvedDir = path.resolve(targetDir);

  p.intro("🐊 Buayar init — Unified Payment Gateway scaffold");

  let provider = getFlag(flags, "provider") || undefined;
  if (!provider && !yes) {
    provider = await selectPrompt(
      "Pilih provider aktif",
      PROVIDERS.map((value) => ({
        value,
        hint: value === "midtrans" ? "populer di Indonesia" : undefined,
      })),
      "midtrans"
    );
  }
  provider = provider || "midtrans";
  if (!PROVIDERS.includes(provider as any)) {
    p.cancel(`Provider tidak dikenal: "${provider}"`);
    return 1;
  }

  let framework: Framework = (getFlag(flags, "framework") as Framework) || undefined;
  if (!framework && !yes) {
    framework = (await selectPrompt(
      "Pilih framework route",
      [
        { value: "express", hint: "Node.js REST API" },
        { value: "hono", hint: "Ringan, edge-ready" },
        { value: "nextjs", hint: "App Router" },
      ],
      "express"
    )) as Framework;
  }
  framework = framework || "express";
  if (!FRAMEWORKS.includes(framework)) {
    p.cancel(`Framework tidak dikenal: "${framework}"`);
    return 1;
  }

  if (!yes && !fs.existsSync(path.join(resolvedDir, "package.json"))) {
    const cont = await confirmPrompt(
      `"${resolvedDir}" bukan proyek Node yang terlihat. Lanjutkan?`,
      true
    );
    if (!cont) {
      p.outro("Dibatalkan.");
      return 0;
    }
  }

  if (!yes) {
    const ok = await confirmPrompt(
      `Scaffold ${framework} (provider ${provider}) ke "${resolvedDir}"?`,
      true
    );
    if (!ok) {
      p.outro("Dibatalkan.");
      return 0;
    }
  }

  const result = scaffold(resolvedDir, provider, framework, { overwrite: force });
  printScaffoldSummary(result);

  p.outro(`
Selesai! Langkah berikutnya:
  1. Salin .env.example ke .env & isi kredensial (PROVIDER_PG + key provider aktif).
  2. Mount route payment (lihat README-PAYMENT.md).
  3. Ganti provider cukup ubah .env — kode tidak berubah.
`);
  return result.errors.length ? 1 : 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const { command, flags } = parseArgs(argv);

  if (argv.length === 0 || command === "init") {
    if (hasFlag(flags, "version") || hasFlag(flags, "v")) {
      console.log(VERSION);
      return 0;
    }
    if (hasFlag(flags, "help") || hasFlag(flags, "h")) {
      printHelp();
      return 0;
    }
    return runInit(argv);
  }

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(VERSION);
    return 0;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }

  console.error(`\n✖ Perintah tidak dikenal: "${command}"`);
  printHelp();
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
