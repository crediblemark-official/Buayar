/**
 * Probe operasi operasional DOKU (read-only, aman — tanpa disbursement).
 */
import { DokuClient } from "../../../src/clients/doku";
import type { ProviderConfig } from "../../../src/types";
import { assertProbeTargetsSandbox } from "../lib";

const CLIENT_ID = (process.env.DOKU_CLIENT_ID || process.env.DOKU_MERCHANT_ID || "").trim();
const SECRET_KEY = (process.env.DOKU_SECRET_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.DOKU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";

if (!CLIENT_ID || !SECRET_KEY) { console.error("❌ DOKU_CLIENT_ID + DOKU_SECRET_KEY wajib diset."); process.exit(1); }
assertProbeTargetsSandbox({ provider: "doku", apiKey: SECRET_KEY, sandbox: SANDBOX });

const config: ProviderConfig = { provider: "doku", merchantCode: CLIENT_ID, apiKey: SECRET_KEY, secretKey: SECRET_KEY, sandbox: SANDBOX };
const client = new DokuClient(config);

async function t<T>(ms: number, w: () => Promise<T>): Promise<T> {
  let x: any;
  try { return await Promise.race([w(), new Promise<never>((_,r)=>{x=setTimeout(()=>r(new Error(`Timeout ${ms}ms`)),ms)})]); }
  finally { clearTimeout(x); }
}

async function main() {
  console.log("=".repeat(80)); console.log("PROBE OPS DOKU"); console.log(`Mode: ${SANDBOX}`); console.log("=".repeat(80));
  try { const ct = await t(20000, ()=>client.checkTransaction("PROBE-NOTFOUND")); console.log(`checkTransaction(not-found): ${JSON.stringify(ct).slice(0,120)}`);} catch(e:any){console.error("ct:",e.message);}
  // validateBankAccount adalah read-only (tidak mengirim uang)
  try { const vb = await t(25000, ()=>client.validateBankAccount({ bankAccount:"888888888888", bankCode:"BCA", accountHolderName:"Probe Test" } as any)); console.log(`validateBankAccount: ${JSON.stringify(vb).slice(0,140)}`);} catch(e:any){console.error("validateBA:",e.message);}
  console.log("=".repeat(80));
}
main().catch(e=>{console.error(e);process.exit(1)});
