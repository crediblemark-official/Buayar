# DOKU (Jokul) — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** (Jokul Checkout v2, Direct VA BCA/Mandiri/BNI/BSI/Danamon/Permata, checkTransaction) · Audit fidelity paling dalam: item **D-1 … D-17** — lihat [`docs/REVIEW-PG-FIDELITY.md` §3](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/doku/provider.ts` | Provider utama: Jokul Direct (non-SNAP) + SNAP — VA (17 bank), cstore, e-wallet, `checkTransaction`, `verifyCallback` (SNAP & non-SNAP, fail-closed) |
| `src/providers/doku/signature.ts` | Header request (`Client-Id`, `Request-Id`, `Request-Timestamp`, `Signature: HMACSHA256`) + verifikasi webhook non-SNAP (D-6, raw-body digest) |
| `src/providers/doku/snap.ts` | Verifikasi webhook SNAP (`X-SIGNATURE` HMAC-SHA512, AccessToken kosong) + petunjuk error SNAP |
| `src/providers/doku/mcp.ts` | Klien **DOKU MCP Server** (D-14/D-15/D-16): daftar channel live, create/update/delete VA terpadu |

## Operasi

- `createInvoice` — non-SNAP: endpoint per bank (`<bank>-virtual-account`), BSI pakai `bsm-` (D-8), Permata `ref_info` (D-10), BNI unique ref ≤13 alfanumerik (D-11). SNAP-only (QRIS/DANA/ShopeePay) ditolak bila mode non-SNAP (D-4/D-9). Kanal `mcpOnly` (BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS) dirutekan ke MCP `create_virtual_account_payment` (D-16).
- `updateVirtualAccount` / `deleteVirtualAccount` — REST per bank, atau tool MCP untuk kanal `mcpOnly`.
- `checkTransaction` — non-SNAP `GET /orders/v1/status/{id}`; SNAP query per jenis (D-5). `expiresAt` dari `expired_date` compact `yyyyMMddHHmmss` di-parse benar (D-12).
- `verifyCallback` — dua format: SNAP VA (`trxId`, `paidAmount`, HMAC-SHA512) dan non-SNAP (`transaction.status`, `Signature: HMACSHA256=...`). Keduanya fail-closed; format SNAP VA berlaku untuk seluruh 17 bank VA termasuk kanal mcpOnly (D-17).
- `getPaymentMethods` — **MCP-first**: `source: "mcp"` (live) bila MCP sukses, fallback katalog statis (D-15).

## Kredensial (`.env`)

```env
DOKU_CLIENT_ID=BRN-...
DOKU_SECRET_KEY=SK-...
# Opsional (MCP — API Key "General", berbeda dari Secret Key):
DOKU_MCP_API_KEY=doku_key_sandbox_...
# Mode SNAP: extra.snap = true | dokuMode = "snap" | clientId berawalan "doku"
```

## Catatan desain penting

- **Tidak ada endpoint REST non-SNAP** untuk BTN/BJB/BPD Bali/Sinarmas/OCBC/BNC/BSS (semua varian `<bank>-virtual-account` → 404 live). VA mereka hanya lewat layanan VA terpadu via MCP — flag `mcpOnly` di `CANONICAL_TO_DOKU`, kode channel di `DOKU_MCP_ONLY_VA_CHANNELS` (D-16).
- Notifikasi URL dikonfigurasi per channel di **DOKU Back Office** (tidak bisa via API).
- Simulator sandbox hanya punya kanal BTN & BNC — pembayaran 5 bank lain diuji manual lewat kanal bank asli.

## Verifikasi

- `bun run probe doku` — probe per-channel MCP-driven (mode: sdk / mcpOnly / snapOnly / endpoint).
- E2E notifikasi: `scripts/probe/doku/va-notification.ts` (BTN & BNC terbayar `PENDING → SUCCESS` live).
- Uji manual 5 bank: `scripts/probe/doku/va-manual.ts` (RESUME=1 untuk polling lanjutan).
- Receiver webhook: `scripts/probe/doku/notification-receiver.ts` (+ `--selftest`, tunnel: `tunnel-receiver.sh`).
- Introspeksi MCP: `scripts/probe/doku/mcp-tools-list.ts` (35 tool).
