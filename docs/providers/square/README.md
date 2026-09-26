# Square — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Contract / Simulator Only)** — Implementasi telah lulus contract simulator, namun belum pernah diuji langsung ke server sandbox/test mode Square nyata karena menunggu tersedianya kredensial.

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/square/provider.ts` | Payments API (`POST /v2/payments`), retrieve, callback |
| `src/providers/square/signature.ts` | Webhook: HMAC-SHA256 base64 atas `notification_url + raw body` dengan signature key |

## Operasi

- `createInvoice` — `POST /v2/payments` (`amount_money.amount` satuan terkecil, `reference_id` = orderId, `location_id`), `Idempotency-Key` unik.
- `checkTransaction` — `GET /v2/payments/{id}` → `status` (`COMPLETED/PENDING/FAILED/CANCELED`).
- `verifyCallback` — header `x-square-hmacsha256-signature` atas `notificationUrl + body`; fail-closed tanpa key.

## Kredensial (`.env`)

```env
SQUARE_ACCESS_TOKEN=EAAAE...
SQUARE_APPLICATION_ID=sq0idp-...   # opsional
SQUARE_LOCATION_ID=L...
SQUARE_WEBHOOK_SIGNATURE_KEY=...
```

## Endpoint

- Sandbox: `https://connect.squareupsandbox.com` — Production: `https://connect.squareup.com`.

## Verifikasi

- Test regresi: `tests/square.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
