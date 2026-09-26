# 2Checkout (Verifone) — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/twocheckout/provider.ts` | Orders API / IPN flow, mapping `ORDERSTATUS` |
| `src/providers/twocheckout/signature.ts` | IPN: MD5 hash `SALE/SREF + date + total + currency + secret` (format resmi 2Checkout) |

## Operasi

- `createInvoice` — host checkout / order API dengan `merchant`, `return-url`, item line.
- `checkTransaction` — `GET /orders/{ref}` → `STATUS` (`COMPLETE/PENDING/CANCELED`).
- `verifyCallback` — IPN `HASH` MD5 sesuai urutan field resmi + `HASH_SHA2_256` bila dikirim; fail-closed tanpa secret word.

## Kredensial (`.env`)

```env
TWOCHECKOUT_MERCHANT_CODE=...
TWOCHECKOUT_SECRET_KEY=...
TWOCHECKOUT_SECRET_WORD=...     # untuk IPN
```

## Endpoint

- Sandbox: `https://sandbox.2checkout.com` — Production: `https://www.2checkout.com`.

## Verifikasi

- Test regresi: `tests/twocheckout.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
