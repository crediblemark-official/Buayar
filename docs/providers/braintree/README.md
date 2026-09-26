# Braintree — Implementasi Buayar

> Provider internasional — struktur diaudit sekilas (level gelombang 3); fokus fidelity utama proyek adalah provider Indonesia.

## File

| File | Isi |
|---|---|
| `src/providers/braintree/provider.ts` | GraphQL Gateway (`POST /graphql`), transaction create/sale, webhook parse |
| `src/providers/braintree/signature.ts` | Webhook: verifikasi `bt_signature` (HMAC-SHA1 sha1_1 pair) + `bt_payload` |

## Operasi

- `createInvoice` — transaction sale via GraphQL (`input.amount`, `orderId`, options submitForSettlement); auth Basic `public_key:private_key` + tokenization key/klien token untuk frontend.
- `checkTransaction` — query transaction by id → `status` (`submitted_for_settlement/settled/voided/...`).
- `verifyCallback` — `bt_signature` + `bt_payload` (base64) resmi Braintree; fail-closed tanpa private key.

## Kredensial (`.env`)

```env
BRAINTREE_MERCHANT_ID=...
BRAINTREE_PUBLIC_KEY=...
BRAINTREE_PRIVATE_KEY=...
```

## Endpoint

- Sandbox: `https://payments.sandbox.braintree-api.com/graphql` — Production: `https://payments.braintree-api.com/graphql`.

## Verifikasi

- Test regresi: `tests/braintree.test.ts`, fail-closed di `tests/webhook-security.test.ts`.
