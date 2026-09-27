/**
 * Status verifikasi provider harus terlihat dari dalam SDK, bukan hanya dari docs.
 *
 * Kalau tidak, orang hanya bisa menebak provider mana yang sudah pernah diuji ke
 * server sungguhan — dan tebakan yang salah berujung ke integrasi produksi gagal.
 */
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Buayar } from "../src";
import { providerRegistry } from "../src/core/providerRegistry";
import { collectAuditRows, runAudit, printAuditHelp } from "../src/cli/audit";

const originalEnv = { ...process.env };
const originalLog = console.log;

function captureLog(fn: () => void): string {
  const out: string[] = [];
  console.log = (...a: any[]) => out.push(a.join(" "));
  try { fn(); } finally { console.log = originalLog; }
  return out.join("\n");
}

beforeEach(() => { process.env = { NODE_ENV: "test" }; });
afterEach(() => { process.env = originalEnv; console.log = originalLog; });

const ALL = providerRegistry.names().sort();

/** Lebar tampilan sama seperti implementasi di src/cli/audit.ts. */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) ||
      cp === 0x2705 || cp === 0x274c || cp === 0x26a0;
    w += wide ? 2 : 1;
  }
  return w;
}

describe("Audit — status verifikasi ada di dalam SDK", () => {
  it("setiap provider punya flag verified (boolean, bukan undefined)", () => {
    for (const name of ALL) {
      expect(typeof providerRegistry.get(name)?.verified, name).toBe("boolean");
    }
  });

  it("tepat 8 provider terverifikasi live, 13 contract-tested saja", () => {
    const b = new Buayar({ provider: "midtrans", apiKey: "x" });
    expect(b.listVerifiedProviders().length).toBe(8);
    expect(b.listUnverifiedProviders().length).toBe(13);
    // kedua daftar harus partitioning, tidak tumpang tindih
    const all = [...b.listVerifiedProviders(), ...b.listUnverifiedProviders()].sort();
    expect(all).toEqual(ALL);
  });

  it("daftar provider terverifikasi sesuai docs/providers/README.md", () => {
    const b = new Buayar({ provider: "midtrans", apiKey: "x" });
    expect(b.listVerifiedProviders()).toEqual([
      "doku", "duitku", "finpay", "ipaymu", "midtrans", "sumopod", "xendit", "xenith",
    ]);
  });

  it("provider terverifikasi tidak punya verificationNote", () => {
    for (const name of new Buayar({ provider: "midtrans", apiKey: "x" }).listVerifiedProviders()) {
      expect(providerRegistry.get(name)?.verificationNote, name).toBeUndefined();
    }
  });

  it("provider tak terverifikasi SELALU punya alasan (bukan '-')", () => {
    for (const name of new Buayar({ provider: "midtrans", apiKey: "x" }).listUnverifiedProviders()) {
      const note = providerRegistry.get(name)?.verificationNote;
      expect(note, `${name} harus punya verificationNote`).toBeTruthy();
      expect(note!.length).toBeGreaterThan(10);
    }
  });

  it("getCapabilities membocorkan field verified + serverForwardedMethods", () => {
    const b = new Buayar({ provider: "midtrans", apiKey: "x" });
    // regresi: capabilities dulu hanya mengembalikan methods + operations
    expect(b.getCapabilities("adyen")?.verified).toBe(false);
    expect(b.getCapabilities("midtrans")?.verified).toBe(true);
    expect(b.getCapabilities("adyen")?.serverForwardedMethods).toContain("credit_card");
    expect(b.getCapabilities("square")?.serverForwardedMethods).toBeUndefined();
  });

  it("getCapabilities tidak membocorkan envKeys (internal autodetect)", () => {
    const caps: any = new Buayar({ provider: "midtrans", apiKey: "x" }).getCapabilities("midtrans");
    expect(caps.envKeys).toBeUndefined();
    expect(caps.requiredEnvKeys).toBeUndefined();
    expect(caps.name).toBeUndefined();
  });

  it("getCapabilities provider tak dikenal tetap undefined", () => {
    expect(new Buayar({ provider: "midtrans", apiKey: "x" }).getCapabilities("tidak-ada")).toBeUndefined();
  });

  it("verified tidak boleh dianggap sebagai 'belum jadi' — tidak ada verifikasi negatif", () => {
    // Kalau suatu saat ada provider yang TANPA kredensial sama sekali, itu
    // harus tetap punya flag boolean, bukan undefined (yang ambigu).
    for (const name of ALL) {
      const cap = providerRegistry.get(name)!;
      expect(cap.methods.length, name).toBeGreaterThan(0);
    }
  });
});

describe("Audit — CLI buayar audit", () => {
  it("help menjelaskan arti verified vs unverified", () => {
    const help = captureLog(() => printAuditHelp());
    expect(help).toContain("verified");
    expect(help).toContain("sandbox");
    expect(help).toContain("--json");
    // harus menyatakan bahwa unverified != rusak
    expect(help.toLowerCase()).toContain("bukan berarti kode rusak");
  });

  it("--json mengeluarkan 21 provider dengan field yang lengkap", () => {
    const out = captureLog(() => runAudit(["audit", "--json"]));
    const data = JSON.parse(out);
    expect(data.total).toBe(21);
    expect(data.verified).toBe(8);
    expect(data.unverified).toBe(13);
    expect(data.providers.length).toBe(21);
    for (const p of data.providers) {
      expect(typeof p.name).toBe("string");
      expect(typeof p.verified).toBe("boolean");
      expect(typeof p.methods).toBe("number");
      expect(typeof p.advisoryOnly).toBe("boolean");
    }
  });

  it("--only-unverified hanya menampilkan yang belum terverifikasi", () => {
    const out = captureLog(() => runAudit(["audit", "--json", "--only-unverified"]));
    const data = JSON.parse(out);
    expect(data.providers.length).toBe(13);
    expect(data.providers.every((p: any) => p.verified === false)).toBe(true);
  });

  it("tabel teks memuat kedua kelompok + ringkasan", () => {
    const out = captureLog(() => runAudit(["audit"]));
    expect(out).toContain("provider");
    expect(out).toContain("verified");
    expect(out).toContain("Total 21 provider");
    expect(out).toContain("8 terverifikasi live");
    expect(out).toContain("13 contract-tested saja");
    // kolom tabel harus rata despite emoji
    const headerLine = out.split("\n").find((l) => l.includes("provider") && l.includes("verified"))!;
    const rows = out.split("\n").filter((l) => /^\S+\s+[✅⏳]/.test(l));
    expect(rows.length).toBe(21);
    expect(headerLine).toBeTruthy();

    // Kolom 'catatan' harus mulai di kolom yang sama untuk SEMUA baris.
    // Kalau padding rusak, emoji (2 kolom visual tapi 1-2 unit kode) menggeser
    // seluruh tabel ke kanan — persis bug yang harus dicegat.
    //
    // Sumber kebenaran: `collectAuditRows()` — bukan regex tebakan.
    // Baris yang PUNYA catatan harus mulai di kolom yang sama persis.
    // (Baris tanpa catatan lebih pendek — kolom catatannya kosong, itu wajar.)
    const NOTE_COL = 13 + 10 + 9 + 5;
    const offsets = new Set<number>();
    let noted = 0;
    for (const row of collectAuditRows()) {
      const line = rows.find((r) => r.startsWith(row.name + " "));
      expect(line, `baris untuk ${row.name} tidak ada`).toBeTruthy();
      if (!row.note) continue;
      noted++;
      expect(line!.trimEnd().endsWith(row.note), `catatan ${row.name} tidak cocok`).toBe(true);
      offsets.add(displayWidth(line!.trimEnd()) - displayWidth(row.note));
    }
    expect(noted).toBe(13);
    expect([...offsets], "kolom catatan tidak rata").toEqual([NOTE_COL]);

    // 8 baris tanpa catatan = 8 provider terverifikasi live
    expect(rows.filter((r) => /\s+$/.test(r)).length).toBe(8);
  });

  it("menyebut 5 provider advisory-only dan menjelaskan artinya", () => {
    const out = captureLog(() => runAudit(["audit"]));
    expect(out).toContain("advisory");
    for (const p of ["braintree", "checkoutcom", "paypal", "square", "twocheckout"]) {
      expect(out).toContain(p);
    }
  });

  it("collectAuditRows konsisten dengan registry", () => {
    const rows = collectAuditRows();
    expect(rows.length).toBe(21);
    expect(rows.filter((r) => r.verified).length).toBe(8);
  });
});
