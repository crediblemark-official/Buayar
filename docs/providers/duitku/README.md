# Duitku — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** (POP, Direct VA BCA, Direct QRIS, checkTransaction) · Audit fidelity: item **DU-1** — lihat [`docs/REVIEW-PG-FIDELITY.md` §5](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/duitku/provider.ts` | POP Create Invoice, inquiry, callback |
| `src/providers/duitku/signature.ts` | Signature POP: header `x-duitku-signature` = HMAC-SHA256(`email`+`timestamp`+`apiKey`, `merchantCode`) (DU-1) |

## Operasi

- `createInvoice` — `transactionDetails`, `customerDetail`, `itemDetails`, `paymentMethod` kosong = tampilkan semua. Signature lama di-body (skema SHA256 obsolete) sudah dihapus; kini via header (DU-1).
- `verifyCallback` — **signature sah tidak berarti terbayar.** Signature callback Duitku hanya
  mencakup `MD5(merchantCode + amount + merchantOrderId + apiKey)`, sedangkan `resultCode` —
  satu-satunya penentu status — **tidak ikut ditandatangani**. Jadi `verifyCallback` tidak pernah
  melaporkan `isPaid: true`: hasilnya `isValid: true` dengan `status: "pending"` dan
  `paymentUnconfirmed: true`. Alasannya ada di `unconfirmedReason`.
- `checkTransaction` — satu-satunya cara sah naik dari `pending` ke `paid` (server-to-server).
  Kegagalan saat mengecek **tidak pernah** menjadi `isFailed: true`; "tidak ditemukan" ditandai
  terpisah lewat `orderNotFound: true`.

### Mengaktifkan konfirmasi

```ts
const buayar = new Buayar({
  provider: "duitku",
  merchantCode: process.env.DUITKU_MERCHANT_CODE,
  apiKey: process.env.DUITKU_API_KEY,
  extra: { confirmDuitkuCallback: true },
});
```

Tanpa itu, `verifyCallback` tidak melakukan panggilan jaringan sama sekali — tidak menambah
latensi webhook dan tidak bergantung pada Duitku sedang hidup atau tidak.

## Keterbatasan yang perlu diketahui merchant

| Hal | Status |
|---|---|
| Order **POP** (`createInvoice` tanpa `paymentMethod`) | Tidak tercatat di endpoint `transactionStatus`, jadi statusnya **tidak bisa dikonfirmasi lewat API** — selalu dijawab `Transaction not found` dengan `orderNotFound: true`. Konsekuensinya: `confirmDuitkuCallback` tidak bisa menaikkan order POP ke `paid`, dan statusnya menggantung di `pending`. Perlu dikejar lewat halaman dashboard Duitku. |
| Order **Direct Inquiry** | Bisa dikonfirmasi; `transactionStatus` menjawab `01` (pending) dengan benar. |
| `isExpired` | Selalu `false` dari library. Dokumentasi resmi Duitku menyebut `02` sebagai "Failed/Expired" sekaligus, jadi tidak bisa dibedakan dari kode status. |
| `statusCode: "02"` yang otentik | Tetap dilaporkan `isFailed: true` — kegagalan nyata tidak disembunyikan. |

## Kredensial (`.env`)

```env
DUITKU_MERCHANT_CODE=D...
DUITKU_API_KEY=...
DUITKU_EMAIL=...      # dipakai komponen signature header
```

## Endpoint

- Sandbox: `https://sandbox.duitku.com/webapi/api/merchant` — Production: `https://passport.duitku.com/webapi/api/merchant`.
- POP: `https://api-sandbox.duitku.com/api/merchant` — Production: `https://api-prod.duitku.com/api/merchant`.
  `transactionStatus` memakai host POP, sesuai SDK resmi Duitku.

## Verifikasi

- Test regresi: `tests/duitku.test.ts`, integritas callback di `tests/duitku-callback-integrity.test.ts`
  (16 test; 14 di antaranya gagal pada kode sebelum S-10), fail-closed signature di
  `tests/webhook-security.test.ts`.
- Probe live: `bun run scripts/probe/duitku/channels.ts` (atau `bun run scripts/probe duitku`).
  Memverifikasi matriks kanal **dan** integritas callback terhadap sandbox Duitku sungguhan.
