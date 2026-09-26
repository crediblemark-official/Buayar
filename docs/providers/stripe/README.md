# Stripe — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Contract / Simulator Only)** — Implementasi telah lulus contract simulator, namun belum pernah diuji langsung ke server test mode Stripe nyata karena menunggu input kredensial (`sk_test_...`).
> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/stripe/provider.ts` | Checkout Session (`mode: payment`), PaymentIntent, `checkTransaction` via retrieve |
| `src/providers/stripe/signature.ts` | Webhook: `Stripe-Signature` v1 (`t` + `v1` HMAC-SHA256 atas `t.payload`, konstanta-time compare) |

## Operasi

- `createInvoice` — Checkout Session (`success_url`/`cancel_url` dari returnUrl, `line_items` dari items/productDetails, `client_reference_id` = orderId).
- `checkTransaction` — `GET /v1/checkout/sessions/{id}` → `payment_status`/`status` → kanonikal.
- `verifyCallback` — verifikasi signature v1 resmi Stripe; fail-closed tanpa `whsec_`.

## Kredensial (`.env`)

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...        # opsional
STRIPE_WEBHOOK_SECRET=whsec_...      # wajib untuk verifyCallback
```

## Endpoint

- `https://api.stripe.com` (sandbox = kunci `sk_test_`).

## Verifikasi

- Test regresi: `tests/stripe.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
