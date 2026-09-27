import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildScaffold, getRouteTemplate, FRAMEWORKS, PROVIDERS, buildDotEnvTemplate, DOT_ENV_TEMPLATE } from "../src/cli/templates";
import { providerRegistry } from "../src/core/providerRegistry";
import { scaffold } from "../src/cli/scaffold";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "buayar-init-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("buildScaffold", () => {
  it("returns all core template files", () => {
    const files = buildScaffold("midtrans", "express");
    expect(files[".env.example"]).toBeDefined();
    expect(files[".env"]).toBeUndefined();
    expect(files["src/payment/buayar.ts"]).toBeDefined();
    expect(files["src/payment/service.ts"]).toBeDefined();
    expect(files["src/payment/types.ts"]).toBeDefined();
    expect(files["README-PAYMENT.md"]).toBeDefined();
  });

  it("uses express route path by default", () => {
    const files = buildScaffold("midtrans", "express");
    expect(files["src/payment/routes/index.ts"]).toBeDefined();
  });

  it("uses nextjs App Router webhook path", () => {
    const files = buildScaffold("stripe", "nextjs");
    expect(files["src/app/api/payment/webhook/route.ts"]).toBeDefined();
    expect(files["src/app/api/payment/webhook/route.ts"]).toContain("next/server");
  });

  it("embeds chosen provider + framework in README", () => {
    const files = buildScaffold("xendit", "hono");
    expect(files["README-PAYMENT.md"]).toContain("xendit");
    expect(files["README-PAYMENT.md"]).toContain("hono");
  });

  it("route template maps hono and express", () => {
    expect(getRouteTemplate("hono")).toContain("Hono");
    expect(getRouteTemplate("express")).toContain("express");
    expect(FRAMEWORKS).toContain("nextjs");
  });

  it("exposes all 21 providers", () => {
    expect(PROVIDERS.length).toBe(21);
  });

  it("daftar PROVIDERS CLI sinkron dengan provider yang terdaftar di SDK", () => {
    const cli: string[] = [...PROVIDERS].sort();
    const registered: string[] = providerRegistry.names().sort();
    expect(cli).toEqual(registered);
  });

  it("ensures express, hono, and nextjs templates capture raw body for signature verification", () => {
    const expressTpl = getRouteTemplate("express");
    expect(expressTpl).toContain("express.raw({ type: \"application/json\" })");
    expect(expressTpl).toContain("handleWebhook(payload, req.headers as any, rawBody)");

    const honoTpl = getRouteTemplate("hono");
    expect(honoTpl).toContain("await c.req.text()");
    expect(honoTpl).toContain("handleWebhook(");

    const nextFiles = buildScaffold("stripe", "nextjs");
    const nextTpl = nextFiles["src/app/api/payment/webhook/route.ts"];
    expect(nextTpl).toContain("await request.text()");
    expect(nextTpl).toContain("handleWebhook(payload, headers, rawBody)");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Dua cacat di route webhook hasil scaffold, keduanya dibuktikan dengan
  // menjalankan route sungguhan di atas Express (bukan hanya dibaca).
  //
  // (1) `payload = rawBody ? JSON.parse(rawBody) : {}` tanpa try/catch.
  //     Body rusak -> SyntaxError -> 500. Dan karena endpoint webhook itu
  //     publik, siapa pun bisa memicuinya dengan body sampah. Worse: gateway
  //     mengulang pengiriman selama berhari-hari kalau jawabannya 5xx, jadi
  //     satu request rusak bisatoh jadi badai retry.
  //
  // (2) Hanya `express.raw({ type: "application/json" })` yang dipasang.
  //     iPaymu mengirim `application/x-www-form-urlencoded`, dan untuk content
  //     type itu TIDAK ADA parser yang jalan -> `req.body` jadi `undefined`.
  //     Akibatnya route hasil scaffold menolak 100% webhook iPaymu asli:
  //     diverifikasi 400 "Invalid signature" padahal signature-nya benar.
  // ─────────────────────────────────────────────────────────────────────────

  const ROUTE_TEMPLATES: Array<[string, () => string]> = [
    ["express", () => getRouteTemplate("express")],
    ["hono", () => getRouteTemplate("hono")],
    ["nextjs", () => buildScaffold("stripe", "nextjs")["src/app/api/payment/webhook/route.ts"]],
  ];

  for (const [framework, ambil] of ROUTE_TEMPLATES) {
    it(`[${framework}] tidak lagi memakai JSON.parse tanpa penjaga`, () => {
      // Pola ternary yang melempar SyntaxError ke luar route.
      expect(ambil()).not.toMatch(/\?\s*JSON\.parse\(/);
    });

    it(`[${framework}] menangani JSON rusak dengan 400, bukan 500`, () => {
      const tpl = ambil();
      expect(tpl).toContain("Malformed JSON body");
      expect(tpl).toMatch(/catch/);
      // 400 = "tidak akan pernah berhasil kalau dikirim ulang".
      expect(tpl).toMatch(/status: 400|, 400\)|400\)/);
    });

    it(`[${framework}] punya jalur untuk form-urlencoded (iPaymu)`, () => {
      expect(ambil()).toContain("application/x-www-form-urlencoded");
    });
  }

  it("express memasang parser urlencoded selain raw", () => {
    expect(getRouteTemplate("express")).toContain("express.urlencoded({ extended: false })");
  });

  it("express menolak body kosong dengan 400, bukan lolos diam-diam", () => {
    expect(getRouteTemplate("express")).toContain("Empty request body");
  });
});

describe("scaffold", () => {
  it("writes all files to target directory and copies .env from example", () => {
    const result = scaffold(tmpDir, "midtrans", "express");
    expect(result.written.length).toBe(6);
    expect(result.copied).toContain(".env");
    expect(result.errors.length).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, ".env.example"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".env"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/payment/service.ts"))).toBe(true);
  });

  it("does not overwrite .env when it already exists", () => {
    const target = path.join(tmpDir, "sub");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, ".env"), "KEEP=1");
    scaffold(target, "midtrans", "express");
    expect(fs.readFileSync(path.join(target, ".env"), "utf8")).toBe("KEEP=1");
    expect(fs.existsSync(path.join(target, ".env.example"))).toBe(true);
  });

  it("skips existing template files unless overwrite is true", () => {
    const target = path.join(tmpDir, "sub2");
    scaffold(target, "midtrans", "express");
    fs.writeFileSync(path.join(target, "src/payment/service.ts"), "CUSTOM");
    const rerun = scaffold(target, "midtrans", "express");
    expect(rerun.skipped).toContain("src/payment/service.ts");
    expect(fs.readFileSync(path.join(target, "src/payment/service.ts"), "utf8")).toBe("CUSTOM");
  });

  it("overwrites existing files when overwrite=true", () => {
    const target = path.join(tmpDir, "sub3");
    scaffold(target, "midtrans", "express");
    fs.writeFileSync(path.join(target, "src/payment/service.ts"), "CUSTOM");
    const rerun = scaffold(target, "midtrans", "express", { overwrite: true });
    expect(rerun.skipped).not.toContain("src/payment/service.ts");
    expect(fs.readFileSync(path.join(target, "src/payment/service.ts"), "utf8")).not.toBe("CUSTOM");
  });
});

describe("CLI — scaffold .env.example tidak boleh bertentangan dengan provider yang dipilih", () => {
  it("buildDotEnvTemplate memakai provider yang diminta, bukan hardcode midtrans", () => {
    expect(buildDotEnvTemplate("xenith")).toContain("BUAYAR_PROVIDER=xenith");
    expect(buildDotEnvTemplate("xendit")).toContain("BUAYAR_PROVIDER=xendit");
  });

  it("fallback ke midtrans bila provider tidak diberikan", () => {
    expect(buildDotEnvTemplate()).toContain("BUAYAR_PROVIDER=midtrans");
    expect(buildDotEnvTemplate("")).toContain("BUAYAR_PROVIDER=midtrans");
  });

  it("setiap provider menghasilkan .env.example yang menunjuk dirinya sendiri", () => {
    for (const p of PROVIDERS) {
      expect(buildDotEnvTemplate(p), p).toContain(`BUAYAR_PROVIDER=${p}`);
    }
  });

  it("buildScaffold(--provider X) menulis provider X ke .env.example", () => {
    const files = buildScaffold("xenith", "express");
    expect(files[".env.example"]).toContain("BUAYAR_PROVIDER=xenith");
    expect(files[".env.example"]).not.toContain("BUAYAR_PROVIDER=midtrans");
  });

  it("DOT_ENV_TEMPLATE (konstanta) tetap tersedia untuk konsumen lama", () => {
    expect(DOT_ENV_TEMPLATE).toContain("BUAYAR_PROVIDER=midtrans");
  });

  it("outro CLI tidak menyuruh memakai env legacy PROVIDER_PG", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/cli/index.ts"), "utf8");
    // PROVIDER_PG menang atas BUAYAR_PROVIDER secara diam-diam; outro tidak
    // boleh mengarahkan user memakainya.
    const outroLine = src.split("\n").find((l) => l.includes("Salin .env.example")) || "";
    expect(outroLine).not.toContain("PROVIDER_PG +");
    expect(outroLine).toContain("BUAYAR_PROVIDER");
  });
});
