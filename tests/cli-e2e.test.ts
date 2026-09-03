import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Tests run from the repo root; resolve the CLI source entry from cwd.
const cliEntry = path.resolve(process.cwd(), "src/cli/index.ts");

function runCli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = Bun.spawn([process.execPath, cliEntry, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env: { ...process.env, NO_COLOR: "1", CI: "1" },
    });
    const decoder = new TextDecoder();
    let stdout = "";
    let stderr = "";
    proc.stdout.pipeTo(new WritableStream({ write(c: any) { stdout += decoder.decode(c); } }));
    proc.stderr.pipeTo(new WritableStream({ write(c: any) { stderr += decoder.decode(c); } }));
    proc.exited.then((code) => resolve({ code, stdout, stderr }));
  });
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "buayar-e2e-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("CLI end-to-end (non-interactive)", () => {
  it("prints version", async () => {
    const { code, stdout } = await runCli(["--version"], tmpDir);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("0.5.0");
  });

  it("prints help", async () => {
    const { code, stdout } = await runCli(["--help"], tmpDir);
    expect(code).toBe(0);
    expect(stdout).toContain("buayar init");
  });

  it("rejects unknown provider with non-zero exit", async () => {
    const { code } = await runCli(["init", "--yes", "--provider", "nope"], tmpDir);
    expect(code).toBe(1);
  });

  it("rejects unknown framework with non-zero exit", async () => {
    const { code } = await runCli(["init", "--yes", "--framework", "koa"], tmpDir);
    expect(code).toBe(1);
  });

  it("scaffolds boilerplate via --yes", async () => {
    const { code } = await runCli(["init", "--yes", "--framework", "hono", "--provider", "xendit"], tmpDir);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, ".env.example"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".env"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/payment/service.ts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "src/payment/routes/index.ts"))).toBe(true);
    const readme = fs.readFileSync(path.join(tmpDir, "README-PAYMENT.md"), "utf8");
    expect(readme).toContain("xendit");
    expect(readme).toContain("hono");
  });

  it("scaffolds nextjs webhook route", async () => {
    const out = path.join(tmpDir, "nextapp");
    fs.mkdirSync(out, { recursive: true });
    const { code } = await runCli(["init", "--yes", "--framework", "nextjs", "--out", out], tmpDir);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(out, "src/app/api/payment/webhook/route.ts"))).toBe(true);
  });

  it("preserves existing .env and only adds .env.example", async () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "MY_KEY=original");
    const { code } = await runCli(["init", "--yes", "--provider", "midtrans"], tmpDir);
    expect(code).toBe(0);
    expect(fs.readFileSync(path.join(tmpDir, ".env"), "utf8")).toBe("MY_KEY=original");
    expect(fs.existsSync(path.join(tmpDir, ".env.example"))).toBe(true);
  });

  it("supports --out with space-separated value", async () => {
    const out = path.join(tmpDir, "custom dir");
    const { code } = await runCli(["init", "--yes", "--out", out], tmpDir);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(out, ".env.example"))).toBe(true);
  });
});
