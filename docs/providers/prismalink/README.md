# Prismalink — Implementasi Buayar

> ⚠️ **Status Pengujian:** ⏳ **BELUM TESTED LIVE (Gateway Tidak Stabil / Sandbox Tidak Dapat Diakses)** — Prismalink saat ini **kurang stabil**, dan **pendaftaran untuk mengakses sandbox/staging-nya tidak bisa dilakukan**. Karena itu payload & signature belum dapat diverifikasi secara live.

> Status Audit: **⏸ BLOCKED (FP-2)** — dokumentasi resmi tidak ditemukan dan sandbox/staging tidak dapat diakses (registrasi gagal / gateway tidak stabil); payload/signature **belum dapat divalidasi**. Tidak ada perubahan kode atas kode warisan. Hanya perilaku webhook **fail-closed** yang dijamin.

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

## Alasan terblokir (FP-2)

1. **Gateway tidak stabil** — Prismalink (VALINK) saat ini belum dapat diandalkan untuk pengujian.
2. **Registrasi sandbox/staging tidak dapat diakses** — tidak bisa mendaftar untuk memperoleh akun akses sandbox/staging, sehingga tidak ada jalur untuk verifikasi live.
3. **Dokumentasi API resmi tidak ditemukan** — endpoint, signature, dan format callback belum dapat dipastikan.

Sesuai prinsip "jangan menebak payload", **tidak ada perubahan kode** pada kode warisan.

## Yang dibutuhkan untuk membuka blokir

1. Akses sandbox/staging yang stabil (registrasi berfungsi kembali), **atau**
2. Dokumentasi API VALINK resmi (endpoint, signature, format callback), **atau**
3. Akun merchant sandbox + dukungan teknis Prismalink.

## Verifikasi

- Fail-closed webhook: `tests/webhook-security.test.ts` — satu-satunya jaminan saat ini.
- **Belum ada** probe live (tidak ada akses sandbox/staging).
