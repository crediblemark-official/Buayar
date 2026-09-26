# Checkout.com — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/checkoutcom/provider.ts` | Payment Sessions (`POST /payment-sessions`), retrieve payment, callback |
| `src/providers/checkoutcom/signature.ts` | Webhook: compare `cko-signature` HMAC-SHA256 raw body dengan `secret_key` |

## Operasi

- `createInvoice` — Payment Session dengan `amount` (satuan terkecil), `currency`, `reference` = orderId, `success_url`/`failure_url`.
- `checkTransaction` — `GET /payments/{id}` → `status` (`Succeeded/Pending/Declined`) → kanonikal.
- `verifyCallback` — HMAC-SHA256 raw body via header `cko-signature`; fail-closed tanpa secret.

## Kredensial (`.env`)

```env
CHECKOUTCOM_SECRET_KEY=sk_test_...
CHECKOUTCOM_PUBLIC_KEY=pk_test_...
CHECKOUTCOM_WEBHOOK_SECRET=...     # opsional bila memakai secret_key sebagai kunci HMAC
```

## Endpoint

- Sandbox: `https://api.sandbox.checkout.com` — Production: `https://api.checkout.com`.

## Verifikasi

- Test regresi: `tests/checkoutcom.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
