# Faspay — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Contract / Simulator Only)** — Implementasi debit registration telah sesuai spesifikasi resmi & lulus contract simulator, namun belum pernah ditembakkan ke sandbox Faspay nyata karena menunggu tersedianya kredensial (`FASPAY_MERCHANT_ID`, `FASPAY_USER_ID`, `FASPAY_PASSWORD`).
> Audit fidelity: item **F-1** (verified, tanpa perubahan) — lihat [`docs/REVIEW-PG-FIDELITY.md` §5](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/faspay/provider.ts` | Debit registration (XML/JSON), payment status, callback |
| `src/providers/faspay/signature.ts` | Signature debit `sha1(md5(user_id + password + bill_no))` — **sesuai docs resmi** (F-1); verifikasi callback POST khusus |

## Operasi

- `createInvoice` — POST Credit debit registration; signature F-1 terverifikasi terhadap dokumentasi resmi.
- `checkTransaction` — inquiry status.
- `verifyCallback` — signature callback + mapping `payment_status_code` (2 = paid); fail-closed.

## Kredensial (`.env`)

```env
FASPAY_MERCHANT_ID=...
FASPAY_USER_ID=...
FASPAY_PASSWORD=...
```

## Endpoint

- Sandbox: `https://dev.faspay.co.id/id/` — Production: `https://web.faspay.co.id/id/`.

## Verifikasi

- Test regresi: `tests/faspay.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
