# Finpay — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Dokumentasi Tertutup / Butuh Akses Merchant)** — Payload & signature belum dapat diverifikasi secara live karena dokumentasi resmi Finpay bersifat tertutup.

> Status Audit: **⏸ BLOCKED (FP-1)** — dokumentasi resmi tidak ditemukan lewat pencarian; payload/signature **belum dapat divalidasi**. Tidak ada perubahan kode atas kode warisan. Butuh dokumen resmi atau akun merchant Finpay.

## File

| File | Isi |
|---|---|
| `src/providers/finpay/provider.ts` | Implementasi warisan (belum diaudit) |
| `src/providers/finpay/signature.ts` | Signature warisan (belum diaudit) |

## Kredensial (`.env`)

```env
FINPAY_MERCHANT_ID=...
FINPAY_MERCHANT_KEY=...
```

## Yang dibutuhkan untuk membuka blokir

1. Dokumentasi API resmi Finpay (endpoint, signature, format callback), atau
2. Akun merchant sandbox + dukungan teknis Finpay.

## Verifikasi

- Fail-closed webhook: `tests/webhook-security.test.ts` — satu-satunya jaminan saat ini.
