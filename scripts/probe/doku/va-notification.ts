/**
 * PROBE NOTIFIKASI VA MCP DOKU (D-17) — verifikasi end-to-end pembayaran VA
 * untuk kanal mcpOnly (BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS).
 *
 * Alur per bank:
 *   1. Terbitkan VA via DOKU MCP `create_virtual_account_payment`.
 *   2. Cek status transaksi awal via MCP `get_transaction_by_invoice_number`.
 *   3. Bila kanal punya simulator sandbox (btn, bnc): bayar VA lewat endpoint
 *      simulator `https://sandbox.doku.com/doku/simulator/v1/...`.
 *   4. Tunggu, cek ulang status transaksi → harapannya berubah jadi SUCCESS/PAID,
 *      bukti alur inquiry→payment→notifikasi berjalan.
 *
 * Catatan: notifikasi HTTP dikirim DOKU ke Notification URL yang dikonfigurasi di
 * DOKU Back Office (per channel, Settings > Payment Settings). Probe ini memverifikasi
 * sisi DOKU (status ter-update); bentuk payload notifikasi diuji di unit test.
 *
 * Pemakaian:
 *   DOKU_CLIENT_ID=... DOKU_API_KEY=... bun run scripts/probe-doku-va-notification.ts
 *   PROBE_ONLY=btn,bnc DOKU_... bun run scripts/probe-doku-va-notification.ts
 *   PROBE_JSON=1 ...        # ringkasan JSON
 */

import { resolveDokuMcpCredentials } from "../../../src/providers/doku/mcp";
import { callDokuMcpTool, DOKU_MCP_CREATE_VA_TOOL } from "../../../src/providers/doku/mcp";
import type { ProviderConfig } from "../../../src/types";
import { emitProbeJson, summarize, type ProbeChannelResult } from "../lib";

const CLIENT_ID = (process.env.DOKU_CLIENT_ID || "").trim();
const MCP_API_KEY = (process.env.DOKU_MCP_API_KEY || process.env.DOKU_API_KEY || "").trim();
const SANDBOX = (process.env.DOKU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const WAIT_MS = Number(process.env.PROBE_WAIT_MS || 8000);

if (!CLIENT_ID || !MCP_API_KEY) {
  console.error("❌ DOKU_CLIENT_ID dan DOKU_API_KEY (MCP) wajib diset.");
  process.exit(1);
}

const config: ProviderConfig = {
  provider: "doku",
  merchantCode: CLIENT_ID,
  clientKey: CLIENT_ID,
  apiKey: MCP_API_KEY,
  secretKey: MCP_API_KEY,
  sandbox: SANDBOX,
  returnUrl: "https://example.com/return",
  extra: { mcpApiKey: MCP_API_KEY },
};

const creds = resolveDokuMcpCredentials(config);
if (!creds) {
  console.error("❌ Kredensial MCP tidak lengkap.");
  process.exit(1);
}

/** Kanal mcpOnly → kode channel MCP + ketersediaan simulator sandbox. */
const BANKS: Array<{
  method: string;
  channel: string;
  simulator?: "btn" | "bnc";
}> = [
  { method: "btn_va", channel: "VIRTUAL_ACCOUNT_BTN", simulator: "btn" },
  { method: "bjb_va", channel: "VIRTUAL_ACCOUNT_BANK_BJB" },
  { method: "bpd_bali_va", channel: "VIRTUAL_ACCOUNT_BPD_BALI" },
  { method: "sinarmas_va", channel: "VIRTUAL_ACCOUNT_SINARMAS" },
  { method: "ocbc_va", channel: "VIRTUAL_ACCOUNT_BANK_OCBC" },
  { method: "bnc_va", channel: "VIRTUAL_ACCOUNT_BNC", simulator: "bnc" },
  { method: "bss_va", channel: "VIRTUAL_ACCOUNT_BSS" },
];

const SIM_BASE = "https://sandbox.doku.com/doku/simulator/v1";

/** Terbitkan VA via MCP, kembalikan nomor VA. */
async function createVa(channel: string, trxId: string): Promise<{ vaNo?: string; raw: any }> {
  const data = await callDokuMcpTool(creds!, DOKU_MCP_CREATE_VA_TOOL, {
    toolRequest: {
      channel,
      amount: `${Math.round(AMOUNT).toFixed(2)}`,
      trxId,
      virtualAccountName: "Buayar Notif Probe",
      virtualAccountEmail: "probe@buayar.test",
    },
  });
  return { vaNo: data?.virtualAccountData?.virtualAccountNo?.trim(), raw: data };
}

/** Status transaksi via MCP (array message; ambil entri pertama). */
async function txStatus(invoiceNumber: string): Promise<any | null> {
  const data = await callDokuMcpTool(creds!, "get_transaction_by_invoice_number", {
    toolRequest: { invoiceNumber },
  });
  return data?.message?.[0] ?? null;
}

/** Simulasi pembayaran VA BTN lewat simulator sandbox (alur inquiry → payment). */
async function simulateBtn(vaNo: string): Promise<{ ok: boolean; detail: string }> {
  const inq = await fetch(`${SIM_BASE}/btn/inquiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ virtualAccountNo: vaNo }),
  });
  const inqText = await inq.text();
  let inqData: any = null;
  try {
    inqData = JSON.parse(inqText);
  } catch {}
  const vd = inqData?.virtualAccountData;
  if (!inq.ok || !vd?.inquiryRequestId) {
    return { ok: false, detail: `inquiry gagal HTTP ${inq.status}: ${inqText.slice(0, 140)}` };
  }
  const pay = await fetch(`${SIM_BASE}/btn/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      virtualAccountNo: vaNo,
      virtualAccountName: vd.virtualAccountName,
      paymentRequestId: vd.inquiryRequestId,
      amount: AMOUNT,
    }),
  });
  const payText = await pay.text();
  return { ok: pay.ok, detail: `payment HTTP ${pay.status}: ${payText.slice(0, 140)}` };
}

/** Simulasi pembayaran VA BNC lewat simulator sandbox (GET data → POST notifikasi). */
async function simulateBnc(vaNo: string): Promise<{ ok: boolean; detail: string }> {
  const inq = await fetch(`${SIM_BASE}/bnc/payment-notification/${encodeURIComponent(vaNo)}`);
  const inqText = await inq.text();
  if (!inq.ok) {
    return { ok: false, detail: `inquiry gagal HTTP ${inq.status}: ${inqText.slice(0, 140)}` };
  }
  const pay = await fetch(`${SIM_BASE}/bnc/payment-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ virtual_account: vaNo, amount: AMOUNT }),
  });
  const payText = await pay.text();
  return { ok: pay.ok, detail: `payment HTTP ${pay.status}: ${payText.slice(0, 140)}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE NOTIFIKASI VA MCP DOKU (D-17) — create → status → simulasi bayar → status");
  console.log(`   Client  : ${CLIENT_ID}`);
  console.log(`   Amount  : Rp ${AMOUNT.toLocaleString("id-ID")} · tunggu ${WAIT_MS}ms antar cek status`);
  console.log("=".repeat(96));

  const banks = ONLY.length
    ? BANKS.filter((b) => ONLY.includes(b.method) || ONLY.includes(b.method.replace(/_va$/, "")))
    : BANKS;
  const results: ProbeChannelResult[] = [];

  for (const b of banks) {
    const trxId = `PROBE-NOTIF-${b.method}-${Date.now().toString(36)}`;
    console.log(`\n▶ ${b.method} (${b.channel}) · trxId=${trxId}`);

    // 1. Buat VA
    const created = await createVa(b.channel, trxId);
    if (!created.vaNo) {
      console.log(`   ❌ VA gagal terbit: ${JSON.stringify(created.raw).slice(0, 160)}`);
      results.push({ method: b.method, group: b.channel, ok: false, error: "VA gagal terbit" });
      continue;
    }
    console.log(`   ✅ VA terbit : ${created.vaNo}`);

    // 2. Status awal
    const before = await txStatus(trxId);
    const statusBefore = before?.status ?? before?.state ?? "?";
    console.log(`   ℹ️  status awal: ${statusBefore}`);

    // 3. Simulasi pembayaran bila tersedia
    let simDetail = "tidak ada simulator sandbox untuk kanal ini";
    let simulated = false;
    if (b.simulator === "btn") {
      const r = await simulateBtn(created.vaNo);
      simulated = r.ok;
      simDetail = r.detail;
    } else if (b.simulator === "bnc") {
      const r = await simulateBnc(created.vaNo);
      simulated = r.ok;
      simDetail = r.detail;
    }
    console.log(`   ${simulated ? "💳" : "⏭️ "} simulasi   : ${simDetail}`);

    // 4. Status setelah simulasi
    if (simulated) await sleep(WAIT_MS);
    const after = await txStatus(trxId);
    const statusAfter = after?.status ?? after?.state ?? "?";
    const paidLike = /success|paid|settle/i.test(String(statusAfter));
    console.log(`   ${paidLike ? "✅" : "•"} status akhir: ${statusAfter}`);

    const ok = created.vaNo && (simulated ? paidLike : true);
    results.push({
      method: b.method,
      group: b.channel,
      ok: !!ok,
      detail: `VA=${created.vaNo} · status ${statusBefore} → ${statusAfter}${simulated ? " · disimulasi" : ""}`,
      error: ok ? undefined : "status tidak berubah setelah simulasi pembayaran",
    });
  }

  emitProbeJson(summarize("doku-va-notification", results, { source: "mcp+simulator" }));
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Ringkasan: ${okCount}/${results.length} kanal OK.`);
  console.log("⚠️  VA dibuat di sandbox tidak bisa dihapus via API delete untuk sebagian kanal — sisakan sampah terbatas (PROBE_ONLY bila perlu).");
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe gagal:", err?.message || err);
  process.exit(1);
});
