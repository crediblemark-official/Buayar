/**
 * Probe operasi operasional Xendit (read-only, aman).
 */
import { XenditClient } from "../../../src/clients/xendit";
import { assertProbeTargetsSandbox } from "../lib";

const KEY = (process.env.XENDIT_SECRET_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.XENDIT_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";

if (!KEY) { console.error("❌ XENDIT_SECRET_KEY wajib diset."); process.exit(1); }
assertProbeTargetsSandbox({ provider: "xendit", sandbox: SANDBOX, apiKey: KEY });

const client = new XenditClient({ provider: "xendit", apiKey: KEY, sandbox: SANDBOX });

async function t<T>(ms: number, w: () => Promise<T>): Promise<T> {
  let x: any;
  try { return await Promise.race([w(), new Promise<never>((_,r)=>{x=setTimeout(()=>r(new Error(`Timeout ${ms}ms`)),ms)})]); }
  finally { clearTimeout(x); }
}

async function main() {
  console.log("=".repeat(80)); console.log("PROBE OPS Xendit"); console.log(`Mode: ${SANDBOX}`); console.log("=".repeat(80));
  for (const t_ of ["CASH","HOLDING","TAX"] as const) {
    try { const bal = await t(20000, ()=>client.checkBalance(t_)); console.log(`checkBalance(${t_}): success=${bal.success} bal=${bal.balance??"n/a"}`);} catch(e:any){console.error(`balance(${t_}):`,e.message);}
  }
  console.log("=".repeat(80));
}
main().catch(e=>{console.error(e);process.exit(1)});
