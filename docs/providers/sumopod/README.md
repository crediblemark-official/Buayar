# SumoPod — Implementasi Buayar

> Provider internasional (induk SumoPay/Midtrans reseller) — struktur diaudit sekilas; ada dokumen terpisah: [`docs/sumopod.md`](../sumopod.md).

## File

| File | Isi |
|---|---|
| `src/providers/sumopod/provider.ts` | Create invoice, status, callback |
| `src/providers/sumopod/signature.ts` | Webhook secret/token SumoPod |

## Operasi

- `createInvoice` — invoice API dengan `order_id`, `amount`, `callback_url`.
- `verifyCallback` — verifikasi secret/token webhook; fail-closed.

## Kredensial (`.env`)

```env
SUMOPOD_API_KEY=...
SUMOPOD_WEBHOOK_SECRET=...
SUMOPOD_WEBHOOK_TOKEN=...
```

## Verifikasi

- Test regresi: `tests/sumopod.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
- Dokumen lengkap (tutorial, contoh): [`docs/sumopod.md`](../sumopod.md).
