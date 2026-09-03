import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildScaffold, getRouteTemplate, FRAMEWORKS, PROVIDERS } from "../src/cli/templates";
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

  it("exposes all 19 providers", () => {
    expect(PROVIDERS.length).toBe(19);
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
