import type { PaymentMethod, ProviderConfig } from "../../types";

/**
 * Klien ringan untuk **DOKU MCP Server**.
 *
 * DOKU tidak menyediakan REST API daftar channel, tetapi MCP Server-nya mengekspos
 * tool `get_merchant_payment_methods` yang mengembalikan channel yang benar-benar
 * terdaftar/aktif untuk akun merchant. Modul ini dipakai oleh `DokuProvider.getPaymentMethods`
 * sebagai sumber **live** (dengan fallback ke katalog statis bila kredensial MCP tidak ada).
 *
 * Transport: JSON-RPC 2.0 `tools/call` via HTTP POST, auth `Client-Id` + `Basic <apiKey>:`.
 */

export const DOKU_MCP_URLS = {
  sandbox: "https://api-sandbox.doku.com/doku-mcp-server/mcp",
  production: "https://api.doku.com/doku-mcp-server/mcp",
} as const;

export const DOKU_MCP_TOOL = "get_merchant_payment_methods";

/** Tool MCP untuk membuat transaksi VA terpadu (routing per `channel`, respons BI-SNAP VA). */
export const DOKU_MCP_CREATE_VA_TOOL = "create_virtual_account_payment";
/** Tool MCP untuk mengubah VA terpadu. */
export const DOKU_MCP_UPDATE_VA_TOOL = "update_virtual_account_payment";
/** Tool MCP untuk menghapus/membatalkan VA terpadu. */
export const DOKU_MCP_DELETE_VA_TOOL = "delete_virtual_account_payment";

export interface DokuMcpCredentials {
  clientId: string;
  /** API Key "General" DOKU (mis. `doku_key_sandbox_...`), bukan Secret Key `SK-...`. */
  apiKey: string;
  url: string;
  timeoutMs: number;
}

/**
 * Resolusi kredensial MCP dari config. `extra.mcpApiKey` / `extra.dokuApiKey`
 * (diisi otomatis dari `DOKU_MCP_API_KEY`/`DOKU_API_KEY` oleh `resolveConfigFromEnv`).
 */
export function resolveDokuMcpCredentials(config: ProviderConfig): DokuMcpCredentials | undefined {
  const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
  const apiKey = String(config.extra?.mcpApiKey || config.extra?.dokuApiKey || "");
  if (!clientId || !apiKey) return undefined;
  const url =
    config.extra?.mcpUrl ||
    (config.sandbox ? DOKU_MCP_URLS.sandbox : DOKU_MCP_URLS.production);
  const timeoutMs = Number(config.extra?.mcpTimeoutMs) || 10000;
  return { clientId, apiKey, url, timeoutMs };
}

export function isDokuMcpConfigured(config: ProviderConfig): boolean {
  return resolveDokuMcpCredentials(config) !== undefined;
}

/**
 * Kanal VA yang **tidak punya endpoint REST non-SNAP** (`/{bank}-virtual-account` → 404,
 * diverifikasi live 2026-09-26) tetapi **bisa diterbitkan** lewat layanan VA terpadu DOKU
 * (di bawah kapnya BI-SNAP VA dengan BIN aggregator merchant) via tool MCP
 * `create_virtual_account_payment` dengan parameter `channel` (D-16).
 * Nilai = kode channel MCP resmi untuk parameter `channel`.
 */
export const DOKU_MCP_ONLY_VA_CHANNELS: Record<string, string> = {
  bpd_bali_va: "VIRTUAL_ACCOUNT_BPD_BALI",
  sinarmas_va: "VIRTUAL_ACCOUNT_SINARMAS",
  ocbc_va: "VIRTUAL_ACCOUNT_BANK_OCBC",
  bnc_va: "VIRTUAL_ACCOUNT_BNC",
  bss_va: "VIRTUAL_ACCOUNT_BSS",
  btn_va: "VIRTUAL_ACCOUNT_BTN",
  bjb_va: "VIRTUAL_ACCOUNT_BANK_BJB",
};

/** Peta kode channel MCP DOKU → kode kanonikal Buayar. */
const MCP_TO_CANONICAL: Record<string, string> = {
  VIRTUAL_ACCOUNT_BCA: "bca_va",
  VIRTUAL_ACCOUNT_BANK_MANDIRI: "mandiri_va",
  VIRTUAL_ACCOUNT_BNI: "bni_va",
  VIRTUAL_ACCOUNT_BRI: "bri_va",
  VIRTUAL_ACCOUNT_BSI: "bsi_va",
  VIRTUAL_ACCOUNT_BANK_PERMATA: "permata_va",
  VIRTUAL_ACCOUNT_BANK_CIMB: "cimb_va",
  VIRTUAL_ACCOUNT_BANK_DANAMON: "danamon_va",
  VIRTUAL_ACCOUNT_BTN: "btn_va",
  VIRTUAL_ACCOUNT_BANK_BJB: "bjb_va",
  VIRTUAL_ACCOUNT_BPD_BALI: "bpd_bali_va",
  VIRTUAL_ACCOUNT_SINARMAS: "sinarmas_va",
  VIRTUAL_ACCOUNT_BANK_OCBC: "ocbc_va",
  VIRTUAL_ACCOUNT_MAYBANK: "maybank_va",
  VIRTUAL_ACCOUNT_DOKU: "doku_va",
  VIRTUAL_ACCOUNT_BNC: "bnc_va",
  VIRTUAL_ACCOUNT_BSS: "bss_va",
  ONLINE_TO_OFFLINE_ALFA: "alfamart",
  ONLINE_TO_OFFLINE_ALFAMART: "alfamart",
  ONLINE_TO_OFFLINE_INDOMARET: "indomaret",
  QRIS: "qris",
  CREDIT_CARD: "credit_card",
  EMONEY_OVO: "ovo",
  EMONEY_DANA: "dana",
  EMONEY_SHOPEE_PAY: "shopeepay",
  EMONEY_SHOPEEPAY: "shopeepay",
  EMONEY_LINKAJA: "linkaja",
  EMONEY_ISAKU: "isaku",
  EMONEY_DOKU: "doku_ewallet",
  PEER_TO_PEER_KREDIVO: "kredivo",
  PEER_TO_PEER_AKULAKU: "akulaku",
  PEER_TO_PEER_INDODANA: "indodana",
  PEER_TO_PEER_BRI_CERIA: "bri_ceria",
  DOKU_CUSTOMER_FORM_PAYMENT_LINK: "payment_link",
};

/** Kode kanonikal untuk satu kode channel MCP (dengan fallback pola `<bank>_va`). */
export function mapDokuMcpChannelCode(code: string): string {
  const upper = String(code || "").toUpperCase().trim();
  if (MCP_TO_CANONICAL[upper]) return MCP_TO_CANONICAL[upper];
  const va = /^VIRTUAL_ACCOUNT_(.+)$/.exec(upper);
  if (va) {
    const bank = va[1].replace(/^BANK_/, "").toLowerCase();
    return `${bank}_va`;
  }
  return upper.toLowerCase();
}

/** Kategori kanonikal Buayar dari nama kategori MCP DOKU. */
export function mapDokuMcpCategory(category: string): PaymentMethod["category"] {
  const c = String(category || "").toLowerCase();
  if (c.includes("virtual account")) return "Virtual Account";
  if (c.includes("qr")) return "QRIS";
  if (c.includes("wallet") || c.includes("money")) return "E-Wallet";
  if (c.includes("store") || c.includes("offline")) return "Retail / Gerai";
  if (c.includes("credit")) return "Kartu Kredit";
  if (c.includes("pay later") || c.includes("paylater") || c.includes("installment")) return "Paylater / Cicilan";
  return "Lainnya";
}

export interface DokuMcpChannel {
  /** Kode channel mentah MCP (mis. `VIRTUAL_ACCOUNT_BTN`). */
  code: string;
  canonical: string;
  category: PaymentMethod["category"];
  categoryRaw: string;
}

/** Ubah payload `get_merchant_payment_methods` menjadi daftar channel yang ternormalisasi. */
export function parseDokuMcpChannels(payload: any): DokuMcpChannel[] {
  const data = typeof payload === "string" ? safeJson(payload) : payload;
  const categories = data?.categories;
  if (!categories || typeof categories !== "object") return [];

  const out: DokuMcpChannel[] = [];
  for (const [categoryRaw, items] of Object.entries(categories)) {
    const list = Array.isArray(items) ? items : [];
    for (const item of list) {
      const code =
        typeof item === "string"
          ? item
          : String((item as any)?.channel || (item as any)?.channel_code || (item as any)?.code || "");
      if (!code) continue;
      out.push({
        code,
        canonical: mapDokuMcpChannelCode(code),
        category: mapDokuMcpCategory(categoryRaw),
        categoryRaw,
      });
    }
  }
  return out;
}

/** Bangun `PaymentMethod[]` siap-render dari payload MCP. */
export function buildDokuMcpMethods(payload: any): PaymentMethod[] {
  return parseDokuMcpChannels(payload).map((ch) => ({
    paymentMethod: ch.canonical,
    code: ch.canonical,
    paymentName: humanizeDokuChannelName(ch.code, ch.canonical),
    paymentImage: dokuChannelImage(ch.canonical),
    totalFee: "",
    category: ch.category,
    extra: { mcpCode: ch.code, categoryRaw: ch.categoryRaw },
  }));
}

function humanizeDokuChannelName(code: string, canonical: string): string {
  if (canonical.endsWith("_va")) {
    const bank = canonical.slice(0, -3).replace(/_/g, " ");
    return `${bank.toUpperCase()} Virtual Account`;
  }
  const words = code
    .replace(/^(VIRTUAL_ACCOUNT_|EMONEY_|PEER_TO_PEER_|ONLINE_TO_OFFLINE_)/, "")
    .replace(/_/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function dokuChannelImage(canonical: string): string {
  const key = canonical.endsWith("_va") ? canonical.slice(0, -3) : canonical;
  return `https://sandbox.doku.com/jokul/assets/images/${key}.png`;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Ekstrak objek hasil dari respons MCP (JSON-RPC, termasuk `content[0].text`). */
function extractMcpResult(json: any): any | null {
  const content = json?.result?.content;
  if (Array.isArray(content) && content[0]?.text) {
    return safeJson(content[0].text) ?? content[0].text;
  }
  return json?.result ?? null;
}

/**
 * Panggil tool MCP DOKU generik (`tools/call`). Mengembalikan objek hasil (hasil parse
 * `result.content[0].text`) atau `null` bila gagal.
 */
export async function callDokuMcpTool(
  creds: DokuMcpCredentials,
  tool: string,
  args: Record<string, any> = {}
): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), creds.timeoutMs);
  try {
    const res = await fetch(creds.url, {
      method: "POST",
      headers: {
        "Client-Id": creds.clientId,
        Authorization: "Basic " + base64(`${creds.apiKey}:`),
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    if (!json || json.error) return null;
    return extractMcpResult(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Panggil `get_merchant_payment_methods` di DOKU MCP Server.
 * Mengembalikan payload mentah (objek `{ totalChannels, totalCategories, categories }`)
 * atau `null` bila gagal/tidak dikonfigurasi.
 */
export async function fetchDokuMerchantPaymentMethods(
  creds: DokuMcpCredentials
): Promise<any | null> {
  return callDokuMcpTool(creds, DOKU_MCP_TOOL);
}

/**
 * Terbitkan VA terpadu DOKU via MCP untuk kanal yang tidak punya endpoint REST non-SNAP
 * (BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS — lihat `DOKU_MCP_ONLY_VA_CHANNELS`, D-16).
 * Respons berbentuk BI-SNAP VA (`virtualAccountData` + `responseCode`).
 */
export async function createDokuMcpVirtualAccount(
  creds: DokuMcpCredentials,
  params: {
    channel: string;
    amount: number;
    trxId: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    expiredDate?: string;
  }
): Promise<any | null> {
  const toolRequest: Record<string, any> = {
    channel: params.channel,
    amount: `${Math.round(params.amount).toFixed(2)}`,
    trxId: params.trxId,
    virtualAccountName: params.customerName || "Customer",
  };
  if (params.customerEmail) toolRequest.virtualAccountEmail = params.customerEmail;
  if (params.customerPhone) toolRequest.virtualAccountPhone = params.customerPhone;
  if (params.expiredDate) toolRequest.expiredDate = params.expiredDate;
  return callDokuMcpTool(creds, DOKU_MCP_CREATE_VA_TOOL, { toolRequest });
}

function base64(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value).toString("base64");
  // Fallback runtime non-Node (edge/browser).
  return btoa(value);
}
