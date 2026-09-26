/**
 * Probe operasi operasional iPaymu (read-only, aman).
 */
import { IpaymuProvider } from "../../../src/providers/ipaymu/provider";
import { IpaymuClient } from "../../../src/clients/ipaymu";
import type { ProviderConfig } from "../../../src/types";
import { assertProbeTargetsSandbox } from "../lib";

const VA = (process.env.IPAYMU_VA || process.env.IPAYMU_MERCHANT_CODE || process.env.BUAYAR_MERCHANT_CODE || "").trim();
const API_KEY = (process.env.IPAYMU_API_KEY || process.env.BUAYAR_API_KEY || "").trim();
const SANDBOX = (process.env.IPAYMU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";

if (!VA || !API_KEY) {
  console.error("❌ IPAYMU_VA + IPAYMU_API_KEY wajib diset.");
  process.exit(1);
}

assertProbeTargetsSandbox({ provider: "ipaymu", apiKey: API_KEY, sandbox: SANDBOX });

const config: ProviderConfig = { provider: "ipaymu", merchantCode: VA, apiKey: API_KEY, sandbox: SANDBOX };
const provider = new IpaymuProvider();
const client = new IpaymuClient(config);

async function t<T>(ms: number, w: () => Promise<T>): Promise<T> {
  let x: any;
  try { return await Promise.race([w(), new Promise<never>((_,r)=>{x=setTimeout(()=>r(new Error(`Timeout ${ms}ms`)),ms)})]); }
  finally { clearTimeout(x); }
}

async function main() {
  console.log("=".repeat(80)); console.log("PROBE OPS iPaymu"); console.log(`Mode: ${SANDBOX}`); console.log("=".repeat(80));
  try { const bal = await t(20000, ()=>client.checkBalance()); console.log(`checkBalance: success=${bal.success} bal=${bal.balance??"n/a"}`);} catch(e:any){console.error("balance:",e.message);}
  try { const banks = await t(20000, ()=>client.getBankList()); console.log(`getBankList: ok=${banks.status||banks.Status||JSON.stringify(banks).slice(0,40)}`);} catch(e:any){console.error("banks:",e.message);}
  try { const pcs = await t(30000, ()=>client.getPaymentChannels()); console.log(`getPaymentChannels: ${JSON.stringify(pcs).slice(0,80)}`);} catch(e:any){console.error("pcs:",e.message);}
  console.log("=".repeat(80));
}
main().catch(e=>{console.error(e);process.exit(1)});
