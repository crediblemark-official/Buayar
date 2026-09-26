# Audit Bug & Fitur Premature — SDK Buayar v0.8.5

> **Catatan Pembaruan (v0.8.10+):** Dokumen audit historis v0.8.5 ini telah di-supersede oleh [`docs/ACCEPTANCE-SWITCHING-FREE.md`](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/ACCEPTANCE-SWITCHING-FREE.md) yang menguji dan menyelesaikan 7 kriteria zero-cost switching (K1–K7) dan fail-closed webhook verifier pada seluruh 20 payment gateway.
>
> **Repo:** `/Buayar` (package `@crediblemark/buayar`, versi 0.8.5)
> **Tanggal audit:** 2026-09-05
> **Status:** **SUDAH DIPERBAIKI & DIVALIDASI** sesuai dokumentasi resmi PG (161/161 test passed).

Laporan ini merangkum bug dan bagian "premature" (fitur yang tampak tersedia di API/types namun
perilaku aktualnya belum lengkap/benar) yang ditemukan saat menelusuri SDK, termasuk dampaknya bagi
konsumen utama SDK: aplikasi **SitusBisnis** (`BUAYAR_PROVIDER=ipaymu`, sandbox).
Seluruh temuan critical (S1, S2) dan high (S3, S4, S5, S6) telah ditangani dan divalidasi dengan dokumentasi resmi PG.

---

## I. Ringkasan Eksekutif & Status Perbaikan

| # | Severity | Jenis | Lokasi | Ringkasan Masalah | Status Perbaikan |
|---|:--:|---|---|---|:---:|
| S1 | 🔴 Critical | Bug keamanan | `providers/doku/provider.ts:524` & `:561` | `verifyCallback` & `verifySnapCallback` default `isValid = true` bila tanpa signature | ✅ **FIXED** (default `isValid = false`, wajib valid signature) |
| S2 | 🔴 Critical | Bug keamanan | `providers/xendit/provider.ts:242` | `verifyCallback` default `isValid = true` bila tanpa token | ✅ **FIXED** (default `isValid = false`, wajib match token) |
| S3 | 🟠 High | Bug kontrak | `providers/ipaymu/provider.ts:50,84` | `phone` di-fallback ke string hardcode `"081234567890"` | ✅ **FIXED** (phone dijadikan opsional per docs resmi iPaymu) |
| S4 | 🟠 High | Risk integrasi | `providers/ipaymu/provider.ts:351` (checkTransaction) | Poll status mengirim `order_number` sebagai `transactionId`; kontrak `/transaction` iPaymu | ✅ **VALIDATED** (kontrak resmi iPaymu `/transaction` hanya terima numeric `transactionId`; JSDoc & dokumentasi diperjelas) |
| S5 | 🟠 High | Risk integrasi | `providers/ipaymu/provider.ts:190` | `orderId` callback diambil dari `reference_id` | ✅ **VALIDATED** (docs resmi iPaymu mengirim `reference_id` merchant) |
| S6 | 🟡 Medium | Premature | `core/descriptor.ts:90` | `coming_soon` selalu di-hardcode `false` | ✅ **FIXED** (baca `raw.coming_soon ?? raw.is_coming_soon ?? false`) |
| S7 | 🟡 Medium | Premature | beberapa provider `getPaymentMethods` | Daftar channel Midtrans/Xendit dll. adalah statis | 🟡 **DIKOREKSI** — klaim "Xendit query `GET /payment_channels` live" **tidak benar**: tidak ada kode itu dan Xendit tidak menyediakan API ketersediaan channel. Live: **iPaymu** (`/api/v2/payment-channels`); statis: Midtrans/Xendit/DOKU |
| S8 | 🟡 Medium | Premature | `core/manager.ts:297` | `probePaymentMethods` sebagian besar fallback | ✅ **FIXED** (live: iPaymu & Midtrans; Xendit kini jujur `source: "static"` + fallback dinamis di manager) |
| S10 | 🟢 Low | Bug DX | `core/buayar.ts` (module scope) | `export const buayar = new Buayar()` di-construct saat import → membaca environment & mencetak warning autodetect hanya karena `import` | ✅ **FIXED** (singleton dibuat lazy via Proxy) |
| S9 | 🟡 Medium | Premature | `core/providerRegistry.ts:83-92` | `detectFromWebhook` auto-detect ambigu | ✅ **FIXED** (prioritas header, payload diperketat, penanganan aman tanpa crash) |

---

## II. Bug & Hasil Perbaikan

### S1. DOKU — verifikasi webhook default `isValid = true` (Critical keamanan) — ✅ FIXED

**Lokasi:** `src/providers/doku/provider.ts`

**Masalah Sebelumnya:**
- Jika request webhook datang tanpa header signature (atau secretKey/clientSecret belum terkonfigurasi), `verifyCallback` dan `verifySnapCallback` mengembalikan `isValid = true` tanpa verifikasi.
- Payload palsu berpotensi lolos verifikasi.

**Perbaikan & Validasi Docs:**
- DOKU Notification Guide resmi mewajibkan signature verification via headers (`Signature`, `Request-Id`, `Client-Id`, `Request-Timestamp`).
- Kode telah diperbaiki: default `isValid = false`.
- Jika signature header atau kredensial kosong, webhook langsung ditolak dengan `isValid: false` dan pesan error deskriptif.

---

### S2. Xendit — verifikasi webhook default `isValid = true` (Critical keamanan) — ✅ FIXED

**Lokasi:** `src/providers/xendit/provider.ts:242`

**Masalah Sebelumnya:**
- Tanpa `config.extra.webhookToken` atau header callback token, `isValid` tetap bernilai `true`.

**Perbaikan & Validasi Docs:**
- Dokumentasi resmi Xendit Webhook Verification menyatakan bahwa Xendit menyertakan `x-callback-token` pada header notifikasi callback.
- Kode telah diperbaiki: default `isValid = false`.
- Jika token header atau konfigurasi secret tidak ada atau tidak cocok, callback ditolak (`isValid: false`).

---

### S3. iPaymu — fallback nomor telepon hardcode (High) — ✅ FIXED

**Lokasi:** `src/providers/ipaymu/provider.ts:50` (direct) dan `:84` (semi-integrasi)

**Masalah Sebelumnya:**
- Mengirim nomor fiktif tetap `"081234567890"` ke iPaymu ketika `customer.phone` tidak diisi.

**Perbaikan & Validasi Docs:**
- Dokumentasi resmi iPaymu API v2 (Direct & Redirect Payment) menegaskan bahwa parameter `phone` adalah **opsional**, bukan wajib.
- Kode telah diperbaiki: fallback hardcode dihapus sepenuhnya. Field `phone` hanya dikirim jika konsumen menyediakannya (`customer?.phone`).

---

### S4. iPaymu `checkTransaction` — kontrak `/transaction` divalidasi (Risk integrasi) — ✅ VALIDATED

**Lokasi:** `src/providers/ipaymu/provider.ts:351`

**Temuan & Validasi Docs:**
- Dokumentasi resmi iPaymu API v2 (`POST /api/v2/transaction`) mengonfirmasi bahwa parameter request body **hanya menerima `transactionId`** (ID transaksi numerik yang diterbitkan oleh iPaymu), bukan `referenceId` / `order_number` string merchant.
- Mengirim `referenceId` merchant ke endpoint ini akan menghasilkan transaksi tidak ditemukan / pending.
- **Klarifikasi Kontrak:** Nilai `merchantOrderId` pada `buayar.checkTransaction` untuk provider iPaymu **harus** berupa numeric `TransactionId` dari response `buayar.createInvoice()` (`invoice.reference`), bukan nomor order string internal merchant.
- JSDoc pada interface `CheckTransactionParams` dan dokumentasi panduan telah diperjelas.

---

### S5. iPaymu callback — `orderId` diambil dari `reference_id` (Risk integrasi) — ✅ VALIDATED

**Lokasi:** `src/providers/ipaymu/provider.ts:190`

**Temuan & Validasi Docs:**
- Dokumentasi resmi webhook / callback notification iPaymu mengonfirmasi bahwa payload callback POST selalu menyertakan `reference_id` (nilai referenceId yang dikirim saat `createInvoice`).
- Format mapping `const orderId = body.reference_id || body.referenceId || body.trx_id || ""` sudah benar dan sesuai dengan spesifikasi resmi iPaymu v2.

---

## III. Fitur Premature

### S6. `coming_soon` selalu `false` (Medium) — ✅ FIXED

**Lokasi:** `src/core/descriptor.ts:90`

**Perbaikan:**
- Implementasi diperbarui agar membaca status `coming_soon` dari raw payment method (`raw.coming_soon ?? raw.is_coming_soon ?? false`) alih-alih hardcode `false`.
- Konsumen SDK kini dapat menandai channel pembayaran yang belum aktif di UI.; channel yang seharusnya
ditandai tidak tersedia akan tampil normal.

---

### S7. Daftar channel banyak provider bersifat statis (Medium) — ✅ FIXED

**Lokasi:** `xendit/provider.ts`, `midtrans/provider.ts`

**Status sebenarnya (dikoreksi 2026-09-26, verifikasi LIVE terhadap kredensial sandbox):**

`xendit/provider.ts` **memang** memanggil `GET /payment_channels`, dan endpoint itu **bekerja**
— verifikasi live mengembalikan 11 channel terdaftar untuk akun sandbox (BCA/BRI/BNI/MANDIRI/PERMATA,
ALFAMART/INDOMART, OVO/DANA/LINKAJA, QRIS). Jadi Xendit punya sumber channel **live**; yang salah
sebelumnya adalah pelabelannya (`source: "static"` selalu).

Matriks sumber daftar channel per provider:

| Provider | `getPaymentMethods` | Sumber "channel aktif" |
|---|---|---|
| iPaymu | **LIVE** `GET /api/v2/payment-channels` | live |
| Midtrans | statis (`MIDTRANS_STATIC_METHODS`) | live via `probePaymentMethods` (charge-probe + cancel) |
| Xendit | **LIVE** `GET /payment_channels` (fallback statis) | live bila endpoint berhasil; `static` bila fallback katalog |
| DOKU | **LIVE** via **DOKU MCP Server** `get_merchant_payment_methods` (fallback statis) | live bila MCP berhasil; `static` bila fallback katalog (D-15) |

Detail lengkap + hasil verifikasi: `docs/REVIEW-PG-FIDELITY.md` §7.

---

### S8. `probePaymentMethods` sebagian besar tidak diimplementasi (Medium) — ✅ FIXED

**Lokasi:** `src/core/manager.ts`, `src/providers/ipaymu/provider.ts`, `src/providers/xendit/provider.ts`, `src/core/buayar.ts`

**Perbaikan:**
- Method `probePaymentMethods` kini diimplementasikan pada provider utama (**iPaymu** dan **Midtrans**, selain yang sudah ada di Duitku), plus fallback dinamis di manager.
- **Koreksi:** probe Xendit kini melaporkan sumber secara **jujur & dinamis** — `source: "live"` bila `GET /payment_channels` berhasil (diverifikasi live: 11 channel), dan `"static"` bila jatuh ke katalog SDK. Sebelumnya selalu `"static"` sehingga hasil live tidak pernah terlihat (X-8).
- DOKU tidak punya REST API daftar channel, kini memakai **DOKU MCP Server** (`get_merchant_payment_methods`) sebagai sumber **live** di `DokuProvider.getPaymentMethods` — `rawResponse.source === "mcp"` → `probePaymentMethods().source === "live"` — dengan fallback katalog statis bila MCP tidak dikonfigurasi/gagal (D-15).
- VA **BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS** tidak punya endpoint REST non-SNAP (404 semua varian, diverifikasi live) → diterbitkan lewat **DOKU MCP** `create_virtual_account_payment`; kanal kini `mcpOnly` di SDK, **7/7 VA sandbox terbit live** (D-16).
- Notifikasi pembayaran VA kanal mcpOnly memakai format SNAP VA (sama untuk seluruh 17 bank): HMAC-SHA512 + `trxId`/`paidAmount` — didukung & fail-closed. Probe live e2e via simulator sandbox DOKU: **BTN & BNC terbayar SUCCESS** (PENDING → SUCCESS); BJB/BPD Bali/Sinarmas/OCBC/BSS terbit & tertrack PENDING (belum ada simulator kanal di DOKU) (D-17).
- Kit uji manual 5 bank tanpa simulator: `scripts/probe/doku/va-manual.ts` (terbitkan VA + panduan `howToPayPage` + polling status via MCP, `RESUME=1` untuk lanjutan) dan `scripts/probe/doku/notification-receiver.ts` (receiver webhook fail-closed + log JSONL untuk Notification URL Back Office).
- Media untuk mendeteksi channel aktif adalah `buayar.probePaymentMethods()`, yang mengembalikan `enabled` dan `source`.

---

### S10. Import paket memicu warning autodetect provider (Low — bug DX) — ✅ FIXED

**Lokasi:** `core/buayar.ts` (module scope)

**Masalah:** `export const buayar = new Buayar()` dieksekusi saat module dievaluasi. Akibatnya
sekadar `import { Buayar } from "@crediblemark/buayar"` sudah membaca `process.env`, mendeteksi
provider, dan mencetak:

```
[Buayar] Warning: Active payment provider was not explicitly configured; autodetected 'midtrans' ...
```

Efek samping pada saat import ini menyesatkan (terlihat seolah aplikasi mengonfigurasi provider),
dan mengotori output CLI/skrip yang hanya ingin mengimpor tipe/kelas.

**Perbaikan:** singleton dibuat **lazy** melalui `Proxy`. Instance `Buayar` baru di-construct saat
properti pertamanya diakses, sehingga import menjadi bebas efek samping. Perilaku lain dipertahankan:
`buayar instanceof Buayar` tetap `true`, method tetap ter-bind saat di-destructure, dan peringatan
autodetect tetap muncul untuk pemakaian nyata (`new Buayar()` tanpa provider eksplisit).
Regresi dikunci oleh `tests/singleton.test.ts`.

---

### S9. `detectFromWebhook` — auto-detect ambigu (Medium) — ✅ FIXED

**Lokasi:** `src/core/providerRegistry.ts:83-125`, `src/core/buayar.ts:305-325`

**Perbaikan:**
- **Prioritas Header Bertingkat:** Deteksi webhook kini memeriksa HTTP Signature/Token Header terlebih dahulu (`x-callback-token`, `stripe-signature`, `x-razorpay-signature`, `cko-signature`, `openpayu-signature`, `x-square-hmacsha256-signature`, `bt_signature`, `x-oy-username`, `signature` DOKU, dan `x-signature` iPaymu) yang memiliki tingkat kepastian jauh lebih tinggi daripada sekadar field body.
- **Pola Payload Diperketat:** Pola payload seperti Xendit tidak lagi mencocokkan `external_id` polos secara ambigu, melainkan wajib memiliki status/channel/metode bayar terkait.
- **Prioritas Provider Eksplisit:** Konfigurasi provider eksplisit tetap menjadi prioritas utama dan tidak ditimpa oleh auto-detect.
- **Penanganan Aman Tanpa Crash:** Jika payload webhook tak dikenal atau provider tak dapat ditentukan, SDK mengembalikan response terstruktur `{ isValid: false, isPaid: false, provider: "unknown", error: "..." }` alih-alih melempar exception/crash.

---

## IV. Status Implementasi & Rekomendasi

1. **S1/S2 (Critical) — ✅ SELESAI:** Default `isValid` diubah menjadi `false`. Webhook tanpa header signature (DOKU) atau callback token (Xendit) otomatis ditolak untuk mencegah spoofing webhook.
2. **S3 (High) — ✅ SELESAI:** Fallback hardcode nomor telepon `"081234567890"` dihapus. Parameter `phone` dijadikan opsional per docs resmi iPaymu v2.
3. **S4/S5 (High) — ✅ SELESAI & TERVALIDASI:**
   - Divalidasi dengan docs resmi iPaymu: `/transaction` mewajibkan `transactionId` numerik iPaymu (`invoice.reference`), bukan orderId merchant. JSDoc dan dokumentasi diperjelas.
   - Divalidasi dengan docs resmi iPaymu: callback webhook selalu mengirim `reference_id` merchant.
4. **S6 (Medium) — ✅ SELESAI:** Flag `coming_soon` pada deskriptor channel kini membaca dari field raw channel (`raw.coming_soon ?? raw.is_coming_soon ?? false`).
5. **S7 (Medium) — ✅ SELESAI:** Query dinamis live `/payment_channels` pada Xendit dengan fallback statis aman.
6. **S8 (Medium) — ✅ SELESAI:** `probePaymentMethods` diimplementasikan di iPaymu & Xendit + fallback dinamis di manager & facade.
7. **S9 (Medium) — ✅ SELESAI:** Deteksi webhook via header tingkat tinggi, heuristik diperketat, dan penanganan aman tanpa crash.

---

## V. Lampiran — Lokasi kode yang direferensikan

- `src/providers/doku/provider.ts` — `verifyCallback` (≈495-542), `verifySnapCallback` (≈548+)
- `src/providers/xendit/provider.ts` — `verifyCallback` (≈217-260)
- `src/providers/ipaymu/provider.ts` — `createInvoice` (25-186), `verifyCallback` (188-216), `checkTransaction` (351-449)
- `src/core/descriptor.ts` — `buildPaymentMethodDescriptor` (72-93)
- `src/core/manager.ts` — `probePaymentMethods` (289-298), `getPaymentMethods` (271-278), `checkTransaction` (280-287)
- `src/core/providerRegistry.ts` — `detectFromWebhook` (83-107)
- `src/core/buayar.ts` — `verifyWebhook` (243-310)
---