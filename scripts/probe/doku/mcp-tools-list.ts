/**
 * Introspeksi DOKU MCP Server — daftar lengkap tool (JSON-RPC tools/list).
 * Pemakaian: DOKU_CLIENT_ID=... DOKU_API_KEY=... bun run scripts/mcp-tools-list.ts
 */

const CLIENT_ID = process.env.DOKU_CLIENT_ID || "";
const API_KEY = process.env.DOKU_API_KEY || "";
const MCP_URL = process.env.DOKU_MCP_URL || "https://api-sandbox.doku.com/doku-mcp-server/mcp";

if (!CLIENT_ID || !API_KEY) {
  console.error("❌ DOKU_CLIENT_ID dan DOKU_API_KEY wajib diset.");
  process.exit(1);
}

const res = await fetch(MCP_URL, {
  method: "POST",
  headers: {
    "Client-Id": CLIENT_ID,
    Authorization: "Basic " + Buffer.from(API_KEY + ":").toString("base64"),
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
});

const json: any = await res.json();
const tools = json?.result?.tools;
if (!Array.isArray(tools)) {
  console.error("❌ Tidak ada tools:", JSON.stringify(json).slice(0, 400));
  process.exit(1);
}

console.log(`Total tool: ${tools.length}\n`);
const focus = (process.env.MCP_FOCUS || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const t of tools) {
  console.log(`• ${t.name}`);
  if (t.description) console.log(`  ${String(t.description).replace(/\s+/g, " ").slice(0, 160)}`);
  if (focus.includes(t.name) && t.inputSchema) {
    console.log(`  inputSchema: ${JSON.stringify(t.inputSchema)}`);
  }
}
