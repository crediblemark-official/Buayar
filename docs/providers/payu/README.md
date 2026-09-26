# PayU (Poland) — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/payu/provider.ts` | Orders API (`POST /api/v2_1/orders`), OAuth client-credentials, notify mapping |
| `src/providers/payu/signature.ts` | Header `OpenPayU-Signature` MD5 (`body + secondKey`) |

## Operasi

- `createInvoice` — Order (`extOrderId` = orderId, `products[]`, `notifyUrl`, `continueUrl`); OAuth token `client_id/client_secret` (POS). `302` dari endpoint orders adalah **normal** (redirect ke autorisasi) — diikuti sebagai respons sukses.
- `checkTransaction` — `GET /api/v2_1/orders/{orderId}` → `status` (`COMPLETED/PENDING/CANCELED/WAITING_FOR_CONFIRMATION`).
- `verifyCallback` — `OpenPayU-Signature: sender,signature,algorithm=MD5` atas raw body dengan `secondKey`; fail-closed.

## Kredensial (`.env`)

```env
PAYU_POS_ID=...
PAYU_MD5_KEY=...
PAYU_OAUTH_CLIENT_ID=...
PAYU_OAUTH_CLIENT_SECRET=...
```

## Endpoint

- Sandbox: `https://secure.snd.payu.com` — Production: `https://secure.payu.com`.

## Verifikasi

- Test regresi: `tests/payu.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
