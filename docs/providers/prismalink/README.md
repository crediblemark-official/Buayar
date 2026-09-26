# Prismalink — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Dokumentasi Tertutup / Butuh Akses Merchant)** — Payload & signature belum dapat diverifikasi secara live karena dokumentasi resmi Prismalink bersifat tertutup.

> Status Audit: **⏸ BLOCKED (FP-1)** — dokumentasi resmi tidak ditemukan lewat pencarian; payload/signature **belum dapat divalidasi**. Tidak ada perubahan kode atas kode warisan. Butuh dokumen resmi atau akun merchant Prismalink (VALINK).

## File

| File | Isi |
|---|---|
| `src/providers/prismalink/provider.ts` | Implementasi warisan (belum diaudit) |
| `src/providers/prismalink/signature.ts` | Signature warisan (belum diaudit) |

## Kredensial (`.env`)

```env
PRISMALINK_MERCHANT_ID=...
PRISMALINK_SECRET_KEY=...
```

## Yang dibutuhkan untuk membuka blokir

1. Dokumentasi API VALINK resmi (endpoint, signature, format callback), atau
2. Akun merchant sandbox + dukungan teknis Prismalink.

## Verifikasi

- Fail-closed webhook: `tests/webhook-security.test.ts` — satu-satunya jaminan saat ini.
