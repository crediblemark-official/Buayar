# PayPal — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/paypal/provider.ts` | Orders v2 (`create`, `capture`), OAuth client-credentials, verify webhook via API |
| `src/providers/paypal/signature.ts` | Webhook: verifikasi kecil lokal + rujukan `POST /v1/notifications/verify-webhook-signature` |

## Operasi

- `createInvoice` — Order v2 (`intent: CAPTURE`, `purchase_units[0].reference_id` = orderId, `amount.breakdown`).
- `checkTransaction` — `GET /v2/checkout/orders/{id}` → status `APPROVED/COMPLETED/VOIDED`.
- `verifyCallback` — **verify-webhook-signature API** (transmission id/time/cert/checksum, auth algo, webhook id) — keputusan keabsahan dari PayPal, bukan komputasi lokal; fail-closed tanpa `PAYPAL_WEBHOOK_ID`.

## Kredensial (`.env`)

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=WH-...
```

## Endpoint

- Sandbox: `https://api-m.sandbox.paypal.com` — Production: `https://api-m.paypal.com`.

## Verifikasi

- Test regresi: `tests/paypal.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
