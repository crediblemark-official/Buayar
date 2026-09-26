# Nicepay — Implementasi Buayar

> Audit fidelity: item **N-1, N-2** — lihat [`docs/REVIEW-PG-FIDELITY.md` §5](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/nicepay/provider.ts` | Registrasi/inquiry direct v2 (N-1), callback |
| `src/providers/nicepay/signature.ts` | Signature merchantToken SHA256(`timeStamp + iMid + referenceNo + amt + merchantKey`) |

## Operasi

- `createInvoice` — path direct v2 `/nicepay/direct/v2/registration` (N-1); grup Alfamart memakai `mitraCd: ALMA` (bukan `ALFA`, N-2).
- `checkTransaction` — `/nicepay/direct/v2/inquiry` (N-1).
- `verifyCallback` — callback v2 (`merchantToken` SHA256(`referenceNo + amt + merchantKey`)); fail-closed.

## Kredensial (`.env`)

```env
NICEPAY_IMID=IONPAYTEST
NICEPAY_KEY=...
```

## Endpoint

- Sandbox: `https://sandbox.nicepay.co.id` — Production: `https://www.nicepay.co.id`.

## Verifikasi

- Test regresi: `tests/nicepay.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
