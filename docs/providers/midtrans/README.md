# Midtrans — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** (Snap Invoice, Core API Direct BCA VA, Direct QRIS, checkTransaction, 16 probe channels) · Audit fidelity: item **M-1 … M-15** — lihat tabel di [`docs/REVIEW-PG-FIDELITY.md` §1](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/midtrans/provider.ts` | Provider utama: Snap & Core API legacy, probe per-channel, petunjuk error (M-15) |
| `src/providers/midtrans/snap.ts` | Adapter **BI-SNAP Core API** (M-5…M-12): token, signature, QRIS, VA, notifikasi |
| `src/providers/midtrans/charge.ts` | Peta kanonikal → `enabled_payments` Snap (M-1), acquirer QRIS (M-2) |
| `src/providers/midtrans/methods.ts` | Payload probe per-channel (M-3) + `hintMidtransProbeError` (M-15) |

## Operasi

- `createInvoice` — Snap `enabled_payments` valid; QRIS → acquirer `airpay shopee` (M-1/M-2); `phone` dibersihkan (M-4). Tanpa kredensial SNAP → tetap Core API legacy (M-12).
- BI-SNAP (opt-in, `extra.snapCredentials`): QRIS via `/v1.0/qr/qr-mpm-generate`, VA via `/v1.0/transfer-va/create-va` (wajib `partnerServiceId`+`customerNo`, gagal cepat bila kurang — M-9).
- `checkTransaction` — SNAP: `qr-mpm-query` / `transfer-va/status` dengan status numerik 00/03/05/06 → kanonikal (M-6/M-10). Legacy: `GET /v2/{id}/status`.
- `verifyCallback` — legacy: `signature_key` SHA512. SNAP: notifikasi asimetris Midtrans public key, path per-jenis `/v1.0/qr/qr-mpm-notify` & `/v1.0/debit/notify` (M-11). Fail-closed.

## Kredensial (`.env`)

```env
MIDTRANS_SERVER_KEY=Mid-server-...      # legacy & probe
MIDTRANS_CLIENT_KEY=Mid-client-...
# BI-SNAP (opsional): extra.snapCredentials { clientId, privateKey/privateKeyId, publicKey, partnerServiceId, merchantId }
```

## Signature

- Legacy: `SHA512(order_id + status_code + gross_amount + serverKey)`.
- SNAP access token: `SHA256withRSA(clientId|timestamp)`.
- SNAP transaksi: `HMAC_SHA512(POST:path:token:sha256(body):timestamp)` — rumus ASPI (M-7).
- Access token B2B di-cache 900 detik (M-8).

## Endpoint

- Sandbox: `api.sandbox.midtrans.com` (Snap/Core), `app.sandbox.midtrans.com` (BI-SNAP `/v1.0`).

## Verifikasi

- Probe per-channel: `bun run probe midtrans` (`scripts/probe/midtrans/channels.ts`) — **16/19 kanal aktif**; `ovo/dana/linkaja` menunggu aktivasi channel di dashboard Midtrans.
- Test regresi: `tests/pg-fidelity.test.ts` (blok "Midtrans" & "Midtrans BI-SNAP").
