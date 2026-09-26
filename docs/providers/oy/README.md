# OY! Indonesia — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Contract / Simulator Only)** — Implementasi telah lulus contract simulator, namun belum pernah diuji langsung ke server sandbox OY! nyata karena menunggu tersedianya akun/kredensial (`OY_USERNAME`, `OY_API_KEY`).
> Status: struktur sudah sesuai docs publik OY!; **pendalaman fidelity (payload per-channel, status mapping) masuk gelombang berikutnya** — lihat [`docs/REVIEW-PG-FIDELITY.md` §9](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/oy/provider.ts` | VA & disbursement via api.oyindonesia.com, callback |
| `src/providers/oy/signature.ts` | Basic Auth (`username:api_key`) untuk OY! |

## Operasi

- `createInvoice` — create VA (`partner_user_id`, `merchants_vendor_code`, `amount`).
- `verifyCallback` — cek `api_key` pada body callback OY!; fail-closed.

## Kredensial (`.env`)

```env
OY_USERNAME=...
OY_API_KEY=...
OY_SANDBOX=true
```

## Endpoint

- Sandbox: `https://api-staging.oyindonesia.com` — Production: `https://api.oyindonesia.com`.

## Verifikasi

- Test regresi: `tests/oy.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
- Belum ada probe per-channel live (butuh akun OY! sandbox aktif).
