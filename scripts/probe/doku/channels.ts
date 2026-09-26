/**
 * PROBE LIVE DOKU — verifikasi payload per channel (Jokul v2 / non-SNAP).
 *
 * Alur:
 *   1. Jika DOKU MCP dikonfigurasi (`PROBE_MCP=1` + `DOKU_API_KEY`), daftar channel
 *      diambil dari **DOKU MCP Server** (`get_merchant_payment_methods`).
 *      Jika tidak, dipakai katalog statis SDK.
 *   2. Channel yang SUDAH dipetakan di `CANONICAL_TO_DOKU` & non-SNAP diprobe lewat
 *      `DokuProvider.createInvoice()` (payload diaudit via intersept `fetch`).
 *   3. Channel non-SNAP yang BELUM dipetakan (mis. VA bank kecil) diuji sebagai
 *      **endpoint existence probe**: POST minimal ke `/{channel}-virtual-account/
 *      v2/payment-code` memakai signature DOKU. Ini membuktikan apakah bank tersebut
 *      punya endpoint non-SNAP tanpa perlu diubah dulu di peta kanonikal SDK.
 *   4. Kanal `mcpOnly` (BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS — D-16) TIDAK punya
 *      endpoint REST non-SNAP (diverifikasi live: 404 untuk semua varian penamaan).
 *      VA diterbitkan lewat **DOKU MCP Server** `create_virtual_account_payment`
 *      (butuh `PROBE_MCP=1` + `DOKU_API_KEY`).
 *   5. QRIS/DANA/ShopeePay ditandai SNAP-only (memang tidak ada di Jokul Direct).
 *
 * ⚠️  Membuat transaksi sandbox nyata untuk setiap channel yang diterima.
 *
 * Pemakaian:
 *   DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... bun run scripts/probe-doku-channels.ts
 *   PROBE_MCP=1 DOKU_API_KEY=... bun run scripts/probe-doku-channels.ts
 *   PROBE_ONLY=bca_va,btn_va PROBE_AMOUNT=1000 bun run scripts/probe-doku-channels.ts
 *   PROBE_JSON=1 ... bun run scripts/probe-doku-channels.ts        # ringkasan JSON
 */

import { DokuProvider } from "../../../src/providers/doku/provider";
import { generateDokuHeaders } from "../../../src/providers/doku/signature";
import { CANONICAL_TO_DOKU } from "../../../src/core/canonical";
import {
  createDokuMcpVirtualAccount,
  DOKU_MCP_ONLY_VA_CHANNELS,
  fetchDokuMerchantPaymentMethods,
  parseDokuMcpChannels,
  resolveDokuMcpCredentials,
} from "../../../src/providers/doku/mcp";
import type { ProviderConfig } from "../../../src/types";
import { emitProbeJson, summarize, type ProbeChannelResult } from "../lib";

const CLIENT_ID = (process.env.DOKU_CLIENT_ID || process.env.DOKU_MERCHANT_ID || "").trim();
const SECRET_KEY = (process.env.DOKU_SECRET_KEY || process.env.BUAYAR_API_KEY || "").trim();
const MCP_API_KEY = (process.env.DOKU_MCP_API_KEY || process.env.DOKU_API_KEY || "").trim();
const SANDBOX = (process.env.DOKU_SANDBOX ?? process.env.BUAYAR_SANDBOX ?? "true") !== "false";
const AMOUNT = Number(process.env.PROBE_AMOUNT || 10000);
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const MCP_URL = process.env.DOKU_MCP_URL || "";
const USE_MCP = process.env.PROBE_MCP === "1" || process.env.PROBE_MCP === "true";
const RAW = process.env.RAW === "1" || process.env.RAW === "true";
/** JSON tambahan yang digabung ke `providerParams` (untuk menguji varian payload). */
const EXTRA: any = process.env.PROBE_EXTRA_JSON ? JSON.parse(process.env.PROBE_EXTRA_JSON) : {};
const ONLY = (process.env.PROBE_ONLY || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (!CLIENT_ID || !SECRET_KEY) {
  console.error("❌ DOKU_CLIENT_ID dan DOKU_SECRET_KEY wajib diset.");
  console.error("   Contoh: DOKU_CLIENT_ID=BRN-... DOKU_SECRET_KEY=SK-... bun run scripts/probe-doku-channels.ts");
  process.exit(1);
}

const config: ProviderConfig = {
  provider: "doku",
  merchantCode: CLIENT_ID,
  clientKey: CLIENT_ID,
  apiKey: SECRET_KEY,
  secretKey: SECRET_KEY,
  sandbox: SANDBOX,
  returnUrl: "https://example.com/return",
  ...(MCP_API_KEY ? { extra: { mcpApiKey: MCP_API_KEY, ...(MCP_URL ? { mcpUrl: MCP_URL } : {}) } } : {}),
};

const provider = new DokuProvider();
const BASE_URL = SANDBOX ? "https://api-sandbox.doku.com" : "https://api.doku.com";

/** Kanal Direct non-SNAP DOKU (fallback statis bila MCP tidak dipakai). */
const STATIC_CHANNELS: Array<{ method: string; group: string }> = [
  { method: "bca_va", group: "Virtual Account" },
  { method: "mandiri_va", group: "Virtual Account" },
  { method: "bni_va", group: "Virtual Account" },
  { method: "bri_va", group: "Virtual Account" },
  { method: "permata_va", group: "Virtual Account" },
  { method: "cimb_va", group: "Virtual Account" },
  { method: "danamon_va", group: "Virtual Account" },
  { method: "bsi_va", group: "Virtual Account" },
  { method: "btn_va", group: "Virtual Account (via MCP)" },
  { method: "bjb_va", group: "Virtual Account (via MCP)" },
  { method: "bpd_bali_va", group: "Virtual Account (via MCP)" },
  { method: "sinarmas_va", group: "Virtual Account (via MCP)" },
  { method: "ocbc_va", group: "Virtual Account (via MCP)" },
  { method: "bnc_va", group: "Virtual Account (via MCP)" },
  { method: "bss_va", group: "Virtual Account (via MCP)" },
  { method: "qris", group: "QRIS (SNAP only)" },
  { method: "alfamart", group: "Retail / Gerai" },
  { method: "indomaret", group: "Retail / Gerai" },
  { method: "ovo", group: "E-Wallet" },
  { method: "dana", group: "E-Wallet (SNAP only)" },
  { method: "shopeepay", group: "E-Wallet (SNAP only)" },
];

const sent: Array<{ url: string; body: any }> = [];
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  sent.push({ url: String(input), body: init?.body });
  return origFetch(input, init);
}) as typeof fetch;

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: any;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${TIMEOUT_MS}ms (${label})`)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Nama kanal VA Jokul untuk kode MCP (mis. `VIRTUAL_ACCOUNT_CIMB` → `cimb-virtual-account`). */
export function mcpVaChannelName(code: string): string | undefined {
  const m = /^VIRTUAL_ACCOUNT_(.+)$/.exec(String(code || "").toUpperCase());
  if (!m) return undefined;
  let key = m[1].replace(/^BANK_/, "").toLowerCase();
  if (key === "bsi") key = "bsm";
  return `${key.replace(/_/g, "-")}-virtual-account`;
}

function describePayload(body: any): string {
  if (typeof body !== "string") return String(body);
  try {
    const j = JSON.parse(body);
    const bits: string[] = [];
    if (j.order) bits.push(`invoice=${j.order.invoice_number} amount=${j.order.amount}`);
    if (j.virtual_account_info) bits.push(`va_info=${JSON.stringify(j.virtual_account_info)}`);
    if (j.qris_info) bits.push(`qris_info=${JSON.stringify(j.qris_info)}`);
    if (j.online_to_offline_info) bits.push(`o2o_info=${JSON.stringify(j.online_to_offline_info)}`);
    if (j.ovo_info) bits.push(`ovo_info=${JSON.stringify(j.ovo_info)}`);
    return bits.join(" ") || body.slice(0, 140);
  } catch {
    return body.slice(0, 140);
  }
}

function describeResult(res: any): string {
  const bits: string[] = [];
  if (res.vaNumber) bits.push(`VA=${res.vaNumber}${res.vaBank ? ` (${res.vaBank})` : ""}`);
  if (res.paymentCode) bits.push(`Code=${res.paymentCode}`);
  if (res.qrString) bits.push(`QR=${String(res.qrString).slice(0, 24)}…`);
  if (res.paymentUrl) bits.push(`URL=${String(res.paymentUrl).slice(0, 46)}…`);
  if (res.expiresAt) {
    const d = new Date(res.expiresAt);
    bits.push(`exp=${isNaN(d.getTime()) ? String(res.expiresAt) : d.toISOString()}`);
  }
  return bits.join(" | ") || "—";
}

interface ChannelCandidate {
  method: string;
  group: string;
  mode: "sdk" | "snapOnly" | "endpoint" | "mcpOnly" | "unmapped";
  mcpCode?: string;
  channelName?: string;
}

/** Susun daftar kandidat dari MCP (atau katalog statis). */
async function buildCandidates(): Promise<{ candidates: ChannelCandidate[]; source: string; mcpPayload: any }> {
  const mcpCreds = resolveDokuMcpCredentials(config);
  const wantMcp = USE_MCP || (!!mcpCreds && process.env.PROBE_MCP !== "0");

  if (wantMcp && mcpCreds) {
    const payload = await fetchDokuMerchantPaymentMethods(mcpCreds);
    if (payload?.categories) {
      const channels = parseDokuMcpChannels(payload);
      const candidates: ChannelCandidate[] = channels.map((ch) => {
        const mapped = CANONICAL_TO_DOKU[ch.canonical];
        if (mapped && !mapped.snapOnly) {
          return { method: ch.canonical, group: ch.category, mode: "sdk", mcpCode: ch.code };
        }
        if (mapped?.snapOnly) {
          return { method: ch.canonical, group: `${ch.category} (SNAP only)`, mode: "snapOnly", mcpCode: ch.code };
        }
        if (mapped?.mcpOnly) {
          return {
            method: ch.canonical,
            group: `${ch.category} (via MCP)`,
            mode: "mcpOnly",
            mcpCode: DOKU_MCP_ONLY_VA_CHANNELS[ch.canonical] || ch.code,
          };
        }
        const channelName = mcpVaChannelName(ch.code);
        if (channelName) {
          return { method: ch.canonical, group: `${ch.category} (uji endpoint)`, mode: "endpoint", mcpCode: ch.code, channelName };
        }
        return { method: ch.canonical, group: ch.category, mode: "unmapped", mcpCode: ch.code };
      });
      return { candidates, source: "mcp", mcpPayload: payload };
    }
    console.log("   ⚠️  MCP tidak mengembalikan daftar channel — jatuh ke katalog statis.");
  }

  return {
    candidates: STATIC_CHANNELS.map((c) => ({
      method: c.method,
      group: c.group,
      mode: c.group.includes("SNAP only") ? "snapOnly" : c.group.includes("via MCP") ? "mcpOnly" : "sdk",
    })),
    source: "static",
    mcpPayload: null,
  };
}

/** Probe via SDK `createInvoice()` (payload diaudit). */
async function probeSdk(method: string): Promise<{ res: any; payload: any }> {
  const orderId = `PROBE-${method}-${Date.now().toString(36)}`;
  const before = sent.length;
  let res: any;
  try {
    res = await withTimeout(
      provider.createInvoice(
        {
          orderId,
          amount: AMOUNT,
          productDetails: `Probe ${method}`,
          customer: { name: "Buayar Probe", email: "probe@buayar.test", phone: "081234567890" },
          returnUrl: "https://example.com/return",
          paymentMethod: method as any,
          ...(Object.keys(EXTRA).length ? { providerParams: EXTRA } : {}),
        },
        config
      ),
      method
    );
  } catch (e: any) {
    res = { success: false, error: e?.message || String(e) };
  }
  const payload = sent.length > before ? sent[sent.length - 1].body : undefined;
  return { res, payload };
}

/** Terbitkan VA lewat DOKU MCP Server `create_virtual_account_payment` (kanal mcpOnly, D-16). */
async function probeMcpOnly(c: ChannelCandidate): Promise<ProbeChannelResult> {
  const creds = resolveDokuMcpCredentials(config);
  if (!creds || !MCP_API_KEY) {
    return {
      method: c.method,
      group: c.group,
      ok: false,
      expected: false,
      error: `butuh kredensial MCP (PROBE_MCP=1 + DOKU_API_KEY) — kanal mcpOnly tanpa endpoint REST`,
    };
  }
  const orderId = `PROBE-${c.method}-${Date.now().toString(36)}`;
  const before = sent.length;
  try {
    const data = await withTimeout(
      createDokuMcpVirtualAccount(creds, {
        channel: c.mcpCode!,
        amount: AMOUNT,
        trxId: orderId,
        customerName: "Buayar Probe",
        customerEmail: "probe@buayar.test",
      }),
      c.method
    );
    if (!data) return { method: c.method, group: c.group, ok: false, error: "MCP tidak mengembalikan respons" };
    const va = data.virtualAccountData ?? {};
    const code = String(data.responseCode || "");
    const ok = code === "2002700" && !!va.virtualAccountNo;
    const args = sent.length > before ? (JSON.parse(sent[sent.length - 1].body || "{}")?.params?.arguments?.toolRequest ?? null) : null;
    if (RAW && args) console.log(`     mcp   : ${JSON.stringify(args).slice(0, 220)}`);
    return {
      method: c.method,
      group: c.group,
      ok,
      statusCode: ok ? 200 : undefined,
      error: ok ? undefined : `responseCode=${code || "?"} ${data.responseMessage || ""}`.trim(),
      detail: ok
        ? `VA=${va.virtualAccountNo} · exp=${va.expiredDate ?? "?"}${va.additionalInfo?.howToPayPage ? ` · ${va.additionalInfo.howToPayPage}` : ""}`
        : undefined,
    };
  } catch (e: any) {
    return { method: c.method, group: c.group, ok: false, error: e?.message || String(e) };
  }
}

/** Uji keberadaan endpoint VA non-SNAP untuk bank yang belum dipetakan SDK. */
async function probeEndpoint(channelName: string, method: string): Promise<ProbeChannelResult> {
  const orderId = `PROBE-${method}-${Date.now().toString(36)}`;
  const endpoint = `/${channelName}/v2/payment-code`;
  const payload = {
    order: { invoice_number: orderId, amount: AMOUNT },
    virtual_account_info: { expired_time: 60, reusable_status: false },
    customer: { name: "Buayar Probe", email: "probe@buayar.test" },
  };
  try {
    const headers = generateDokuHeaders(CLIENT_ID, SECRET_KEY, endpoint, payload);
    const res = await withTimeout(
      fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(payload),
      }),
      endpoint
    );
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}
    const message = data?.error?.message || data?.message || text.slice(0, 120);
    const missing = /no static resource/i.test(String(message));
    if (res.ok && data && !missing) {
      const va = data.virtual_account_info?.virtual_account_number;
      return { method, ok: true, statusCode: res.status, detail: `endpoint ADA${va ? ` · VA=${va}` : ""}` };
    }
    return {
      method,
      ok: false,
      statusCode: res.status,
      error: missing ? `endpoint TIDAK ADA (${channelName})` : String(message),
    };
  } catch (e: any) {
    return { method, ok: false, error: e?.message || String(e) };
  }
}

async function main() {
  console.log("=".repeat(96));
  console.log("PROBE LIVE DOKU — payload per channel (Jokul v2 / non-SNAP)");
  console.log(`   Client  : ${CLIENT_ID}`);
  console.log(`   Sandbox : ${SANDBOX}`);
  console.log(`   Amount  : Rp ${AMOUNT.toLocaleString("id-ID")}`);
  console.log("=".repeat(96));

  const { candidates: all, source, mcpPayload } = await buildCandidates();
  if (RAW && mcpPayload) console.log(`\n── MCP raw ──\n${JSON.stringify(mcpPayload).slice(0, 2000)}`);
  console.log(`\nSumber daftar channel: ${source === "mcp" ? "LIVE (DOKU MCP)" : "STATIS (katalog SDK)"} — ${all.length} channel`);

  let candidates = all;
  if (ONLY.length) candidates = candidates.filter((c) => ONLY.includes(c.method));
  const counts = {
    sdk: candidates.filter((c) => c.mode === "sdk").length,
    endpoint: candidates.filter((c) => c.mode === "endpoint").length,
    snapOnly: candidates.filter((c) => c.mode === "snapOnly").length,
    mcpOnly: candidates.filter((c) => c.mode === "mcpOnly").length,
    unmapped: candidates.filter((c) => c.mode === "unmapped").length,
  };
  console.log(
    `Akan diprobe: ${candidates.length} (sdk=${counts.sdk}, uji-endpoint=${counts.endpoint}, snap-only=${counts.snapOnly}, via-MCP=${counts.mcpOnly}, belum-dipetakan=${counts.unmapped})${ONLY.length ? ` · filter: ${ONLY.join(",")}` : ""}\n`
  );

  const results: ProbeChannelResult[] = [];

  for (const c of candidates) {
    if (c.mode === "unmapped") {
      results.push({ method: c.method, group: c.group, ok: false, expected: true, error: `belum dipetakan SDK (${c.mcpCode})` });
      console.log(`⚪ ${`${c.group} / ${c.method}`.padEnd(44)} — belum dipetakan SDK (${c.mcpCode})`);
      continue;
    }

    if (c.mode === "snapOnly") {
      const { res } = await probeSdk(c.method);
      const expected = !res.success && /SNAP/i.test(String(res.error || ""));
      results.push({ method: c.method, group: c.group, ok: false, expected, error: res.error });
      console.log(`⏸️  ${`${c.group} / ${c.method}`.padEnd(43)} — ${res.error}`);
      continue;
    }

    if (c.mode === "mcpOnly") {
      const r = await probeMcpOnly(c);
      results.push(r);
      console.log(`${r.ok ? "✅" : "❌"} ${`${c.group} / ${c.method}`.padEnd(43)} (${c.mcpCode})`);
      console.log(`     hasil : ${r.ok ? r.detail : r.error}`);
      continue;
    }

    if (c.mode === "endpoint") {
      const r = await probeEndpoint(c.channelName!, c.method);
      results.push({ ...r, group: c.group });
      console.log(`${r.ok ? "✅" : "❌"} ${`${c.group} / ${c.method}`.padEnd(43)} (${c.channelName})`);
      console.log(`     hasil : ${r.ok ? r.detail : r.error}`);
      continue;
    }

    const { res, payload } = await probeSdk(c.method);
    results.push({
      method: c.method,
      group: c.group,
      ok: !!res.success,
      error: res.success ? undefined : res.error,
      detail: res.success ? describeResult(res) : undefined,
    });
    console.log(`${res.success ? "✅" : "❌"} ${`${c.group} / ${c.method}`.padEnd(43)}`);
    console.log(`     kirim : ${describePayload(payload)}`);
    console.log(`     ${res.success ? "hasil" : "error"} : ${res.success ? describeResult(res) : res.error}`);
    if (!res.success && RAW) console.log(`     raw   : ${JSON.stringify(res.rawResponse)?.slice(0, 300)}`);
  }

  emitProbeJson(summarize("doku", results, { source, sideEffects: results.filter((r) => r.ok).length }));

  const ok = results.filter((r) => r.ok).length;
  const expected = results.filter((r) => !r.ok && r.expected).length;
  console.log(`\n${"=".repeat(96)}`);
  console.log(`Ringkasan: ${ok}/${results.length} diterima · ${expected} dilewati/diharapkan · ${results.length - ok - expected} gagal.`);
  const failed = results.filter((r) => !r.ok && !r.expected);
  if (failed.length) {
    console.log("Gagal:");
    for (const r of failed) console.log(`  • ${r.method}: ${r.error}`);
  }
  console.log(`\n⚠️  ${ok} transaksi sandbox dibuat (DOKU tidak menyediakan pembatalan seragam).`);
  console.log("=".repeat(96));
}

main().catch((err) => {
  console.error("❌ Probe gagal:", err?.message || err);
  process.exit(1);
});
