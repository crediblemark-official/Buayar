/**
 * Probe operasi operasional Duitku (read-only, aman).
 */
import { DuitkuClient } from "../../../src/clients/duitku";
import { assertProbeTargetsSandbox } from "../lib";

const MC = (process.env.DUITKU_MERCHANT_CODE || process.env.PAYMENT_MERCHANT_CODE || "").trim();
const KEY = (process.env.DUITKU_API_KEY || process.env.PAYMENT_API_KEY || "").trim();
const SANDBOX = (process.env.DUITKU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";

if (!MC || !KEY) { console.error("❌ DUITKU_MERCHANT_CODE + DUITKU_API_KEY wajib diset."); process.exit(1); }
assertProbeTargetsSandbox({ provider: "duitku", sandbox: SANDBOX, apiKey: KEY });

const client = new DuitkuClient({ provider: "duitku", merchantCode: MC, apiKey: KEY, sandbox: SANDBOX });

async function t<T>(ms: number, w: () => Promise<T>): Promise<T> {
  let x: any;
  try { return await Promise.race([w(), new Promise<never>((_,r)=>{x=setTimeout(()=>r(new Error(`Timeout ${ms}ms`)),ms)})]); }
  finally { clearTimeout(x); }
}

async function main() {
  console.log("=".repeat(80)); console.log("PROBE OPS Duitku"); console.log(`Mode: ${SANDBOX}`); console.log("=".repeat(80));
  try { const bal = await t(20000, ()=>client.checkBalance()); console.log(`checkBalance: success=${bal.success} bal=${bal.balance??"n/a"}`);} catch(e:any){console.error("balance:",e.message);}
  try { const banks = await t(20000, ()=>client.listBanks()); console.log(`listBanks: ${JSON.stringify(banks).slice(0,90)}`);} catch(e:any){console.error("banks:",e.message);}
  console.log("=".repeat(80));
}
main().catch(e=>{console.error(e);process.exit(1)});
