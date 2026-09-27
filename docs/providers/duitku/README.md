# Duitku — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** (POP, Direct VA BCA, Direct QRIS, checkTransaction) · Audit fidelity: item **DU-1**, **DU-2**, **DU-3** — lihat [`docs/REVIEW-PG-FIDELITY.md` §5](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/duitku/provider.ts` | POP Create Invoice, inquiry, callback |
| `src/providers/duitku/signature.ts` | Signature POP: header `x-duitku-signature` = HMAC-SHA256(`merchantCode`+`timestamp`, `apiKey`) (DU-1); verifikasi callback = HMAC-SHA256(`merchantCode`+`amount`+`merchantOrderId`, `apiKey`) dengan MD5 lama tetap diterima (DU-3) |

## Operasi

- `createInvoice` — `transactionDetails`, `customerDetail`, `itemDetails`, `paymentMethod` kosong = tampilkan semua. Signature lama di-body (skema SHA256 obsolete) sudah dihapus; kini via header (DU-1).
- Direct Inquiry (`webapi/.../v2/inquiry`) kini mengirim field **Request Transaction** yang resmi
  (DU-2): `customerVaName` (wajib, dipotong 20 karakter), `customerDetail` beserta
  `billingAddress` (wajib-efektif untuk metode credit seperti Indodana Paylater/`DN`), dan
  `itemDetails` bila `items` diberikan. Sebelumnya ketiganya tidak dikirim sehingga kanal
  `DN` gagal HTTP 400 berbadan kosong.
- `verifyCallback` — menerima **dua skema signature**: HMAC-SHA256 resmi saat ini
  (`hmacSha256(merchantCode + amount + merchantOrderId, apiKey)`) **dan** MD5 lama
  (`md5(merchantCode + amount + merchantOrderId + apiKey)`) selama masa transisi, sehingga
  callback yang belum dimigrasi maupun sandbox lama tidak ikut tertolak (DU-3). Terlepas dari
  itu, **signature sah tidak berarti terbayar**: `resultCode` — satu-satunya penentu status —
  **tidak ikut ditandatangani**. Jadi `verifyCallback` tidak pernah melaporkan `isPaid: true`:
  hasilnya `isValid: true` dengan `status: "pending"` dan `paymentUnconfirmed: true`.
  Alasannya ada di `unconfirmedReason`.
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
| Kanal `FT` (RETAIL / Pegadaian-ALFA-Pos) | Hambatan provider: Duitku membalas HTTP 500 "Failed to generate payment number Retail" untuk semua nominal/field. Tidak dapat digenerate untuk akun (sandbox) ini; probe menandainya `expected`. |
| Kanal `DN` (Indodana Paylater) | Field wajib sudah dikirim dan validasi lolos, tetapi Duitku membalas HTTP 500 "Failed to generate Indodana payment Url" — paylater belum ter-provision di akun. Diverifikasi live 2026-09-27. |
| Kanal `LQ` (LinkAja QRIS) | Sudah dihapus Duitku (changelog Jan 2025 "Remove payment channel QRIS Link Aja"). Sandbox masih mencantumkannya di `getpaymentmethod`, tetapi inquiry selalu HTTP 500 "Failed to generate QR String LinkAja". Gunakan `LA` (LinkAja App, percentage fee) atau `LF` (fixed fee) sebagai gantinya. |
| Kode kanal basi (DU-3) | Kode `GP` (GoPay), `JA` (Jenius), `BS` (BSI), `MY` (Muamalat), `AT` (Akulaku), `KV` (Kredivo), `AL` (Alfamart), `ID` (Indodana), `S1`=Seabank, `AG`=Artajasa tidak valid — diverifikasi live HTTP 404 "Payment channel not available". Yang benar: BSI=`BV`, Jenius=`JP`, Alfamart=`FT`, Indodana=`DN`, Maybank=`VA`, BNC=`NC`, S1=Bank Sampoerna, AG=Bank Artha Graha. Duitku tidak menyediakan GoPay/Akulaku/Kredivo/Seabank/Muamalat/Artajasa. |

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
  Hasil terakhir (2026-09-27): **24/27 diterima · 3 expected · 0 gagal**. Kanal `FT`/`DN`/`LQ`
  ditandai `expected` karena hambatan sisi provider (lihat tabel di atas), bukan bug SDK.
- Peta kanal dan verifikasi dua-skema signature dijaga oleh `tests/canonical.test.ts` dan
  `tests/duitku.test.ts` (blok "Duitku callback signature").
