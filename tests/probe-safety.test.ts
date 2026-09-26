/**
 * Regresi untuk penjaga target probe (`assertProbeTargetsSandbox`).
 *
 * Probe adalah skrip yang mengubah state: Midtrans dan iPaymu membuat puluhan
 * transaksi lalu membatalkannya. `sandbox` hanya sebuah default `true`, jadi
 * begitu ada yang menyetel `MIDTRANS_SANDBOX=false`, atau memakai server key
 * produksi sementara env-nya lupa diubah, probe berjalan terhadap akun merchant
 * yang sungguhan: puluhan transaksi nyata muncul di dashboard produksi, kanal
 * e-wallet bisa memicu notifikasi ke nomor pelanggan, lalu semuanya dibatalkan
 * sehingga laporan bulanan ikut kotor. Kerugiannya tidak bisa ditarik kembali.
 *
 * Karena `berhenti()` memanggil `process.exit`, guard ini diuji lewat subprocess
 * — memanggilnya langsung akan membunuh proses test.
 */

import { describe, it, expect } from "bun:test";

// Konsisten dengan tests lain: suite dijalankan dari root repo, dan
// import.meta ditolak di bawah module NodeNext tanpa type: module.
const REPO = process.cwd();

// Binary Bun yang sedang menjalankan test ini. Sengaja TIDAK memakai
// "bun" dari $PATH: beberapa test lain mengganti process.env secara
// keseluruhan lalu memulihkannya, dan bila ada yang tidak memulihkan,
// PATH ikut hilang besertanya. process.execPath tidak terpengaruh.
const BUN = process.execPath;

/** Jalankan probe di subprocess; kembalikan exit code + output. */
async function jalankanProbe(
  probe: string,
  env: Record<string, string>,
): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([BUN, "run", `scripts/probe/${probe}`], {
    cwd: REPO,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: stdout + stderr };
}

describe("Penjaga target probe — probe tidak boleh menembak produksi diam-diam", () => {
  it("berhenti saat sandbox: false eksplisit", async () => {
    const { code, output } = await jalankanProbe("midtrans/channels.ts", {
      MIDTRANS_SERVER_KEY: "SB-Mid-server-dummy",
      MIDTRANS_SANDBOX: "false",
      PROBE_AMOUNT: "1000",
    });
    expect(code).toBe(1);
    expect(output).toContain("berhenti sebelum berjalan");
    expect(output).toContain("Mode produksi terdeteksi");
  });

  it("berhenti saat kredensial produksi tertukar dengan sandbox aktif", async () => {
    // Kredensial Xendit produksi, tapi env masih bilang sandbox.
    const { code, output } = await jalankanProbe("xendit/channels.ts", {
      XENDIT_SECRET_KEY: "xnd_production_dummy",
      XENDIT_SANDBOX: "true",
    });
    expect(code).toBe(1);
    expect(output).toContain("terdeteksi sebagai kunci produksi");
  });

  it("tidak membocorkan nilai kredensial ke pesan error", async () => {
    const { output } = await jalankanProbe("xendit/channels.ts", {
      XENDIT_SECRET_KEY: "xnd_production_RAHASIA_YANG_JANGAN_MUNCUL",
      XENDIT_SANDBOX: "true",
    });
    expect(output).not.toContain("RAHASIA_YANG_JANGAN_MUNCUL");
  });

  it("bypass eksplisit tersedia untuk yang memangerti", async () => {
    // Opt-in harus benar-benar melewati guard, kalau tidak orang akan mencari
    // jalan lain untuk melewatinya — dan jalan liar itulah yang berbahaya.
    const { output } = await jalankanProbe("xendit/channels.ts", {
      XENDIT_SECRET_KEY: "xnd_production_dummy",
      XENDIT_SANDBOX: "true",
      PROBE_ALLOW_PRODUCTION: "1",
      PROBE_ONLY: "bca_va",
    });
    expect(output).not.toContain("berhenti sebelum berjalan");
  });

  it("menjelaskan cara melewati, bukan hanya menolak", async () => {
    const { output } = await jalankanProbe("midtrans/channels.ts", {
      MIDTRANS_SERVER_KEY: "SB-Mid-server-dummy",
      MIDTRANS_SANDBOX: "false",
    });
    // Penolakan tanpa jalan keluar hanya akan membuat orang mencari cara lain.
    expect(output).toContain("PROBE_ALLOW_PRODUCTION=1");
  });
});

describe("Penjaga target probe — kode yang tidak bisa diandalkan lebih buruk dari tidak ada", () => {
  it("tidak memakai daftar putih prefix sandbox untuk Midtrans", async () => {
    // Dokumentasi menyebut server key sandbox Midtrans diawali "SB-Mid-", tapi
    // kredensial sandbox yang dipakai tim ini TIDAK mengikuti pola itu.
    //
    // Kalau daftar putih dipasang, probe yang selama ini bekerja akan diblokir,
    // lalu orang belajar memakai bypass. Dan bypass itulah yang membuat probe
    // produksi sungguhan lolos tanpa disadari. Verifikasi di bawah memakai key
    // tanpa awalan "SB-Mid-" yang harus tetap berjalan.
    const { code, output } = await jalankanProbe("midtrans/channels.ts", {
      MIDTRANS_SERVER_KEY: "abc-123456-keywithoutknownprefix",
      MIDTRANS_SANDBOX: "true",
      PROBE_ONLY: "qris",
      PROBE_AMOUNT: "1000",
      PROBE_TIMEOUT_MS: "8000",
    });
    expect(code).not.toBe(1);
    expect(output).not.toContain("berhenti sebelum berjalan");
  });
});
