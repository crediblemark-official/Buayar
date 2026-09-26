# iPaymu — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** (Redirect Invoice, Direct BCA VA, Direct QRIS, checkTransaction, 13 probe channels) · Audit fidelity: item **I-1 … I-9** — lihat [`docs/REVIEW-PG-FIDELITY.md` §4](../../REVIEW-PG-FIDELITY.md).

## File

| File | Isi |
|---|---|
| `src/providers/ipaymu/provider.ts` | Direct Payment (VA, cstore, e-wallet, COD, Debit Online), Redirect Payment, probe per-channel (I-7/I-8/I-9) |
| `src/providers/ipaymu/signature.ts` | HMAC-SHA256 + format `timestamp YYYYMMDDHHmmss` WIB (I-1) |

## Operasi

- `createInvoice` — Direct: `timestamp` 14 digit (I-1); `expired` di-clamp per channel & di-omit bila tidak boleh dikustom — BCA/Alfamart/QRIS (I-2); `product[]/qty[]/price[]` selalu dikirim, dimensi `weight/width/length/height` bila lengkap (I-7); Debit Online = `paymentMethod: "cc"` + `paymentChannel: "debitonline"` (I-8, terverifikasi live); COD butuh shipping & product (I-9); `successUrl/cancelUrl` untuk channel redirect CC/Paylater (I-3).
- Kanal e-wallet/paylater mengikuti SDK resmi iPaymu (lebih permisif), dengan catatan konfirmasi vendor (I-4).
- `verifyCallback` — verifikasi body + kliru, fail-closed tanpa kredensial.

## Kredensial (`.env`)

```env
IPAYMU_VA=0000001995...
IPAYMU_API_KEY=SANDBOX...
```

## Endpoint

- Sandbox: `https://sandbox.ipaymu.com/api/v2` — Production: `https://my.ipaymu.com/api/v2`.

## Verifikasi

- `bun run probe ipaymu` — **14/19 kanal diterima live**; `cod` & QRIS `mpm` terkonfirmasi API (I-5/I-6).
- `shopeepay/akulaku/danamon/bri` menunggu aktivasi partner di sisi iPaymu.
- Test regresi: `tests/pg-fidelity.test.ts`, `tests/ipaymu.test.ts`.
