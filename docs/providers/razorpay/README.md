# Razorpay — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/razorpay/provider.ts` | Orders API (`POST /v1/orders`), payments retrieve, callback |
| `src/providers/razorpay/signature.ts` | Webhook: HMAC-SHA256 **hex** atas raw body dengan webhook secret |

## Operasi

- `createInvoice` — Order (`amount` paise, `currency`, `receipt` = orderId, `payment_capture: 1`); Basic Auth `key_id:key_secret`.
- `checkTransaction` — `GET /v1/payments/{id}` → `status` (`captured/authorized/failed/refunded`).
- `verifyCallback` — header `x-razorpay-signature` (hex HMAC); fail-closed tanpa secret.

## Kredensial (`.env`)

```env
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

## Endpoint

- `https://api.razorpay.com` (test mode via kunci `rzp_test_`).

## Verifikasi

- Test regresi: `tests/razorpay.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
