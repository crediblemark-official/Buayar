# Duitku — Implementasi Buayar

> Audit fidelity: item **DU-1** — lihat [`docs/REVIEW-PG-FIDELITY.md` §5](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/duitku/provider.ts` | POP Create Invoice, inquiry, callback |
| `src/providers/duitku/signature.ts` | Signature POP: header `x-duitku-signature` = HMAC-SHA256(`email`+`timestamp`+`apiKey`, `merchantCode`) (DU-1) |

## Operasi

- `createInvoice` — `transactionDetails`, `customerDetail`, `itemDetails`, `paymentMethod` kosong = tampilkan semua. Signature lama di-body (skema SHA256 obsolete) sudah dihapus; kini via header (DU-1).
- `verifyCallback` — signature callback MD5(`merchantCode + amount + merchantOrderId + apiKey`); fail-closed.

## Kredensial (`.env`)

```env
DUITKU_MERCHANT_CODE=D...
DUITKU_API_KEY=...
DUITKU_EMAIL=...      # dipakai komponen signature header
```

## Endpoint

- Sandbox: `https://sandbox.duitku.com/webapi/api/merchant` — Production: `https://passport.duitku.com/webapi/api/merchant`.

## Verifikasi

- Test regresi: `tests/duitku.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
