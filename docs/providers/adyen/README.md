# Adyen — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/adyen/provider.ts` | Checkout `/payments` + `/payments/details`, mapper notification → kanonikal |
| `src/providers/adyen/signature.ts` | Webhook HMAC-SHA256 base64 atas sorted key-value `NotificationRequestItem` |

## Operasi

- `createInvoice` — `POST /v68/payments` (checkout API), `reference` = orderId, `returnUrl`, channel Web.
- `verifyCallback` — HMAC atas komponen terurut (`pspReference`, `merchantReference`, `eventCode`, `success`, dst.) dari `additionalData.hmacSignature`; fail-closed tanpa HMAC key.
- Deteksi provider notification: `notificationItems` + `merchantAccountCode` + `pspReference` + `eventCode`.

## Kredensial (`.env`)

```env
ADYEN_API_KEY=AE...
ADYEN_MERCHANT_ACCOUNT=...
ADYEN_CLIENT_KEY=test_...      # opsional (frontend)
ADYEN_HMAC_KEY=hex             # wajib untuk verifyCallback
```

## Endpoint

- Sandbox: `https://checkout-test.adyen.com` — Production: `https://checkout-live.adyen.com` (versi API tergantung region/live prefix).

## Verifikasi

- Test regresi: `tests/adyen.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
