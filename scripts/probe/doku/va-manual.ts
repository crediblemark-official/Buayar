/**
 * PROBE UJI MANUAL VA DOKU — persiapan pembayaran 5 bank tanpa simulator kanal
 * (BJB, BPD Bali, Sinarmas, OCBC, BSS) lewat kanal bank asli.
 *
 * Yang dilakukan otomatis:
 *   1. Terbitkan VA via DOKU MCP `create_virtual_account_payment` (nominal kecil).
 *   2. Ambil `howToPayPage` (panduan pembayaran per bank) dari respons MCP.
 *   3. Tampilkan instruksi transfer + nomor VA + masa berlaku.
 *   4. (opsional) Polling status via MCP `get_transaction_by_invoice_number`
 *      sampai VA terbayar (SUCCESS) atau batas waktu habis.
 *
 * Pemakaian:
 *   DOKU_CLIENT_ID=... DOKU_API_KEY=... bun run scripts/probe-doku-va-manual.ts
 *   PROBE_ONLY=bjb,bss ... bun run scripts/probe-doku-va-manual.ts
 *   PROBE_AMOUNT=15000 PROBE_WAIT_MINUTES=30 ... bun run scripts/probe-doku-va-manual.ts
 *   PROBE_JSON=1 ...        # ringkasan JSON di akhir
 *
 * Verifikasi notifikasi (sisi webhook) terpisah:
 *   DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... bun run scripts/receive-doku-notification.ts
 */

import { resolveDokuMcpCredentials, callDokuMcpTool, DOKU_MCP_CREATE_VA_TOOL } from "../../../src/providers/doku/mcp";
import type { ProviderConfig } from "../../../src/types";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { emitProbeJson, summarize, type ProbeChannelResult } from "../lib";

const CLIENT_ID = (process.env.DOKU_CLIENT_ID || "").trim();
const MCP_API_KEY = (process.env.DOKU_MCP_API_KEY || process.env.DOKU_API_KEY || "").trim();
const SANDBOX = (process.env.DOKU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const WAIT_MINUTES = Number(process.env.PROBE_WAIT_MINUTES || 15);
const POLL_SECONDS = Number(process.env.PROBE_POLL_SECONDS || 30);
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const RAW = process.env.RAW === "1" || process.env.RAW === "true";
/** RESUME=1 → jangan buat VA baru; polling lanjutan dari state file sesi sebelumnya. */
const RESUME = process.env.RESUME === "1" || process.env.RESUME === "true";
const STATE_FILE = process.env.PROBE_STATE_FILE || "doku-va-manual-state.json";

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

/** 5 bank mcpOnly yang tidak punya simulator kanal di sandbox DOKU. */
const BANKS: Array<{ method: string; channel: string; bank: string }> = [
  { method: "bjb_va", channel: "VIRTUAL_ACCOUNT_BANK_BJB", bank: "Bank BJB" },
  { method: "bpd_bali_va", channel: "VIRTUAL_ACCOUNT_BPD_BALI", bank: "BPD Bali" },
  { method: "sinarmas_va", channel: "VIRTUAL_ACCOUNT_SINARMAS", bank: "Bank Sinarmas" },
  { method: "ocbc_va", channel: "VIRTUAL_ACCOUNT_BANK_OCBC", bank: "OCBC" },
  { method: "bss_va", channel: "VIRTUAL_ACCOUNT_BSS", bank: "Bank Sahabat Sampoerna" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function createVa(channel: string, trxId: string): Promise<any | null> {
  return callDokuMcpTool(creds!, DOKU_MCP_CREATE_VA_TOOL, {
    toolRequest: {
      channel,
      amount: `${Math.round(AMOUNT).toFixed(2)}`,
      trxId,
      virtualAccountName: "Buayar Manual Probe",
      virtualAccountEmail: "probe@buayar.test",
    },
  });
}

async function txStatus(invoiceNumber: string): Promise<any | null> {
  const data = await callDokuMcpTool(creds!, "get_transaction_by_invoice_number", {
    toolRequest: { invoiceNumber },
  });
  return data?.message?.[0] ?? null;
}

async function main() {
  const trxIds: Record<string, string> = {};
  const results: ProbeChannelResult[] = [];
  type IssuedVa = { method: string; bank: string; vaNo: string; trxId: string; howTo: string; expired: string };
  const issued: IssuedVa[] = [];

  console.log("=".repeat(96));
  console.log("UJI MANUAL VA DOKU — 5 bank tanpa simulator kanal (bayar lewat kanal bank asli)");
  console.log(`   Client  : ${CLIENT_ID} · Amount: Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log("=".repeat(96));

  // 1. Terbitkan VA (atau resume sesi sebelumnya)
  if (RESUME && existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    for (const v of (state.issued ?? []) as IssuedVa[]) {
      issued.push(v);
      trxIds[v.method] = v.trxId;
      results.push({ method: v.method, group: v.bank, ok: true, detail: `VA=${v.vaNo} · polling lanjutan` });
    }
    console.log(`↩️  RESUME: polling lanjutan ${issued.length} VA dari ${STATE_FILE} (tidak membuat VA baru)`);
  } else {
    for (const b of BANKS) {
      if (ONLY.length && !ONLY.includes(b.method) && !ONLY.includes(b.method.replace(/_va$/, ""))) continue;
      const trxId = `PROBE-MANUAL-${b.method}-${Date.now().toString(36)}`;
      trxIds[b.method] = trxId;
      const data = await createVa(b.channel, trxId);
      const vd = data?.virtualAccountData ?? {};
      const vaNo = String(vd.virtualAccountNo || "").trim();
      const code = String(data?.responseCode || "");
      if (code !== "2002700" || !vaNo) {
        console.log(`❌ ${b.bank}: gagal terbit (${code || "?"}) ${String(data?.responseMessage || "").slice(0, 80)}`);
        results.push({ method: b.method, group: b.channel, ok: false, error: `VA gagal terbit (${code})` });
        continue;
      }
      issued.push({
        method: b.method,
        bank: b.bank,
        vaNo,
        trxId,
        howTo: String(vd.additionalInfo?.howToPayPage || ""),
        expired: String(vd.expiredDate || "?"),
      });
      results.push({ method: b.method, group: b.channel, ok: true, detail: `VA=${vaNo} · status PENDING (menunggu bayar)` });
      if (RAW) console.log(`   raw: ${JSON.stringify(data).slice(0, 240)}`);
    }
    writeFileSync(STATE_FILE, JSON.stringify({ issued }, null, 2));
    console.log(`💾 State sesi disimpan ke ${STATE_FILE} (RESUME=1 untuk polling lanjutan)`);
  }

  // 2. Instruksi pembayaran per bank
  console.log(`\n${"─".repeat(96)}\nINSTRUKSI PEMBAYARAN (lakukan lewat m-banking/atm/kanal bank asli):\n`);
  for (const v of issued) {
    console.log(`▶ ${v.bank} (${v.method})`);
    console.log(`   VA          : ${v.vaNo}`);
    console.log(`   Nominal     : Rp ${AMOUNT.toLocaleString("id-ID")} (harus PERSIS)`);
    console.log(`   Berlaku     : ${v.expired}`);
    console.log(`   trxId       : ${v.trxId}`);
    if (v.howTo) console.log(`   Panduan     : ${v.howTo}`);
    console.log("");
  }

  // 3. Polling status
  const deadline = Date.now() + WAIT_MINUTES * 60_000;
  const pending = new Set(issued.map((v) => v.method));
  console.log(`${"─".repeat(96)}`);
  console.log(`Polling status tiap ${POLL_SECONDS}s selama maks ${WAIT_MINUTES} menit... (Ctrl-C untuk berhenti)\n`);
  while (pending.size > 0 && Date.now() < deadline) {
    for (const m of [...pending]) {
      const st = await txStatus(trxIds[m]);
      const status = String(st?.status ?? st?.state ?? "?").toUpperCase();
      if (/SUCCESS|PAID|SETTLE/.test(status)) {
        console.log(`✅ ${m}: ${status} — VA TERBAYAR (end-to-end terbukti).`);
        const r = results.find((x) => x.method === m);
        if (r) {
          r.ok = true;
          r.detail = `VA terbayar — status ${status} (e2e)`;
        }
        pending.delete(m);
      } else {
        console.log(`• ${m}: ${status}`);
      }
    }
    if (pending.size === 0) break;
    await sleep(POLL_SECONDS * 1000);
    console.log(`   … (${Math.round((deadline - Date.now()) / 60000)} menit tersisa)`);
  }

  for (const m of pending) {
    const r = results.find((x) => x.method === m);
    if (r && r.ok) {
      r.ok = false;
      r.error = `belum terbayar dalam ${WAIT_MINUTES} menit (status masih PENDING)`;
    }
  }

  emitProbeJson(summarize("doku-va-manual", results, { source: "mcp", sideEffects: issued.length }));
  const paid = results.filter((r) => r.ok && /terbayar/i.test(r.detail || "")).length;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Ringkasan: ${issued.length} VA terbit · ${paid} terbayar · ${pending.size} masih PENDING.`);
  if (pending.size > 0) {
    console.log("   Jalankan ulang skrip ini dengan PROBE_ONLY=<bank> untuk polling lanjutan, atau");
    console.log("   cek manual: MCP get_transaction_by_invoice_number / dashboard DOKU.");
  }
  console.log("⚠️  Notifikasi webhook diverifikasi terpisah: scripts/receive-doku-notification.ts");
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe gagal:", err?.message || err);
  process.exit(1);
});
