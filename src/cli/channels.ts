import * as fs from "node:fs";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { Buayar } from "../core/buayar";
import { resolveConfigFromEnv } from "../core/config";
import { PROVIDERS } from "./templates";
import { selectPrompt } from "./prompts";

export interface RawOptions {
  flag: string;
  value?: string;
}

export function loadDotenv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
  } catch {}
}

export function parseArgs(argv: string[]): { command: string; flags: RawOptions[]; rest: string[] } {
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
  const command = rest.shift() || "channels";
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

export function printChannelsHelp(): void {
  console.log(`
@crediblemark/buayar — Auto-generate payment-channels.json

Usage:
  buayar channels [options]
  buayar generate-channels [options]

Opsi:
  --out <file>        Path file output (default: ./payment-channels.json)
  --provider <id>     Paksa provider tertentu (contoh: sumopod, ipaymu, duitku, midtrans)
                      Default: membaca dari .env (BUAYAR_PROVIDER / PROVIDER_PG)
  --amount <nominal>  Nominal transaksi untuk kalkulasi biaya (default: 10000)
  --format <format>   Format output: canonical | raw | categories (default: canonical)
                      - canonical  : Deskriptor siap-render UI Accordion (id, name, type, icon, badge, category, totalFee)
                      - raw        : Format PaymentMethod[] asli dari provider
                      - categories : Object kategori grouping { QRIS: [...], "Virtual Account": [...] }
  --wrap              Bungkus hasil dengan metadata { provider, totalChannels, generatedAt, channels }
  --env <file>        Lokasi file .env kustom (default: ./.env)
  --yes               Jalankan non-interaktif
  --help, -h          Tampilkan bantuan

Contoh:
  buayar channels
  buayar channels --provider sumopod --out ./public/payment-channels.json
  buayar channels --amount 50000 --format canonical
`);
}

export async function runChannels(argv: string[]): Promise<number> {
  const { flags } = parseArgs(argv);

  if (hasFlag(flags, "help") || hasFlag(flags, "h")) {
    printChannelsHelp();
    return 0;
  }

  const yes = hasFlag(flags, "yes");
  const envFile = getFlag(flags, "env") || path.join(process.cwd(), ".env");
  loadDotenv(envFile);

  const envConfig = resolveConfigFromEnv();

  let provider = getFlag(flags, "provider") || envConfig.provider;
  if (!provider && !yes) {
    provider = await selectPrompt(
      "Pilih provider untuk mengambil payment channels",
      PROVIDERS.map((value) => ({
        value,
        hint: value === "sumopod" ? "QRIS & VA" : undefined,
      }))
    );
  }

  if (!provider) {
    provider = "midtrans";
  }

  const normalizedProvider = provider.toLowerCase();
  if (!PROVIDERS.includes(normalizedProvider as any)) {
    console.error(`\n✖ Provider tidak dikenal: "${provider}". Pilihan: ${PROVIDERS.join(", ")}`);
    return 1;
  }

  const outRaw = getFlag(flags, "out") || "./payment-channels.json";
  const outPath = path.resolve(process.cwd(), outRaw);

  const amountRaw = getFlag(flags, "amount");
  const amount = amountRaw ? Number(amountRaw) : 10000;
  if (isNaN(amount) || amount <= 0) {
    console.error(`\n✖ Nominal --amount tidak valid: "${amountRaw}"`);
    return 1;
  }

  const format = (getFlag(flags, "format") || "canonical").toLowerCase();
  const wrap = hasFlag(flags, "wrap");

  p.intro("🐊 Buayar channels — Auto-generate payment-channels.json");

  const s = p.spinner();
  s.start(`Mengambil daftar kanal pembayaran dari provider '${normalizedProvider}'...`);

  try {
    const buayar = new Buayar({
      ...envConfig,
      provider: normalizedProvider,
    });

    let outputData: any;
    let totalCount = 0;

    if (format === "raw") {
      const res = await buayar.getPaymentMethods({ amount }, { provider: normalizedProvider });
      if (!res.success) {
        s.stop(`✖ Gagal mengambil kanal dari '${normalizedProvider}': ${res.error || "Unknown error"}`);
        console.error(`\n💡 Tips: Pastikan kredensial provider '${normalizedProvider}' sudah diset di file .env.`);
        return 1;
      }
      totalCount = res.methods.length;
      outputData = wrap
        ? {
            provider: normalizedProvider,
            totalChannels: totalCount,
            generatedAt: new Date().toISOString(),
            channels: res.methods,
            rawResponse: res.rawResponse,
          }
        : res.methods;
    } else if (format === "categories") {
      const res = await buayar.getPaymentMethods({ amount }, { provider: normalizedProvider });
      if (!res.success) {
        s.stop(`✖ Gagal mengambil kanal dari '${normalizedProvider}': ${res.error || "Unknown error"}`);
        console.error(`\n💡 Tips: Pastikan kredensial provider '${normalizedProvider}' sudah diset di file .env.`);
        return 1;
      }
      totalCount = res.methods.length;
      outputData = wrap
        ? {
            provider: normalizedProvider,
            totalChannels: totalCount,
            generatedAt: new Date().toISOString(),
            categories: res.categories,
          }
        : res.categories;
    } else {
      // Default: canonical
      const res = await buayar.getPaymentMethodDescriptors({ amount }, { provider: normalizedProvider });
      if (!res.success) {
        s.stop(`✖ Gagal mengambil kanal dari '${normalizedProvider}': ${res.error || "Unknown error"}`);
        console.error(`\n💡 Tips: Pastikan kredensial provider '${normalizedProvider}' sudah diset di file .env.`);
        return 1;
      }
      totalCount = res.descriptors.length;
      outputData = wrap
        ? {
            provider: normalizedProvider,
            totalChannels: totalCount,
            generatedAt: res.generatedAt,
            channels: res.descriptors,
          }
        : res.descriptors;
    }

    // Buat direktori jika belum ada
    const targetDir = path.dirname(outPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2) + "\n", "utf8");

    s.stop(`✔ Berhasil mengambil ${totalCount} kanal pembayaran!`);

    p.note(
      `File tersimpan di:\n  ${outPath}\n\n` +
      `Provider    : ${normalizedProvider}\n` +
      `Total Kanal : ${totalCount}\n` +
      `Format      : ${format}\n` +
      `Nominal     : Rp ${amount.toLocaleString("id-ID")}`,
      "📄 Hasil Generate payment-channels.json"
    );

    p.outro("Selesai! Frontend Anda kini dapat langsung mengonsumsi payment-channels.json.");
    return 0;
  } catch (err: any) {
    s.stop(`✖ Terjadi kesalahan: ${err?.message || err}`);
    return 1;
  }
}
