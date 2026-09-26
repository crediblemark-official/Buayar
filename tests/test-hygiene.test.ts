/**
 * Regresi untuk isolasi environment antar-test.
 *
 * `process.env` itu global, dan `bun test` menjalankan seluruh file dalam satu
 * proses. Test yang menghapus env tanpa memulihkannya tidak cuma mengotori
 * dirinya sendiri — ia merusak semua test yang menyusul, diam-diam.
 *
 * Yang sudah terjadi di repo ini, dan baru ketahuan karena test yang men-trigger
 * adalah yang pertama benar-benar butuh `PATH`:
 *
 *   tests/config.test.ts  `beforeEach` menghapus SELURUH process.env, dan tidak
 *                        pernah memulihkannya. Setelah suite berjalan, hanya 4
 *                        variabel yang tersisa dan `PATH` bernilai undefined.
 *   tests/oy.test.ts      menghapus var OY di `afterEach` tanpa mengembalikannya
 *                        ke nilai semula.
 *
 * Gejalanya menyesatkan: test berikutnya tidak gagal karena bug-nya, tapi karena
 * ia melihat environment yang sudah dikosongkan file lain. Orang lalu mulai
 * mendebug di tempat yang salah.
 *
 * Test di bawah memindai `tests/*.ts` dan menolak pola:hapus-tanpa-kembalikan.
 */

import { describe, it, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TESTS_DIR = join(process.cwd(), "tests");
const FILES = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts"));

/** Adakah file ini menyimpan salinan env lalu mengembalikannya? */
function punyaPemulihan(source: string): boolean {
  return (
    /process\.env\s*=\s*\{\s*\.\.\./.test(source) || // set ulang dari salinan
    /process\.env\s*=\s*(ENV_AWAL|originalEnv|savedEnv|prevEnv|ENV_INI)/.test(source) ||
    /process\.env\[[^\]]+\]\s*=\s*(awal|ENV_AWAL)/.test(source) || // salin dari cadangan
    /delete process\.env\[key\];\s*\}\s*\n\s*(afterEach|afterAll)/.test(source)
  );
}

/** Apakah file ini menghapus env secara bermasif? */
function hapusMassif(source: string): boolean {
  return (
    /for \(const key of Object\.keys\(process\.env\)\)[\s\S]{0,80}delete process\.env\[/.test(source) ||
    /delete process\.env\.\w+;/.test(source)
  );
}

describe("Isolasi environment antar-test", () => {
  it("memindai file test yang menghapus env", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("tidak ada test yang menghapus env tanpa memulihkannya", () => {
    const pelaku: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(join(TESTS_DIR, file), "utf8");
      if (hapusMassif(source) && !punyaPemulihan(source)) pelaku.push(file);
    }
    expect(pelaku).toEqual([]);
  });

  it("tests/config.test.ts memulihkan environment setelah mengosongkannya", () => {
    // Test ini yang paling berbahaya: ia mengosongkan SELURUH environment.
    const source = readFileSync(join(TESTS_DIR, "config.test.ts"), "utf8");
    expect(source).toMatch(/const ENV_AWAL = \{ \.\.\.process\.env \}/);
    expect(source).toMatch(/afterEach\(\(\) => \{[\s\S]{0,120}process\.env = \{ \.\.\.ENV_AWAL \}/);
  });

  it("tests/oy.test.ts mengembalikan nilai env OY ke nilai semula", () => {
    // Menghapus var OY selalu berarti "tidak ada"; kalau aslinya ada, nilai itu
    // harus dikembalikan, bukan dihilangin.
    const source = readFileSync(join(TESTS_DIR, "oy.test.ts"), "utf8");
    expect(source).toMatch(/process\.env\[key\] = awal/);
  });

  it("test tidak mengandalkan $PATH untuk menjalankan binary", () => {
    // Pelajaran dari insiden yang sama: pakai process.execPath, bukan "bun" dari
    // $PATH, supaya kebocoran env di file lain tidak bisa meruntuhkan test ini.
    const source = readFileSync(join(TESTS_DIR, "probe-safety.test.ts"), "utf8");
    expect(source).toMatch(/const BUN = process\.execPath/);
    expect(source).not.toMatch(/\["bun",/);
  });
});
