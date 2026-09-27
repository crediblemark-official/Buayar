# Xendit — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** (Payment Request v3, Direct BCA VA, Direct QRIS, checkTransaction, 11 v3 channels) · Audit fidelity: item **X-1 … X-8** — lihat [`docs/REVIEW-PG-FIDELITY.md` §2](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/xendit/provider.ts` | Payment Requests **v3** (default) + fallback legacy v2, parser dua-versi (X-1), probe per-channel (X-5…X-7), sumber live (X-8) |
| `src/providers/xendit/signature.ts` | Callback `x-callback-token` |

## Operasi

- `createInvoice` — v3 `POST /v3/payment_requests` dengan header `api-version: 2024-11-11`; VA `_VIRTUAL_ACCOUNT` + `display_name` (X-5), OTC `REUSABLE_PAYMENT_CODE` + `payer_name` (X-6), OVO mobile (X-7). `reference_id` alfanumerik; `failure_return_url` dikirim (X-2).
- `checkTransaction` — v3 `GET /v3/payment_requests/{id}` & jalur `/sessions`; parser mendukung respons v3 & v2.
- `verifyCallback` — bandingkan header `x-callback-token` dengan `XENDIT_WEBHOOK_VERIFICATION_TOKEN`; fail-closed.

## Kredensial (`.env`)

```env
XENDIT_SECRET_KEY=xnd_development_...
XENDIT_PUBLIC_KEY=xnd_public_development_...   # opsional
XENDIT_WEBHOOK_VERIFICATION_TOKEN=...          # wajib untuk verifyCallback
```

## Endpoint

- Sandbox `https://api.xendit.co` (path sama; kredensial `xnd_development_`).

## Verifikasi

- `bun run probe xendit` — v3 **11/11**, v2 **11/11** channel live.
- `gopay/shopeepay/credit_card/kredivo` tidak dikembalikan `GET /payment_channels` untuk akun sandbox ini → belum diuji live.
- Test regresi: `tests/pg-fidelity.test.ts`, `tests/xendit.test.ts`.
