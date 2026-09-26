/**
 * Probe operasi operasional Midtrans (read-only, aman).
 *
 * Memverifikasi:
 *   - checkTransaction (server-to-server query)
 *   - getBalance (Client)
 *
 * Pemakaian:
 *   MIDTRANS_SERVER_KEY=SB-Mid-... bun run scripts/probe/midtrans/ops.ts
 */
import { MidtransProvider } from "../../../src/providers/midtrans/provider";
import { MidtransClient } from "../../../src/clients/midtrans";
import type { ProviderConfig } from "../../../src/types";
import { assertProbeTargetsSandbox } from "../lib";

const API_KEY = (process.env.MIDTRANS_SERVER_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.MIDTRANS_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";

if (!API_KEY) {
  console.error("❌ MIDTRANS_SERVER_KEY (atau BUAYAR_API_KEY) wajib diset.");
  process.exit(1);
}

assertProbeTargetsSandbox({ provider: "midtrans", sandbox: SANDBOX, apiKey: API_KEY });

const config: ProviderConfig = { provider: "midtrans", serverKey: API_KEY, sandbox: SANDBOX };
const provider = new MidtransProvider();
const client = new MidtransClient(config);

async function withTimeout<T>(ms: number, work: () => Promise<T>): Promise<T> {
  let t: any;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, r) => { t = setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms); }),
    ]);
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("PROBE OPS Midtrans (read-only)");
  console.log(`Mode: ${SANDBOX ? "sandbox" : "PRODUKSI"}`);
  console.log("=".repeat(80));

  // checkTransaction dengan order palsu — harus return failed/pending dengan aman, TIDAK isFailed salah
  const fakeId = `PROBE-NOTFOUND-${Date.now()}`;
  try {
    const ct = await withTimeout(20000, () => provider.checkTransaction({ merchantOrderId: fakeId }, config));
    console.log(`checkTransaction (not-found): success=${ct.success} status=${ct.status} isFailed=${ct.isFailed}`);
  } catch (e: any) {
    console.error(`checkTransaction (error): ${e.name}: ${e.message}`);
  }

  try {
    const bal = await withTimeout(20000, () => client.getBalance());
    console.log(`getBalance: success=${bal.success} balance=${bal.balance ?? "n/a"}`);
  } catch (e: any) {
    console.error(`getBalance: ${e.name}: ${e.message}`);
  }

  console.log("=".repeat(80));
}

main().catch((e) => { console.error(e); process.exit(1); });
