// Filesystem scaffolding: copy the in-memory template map into the target dir.
import * as fs from "node:fs";
import * as path from "node:path";
import { buildScaffold, Framework } from "./templates";

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
  copied: string[];
  errors: string[];
}

export function scaffold(
  targetDir: string,
  provider: string,
  framework: Framework,
  opts: { overwrite?: boolean } = {}
): ScaffoldResult {
  const files = buildScaffold(provider, framework);
  const written: string[] = [];
  const skipped: string[] = [];
  const copied: string[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(targetDir, relPath);
    const dir = path.dirname(fullPath);
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(fullPath) && !opts.overwrite) {
        skipped.push(relPath);
        continue;
      }
      fs.writeFileSync(fullPath, content, "utf8");
      written.push(relPath);
    } catch (e: any) {
      errors.push(`${relPath}: ${e.message}`);
    }
  }

  // Salin .env.example -> .env hanya bila .env belum ada (jangan menimpa).
  const envExample = path.join(targetDir, ".env.example");
  const env = path.join(targetDir, ".env");
  if (fs.existsSync(envExample) && !fs.existsSync(env)) {
    try {
      fs.copyFileSync(envExample, env);
      copied.push(".env");
    } catch (e: any) {
      errors.push(`.env: ${e.message}`);
    }
  }

  return { written, skipped, copied, errors };
}

export function printScaffoldSummary(result: ScaffoldResult): void {
  const color = (c: string, s: string) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
  if (result.written.length) {
    console.log(color("32", "\n✔ File dibuat:"));
    for (const f of result.written) console.log(`  ${color("36", f)}`);
  }
  if (result.copied.length) {
    console.log(color("32", "\n↪ Disalin dari .env.example (karena .env belum ada):"));
    for (const f of result.copied) console.log(`  ${color("36", f)}`);
  }
  if (result.skipped.length) {
    console.log(color("33", "\n• Dilewati (sudah ada, gunakan --force untuk menimpa):"));
    for (const f of result.skipped) console.log(`  ${color("36", f)}`);
  }
  if (result.errors.length) {
    console.log(color("31", "\n✖ Error:"));
    for (const e of result.errors) console.log(`  ${color("31", e)}`);
  }
}
