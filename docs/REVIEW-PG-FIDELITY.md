# Review Fidelity PG — Implementasi "Premature" vs Dokumentasi Resmi

> **Status dokumen:** hasil kajian (verifikasi silang kode ↔ dokumen resmi PG).
> **Repo:** `@crediblemark/buayar` v0.8.10 · **Tanggal:** 2026-09-25
> **Cakupan gelombang 1:** Midtrans, Xendit, DOKU, iPaymu.
> **Gelombang 2:** Duitku, Nicepay, Faspay, Finpay, Prismalink (lihat §5).
> **Gelombang 3:** Midtrans BI-SNAP Core API — adapter opt-in penuh (lihat §6).
> Provider lain menyusul bertahap (`docs/REVIEW-PG-FIDELITY.md` akan diperluas).
>
> Dokumen ini **melengkapi** [`docs/AUDIT-BUG-DAN-PREMATURE.md`](AUDIT-BUG-DAN-PREMATURE.md)
> (audit lama, fokus keamanan webhook & fitur premature internal) dan
> [`docs/ACCEPTANCE-SWITCHING-FREE.md`](ACCEPTANCE-SWITCHING-FREE.md) (7 kriteria switching).
> Semua temuan di bawah diperiksa terhadap **dokumentasi resmi masing-masing PG**, dengan
> tautan bukti.

---

## 0. Ringkasan

| # | Provider | Severity | Temuan | Kode | Status |
|---|----------|:--:|--------|------|:--:|
| M-1 | Midtrans | 🟡 Medium | `enabled_payments` di Snap dikirim sebagai kode kanonikal mentah yang **bukan nilai valid** Snap (mis. `qris`, `mandiri_va`) | `midtrans/provider.ts` | ✅ Fixed |
| M-2 | Midtrans | 🟠 High | QRIS Core API memakai acquirer `"shopeepay"` (tidak valid; nilai resmi: `gopay` / `airpay shopee`) | `midtrans/charge.ts` | ✅ Fixed |
| M-3 | Midtrans | 🟡 Medium | Probe `permata` memakai `payment_type: "permata"` (tidak ada; harus `bank_transfer.bank="permata"`) | `midtrans/methods.ts` | ✅ Fixed |
| M-4 | Midtrans | 🟡 Medium | `customer_details.phone` dikirim `""` (sebaiknya di-omit) | `midtrans/*` | ✅ Fixed |
| X-1 | Xendit | 🔴 High | Klaim "Payments API v3" tetapi endpoint & skema yang dipakai adalah **v2** (`/payment_requests`, `payment_method` nested, `amount`) | `xendit/provider.ts` | ✅ Fixed |
| X-2 | Xendit | 🟡 Medium | E-Wallet `channel_properties` hanya mengisi `success_return_url` (butuh juga `failure_return_url`) | `xendit/provider.ts` | ✅ Fixed |
| X-3 | Xendit | 🔴 High | Jalur semi-integrasi memakai **Invoice v2 (`/v2/invoices`)** yang sudah berstatus *legacy*; target migrasi resmi adalah **Payment Sessions (`/sessions`, `mode: PAYMENT_LINK`)** | `xendit/provider.ts` | ✅ Fixed |
| X-4 | Xendit | 🟡 Medium | Asumsi lama "v3 menolak objek `customer` inline" **keliru** — v3 mendukung `customer` terstruktur; yang benar adalah `customer.reference_id` wajib alfanumerik | `xendit/provider.ts` | ✅ Fixed (didokumentasikan) |
| X-5 | Xendit | 🔴 High | Payment Requests v3 memakai `channel_code: "BCA"` untuk VA; v3 menuntut **`<BANK>_VIRTUAL_ACCOUNT`** + `channel_properties.display_name`. Akibatnya **semua VA gagal** di jalur v3 (`API_VALIDATION_ERROR`) | `xendit/provider.ts` | ✅ Fixed (live) |
| X-6 | Xendit | 🔴 High | Retail outlet (Alfamart/Indomaret) dikirim `type: "PAY"` + `channel_properties.customer_name`; gateway menuntut `type: "REUSABLE_PAYMENT_CODE"` + **`payer_name`** | `xendit/provider.ts` | ✅ Fixed (live) |
| X-7 | Xendit | 🟠 High | OVO memerlukan nomor HP: v3 butuh `channel_properties.account_mobile_number`, v2 butuh `mobile_number` — keduanya tidak dikirim → OVO gagal | `xendit/provider.ts` | ✅ Fixed (live) |
| X-8 | Xendit | 🟡 Medium | `probePaymentMethods` selalu melaporkan `source: "static"`, padahal `GET /payment_channels` **bekerja** (live, 11 channel di sandbox) | `xendit/provider.ts` | ✅ Fixed (live) |
| D-1 | DOKU | 🔴 High | Endpoint convenience store non-SNAP salah: `/alfa-online/...` & `/indomaret-online/...` (resmi: `/alfa-online-to-offline/...`, `/indomaret-online-to-offline/...`) | `doku/provider.ts`, `core/canonical.ts` | ✅ Fixed |
| D-2 | DOKU | 🔴 High | Payload cstore memakai `online_info` (resmi: `online_to_offline_info`) → request pasti gagal | sama | ✅ Fixed |
| D-3 | DOKU | 🔴 High | OVO non-SNAP memakai `/ovo-payment/v2/charge` + payload generik (resmi: `/ovo-emoney/v1/payment` + `ovo_info.ovo_id` + `security.check_sum`) | sama | ✅ Fixed |
| D-4 | DOKU | 🟠 High | DANA & ShopeePay dipetakan ke endpoint non-SNAP (`/dana-payment/...`, `/shopeepay-payment/...`) yang **tidak ada** di dokumentasi (keduanya SNAP-only) | `core/canonical.ts` | ✅ Fixed |
| D-5 | DOKU | 🟠 High | `checkTransaction` mode SNAP **selalu** memakai endpoint Query QRIS, termasuk untuk transaksi VA | `doku/provider.ts` | ✅ Fixed |
| D-6 | DOKU | 🟡 Medium | Verifikasi webhook non-SNAP menghitung `Digest` dari `JSON.stringify(body)` (bukan raw bytes) → HMAC pasti gagal | `doku/provider.ts`, `doku/signature.ts` | ✅ Fixed |
| D-7 | DOKU | 🟡 Medium | SNAP QRIS mengirim `additionalInfo.feeType: 1` (number); contoh resmi memakai string `"1"` | `doku/provider.ts` | ✅ Fixed |
| D-8 | DOKU | 🟠 High | Endpoint BSI VA memakai `bsi-virtual-account`; nama kanal resmi DOKU adalah **`bsm-virtual-account`** (`bsi-...` → "No static resource"). Berlaku juga di update/delete VA | `core/canonical.ts`, `clients/doku.ts` | ✅ Fixed (live) |
| D-9 | DOKU | 🟠 High | QRIS dipetakan ke `/qris-payment/v2/generate-qr-code` yang **tidak ada** di Jokul Direct non-SNAP (daftar kanal resmi: VA, O2O, Credit Card, E-Money, Direct Debit, P2P) → QRIS bukan endpoint non-SNAP | `core/canonical.ts`, `doku/provider.ts` | ✅ Fixed (live) |
| D-10 | DOKU | 🟠 High | Permata VA mengirim `virtual_account_info.info1`; Permata menolaknya (`Invalid JSON Format`) — kanal itu memakai `ref_info` | `doku/provider.ts` | ✅ Fixed (live) |
| D-11 | DOKU | 🟠 High | BNI `merchant_unique_reference` diturunkan dari digit orderId → kolaps jadi 1 karakter & bentrok antar request ("different request data") | `doku/provider.ts` | ✅ Fixed (live) |
| D-12 | DOKU | 🟡 Medium | `expiresAt` VA diambil dari `expired_date` **compact** (`yyyyMMddHHmmss`) via `new Date()` → `Invalid Date` pada BCA/Mandiri/BNI/BRI/Danamon/BSI/Permata | `doku/provider.ts` | ✅ Fixed (live) |
| D-13 | DOKU | 🟡 Medium | Endpoint non-SNAP **DOKU VA** (`/doku-virtual-account/...`) & **Maybank VA** (`/maybank-virtual-account/...`) belum dipetakan ke kanonikal (diverifikasi live terbit VA) | `core/canonical.ts`, `types/canonical.ts` | ✅ Fixed (live) |
| D-14 | DOKU | 🟡 Medium | Peta kode channel **DOKU MCP** → kanonikal belum ada; bank pada daftar MCP (BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS) tidak dikenali SDK | `doku/mcp.ts` (baru) | ✅ Fixed |
| D-15 | DOKU | 🟠 High | `getPaymentMethods` selalu memakai katalog **statis**; DOKU MCP Server (`get_merchant_payment_methods`) menyediakan daftar channel **aktif** milik akun merchant | `doku/provider.ts`, `doku/mcp.ts` | ✅ Fixed (live) |
| D-16 | DOKU | 🔴 High | BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS **tidak punya endpoint REST non-SNAP** (semua varian `<bank>-virtual-account` → 404, diverifikasi live) — VA-nya hanya bisa diterbitkan lewat **DOKU MCP Server** `create_virtual_account_payment` (layanan VA terpadu DOKU) | `core/canonical.ts`, `doku/mcp.ts`, `doku/provider.ts` | ✅ Fixed (live 7/7) |
| D-17 | DOKU | 🟠 High | Notifikasi pembayaran VA kanal mcpOnly belum diverifikasi: format payload, signature, dan update status end-to-end (VA terbayar) perlu pembuktian live | `tests/pg-fidelity.test.ts`, `scripts/probe/doku/va-notification.ts` (baru) | ✅ Verified (live e2e) |
| I-1 | iPaymu | 🟠 High | Header `timestamp` memakai epoch milidetik; dokumentasi resmi: format `YYYYMMDDHHmmss` | `ipaymu/signature.ts` | ✅ Fixed |
| I-2 | iPaymu | 🟠 High | Direct Payment selalu mengirim `expired: 24` untuk semua channel, padahal BRI maks 2 jam, BSI maks 3 jam, BCA/Alfamart/QRIS tidak bisa dikustom | `ipaymu/provider.ts` | ✅ Fixed |
| I-3 | iPaymu | 🟡 Medium | Direct Payment tidak mengirim `successUrl`/`cancelUrl` untuk channel redirect (CC & Paylater) | `ipaymu/provider.ts` | ✅ Info |
| I-4 | iPaymu | 🟠 High | Daftar `paymentChannel` e-wallet/paylater tidak sesuai sumber resmi: `kredivo` dikirim (bukan kanal iPaymu), `ovo`/`gopay`/`linkaja` absen | `core/canonical.ts` | ✅ Fixed |
| DU-1 | Duitku | 🔴 High | POP Create Invoice memakai signature **di body** (skema SHA256 lama yang sudah *obsolete*); resmi: header `x-duitku-signature` = HMAC-SHA256, dan body tanpa field `signature` | `duitku/provider.ts`, `duitku/signature.ts` | ✅ Fixed |
| DU-2 | Duitku | 🟠 High | `createInvoice` (Direct Inquiry) tidak mengirim field Request Transaction resmi: `customerVaName` (wajib) dan `customerDetail` (wajib-efektif untuk metode credit, termasuk objek `billingAddress`) → kanal `DN`/Indodana Paylater gagal HTTP 400 berbadan kosong. Peta kanal juga salah: `indodana`→`ID` dan `alfamart`→`AL`, keduanya sudah tidak valid (HTTP 404 "Payment channel not available") | `duitku/provider.ts`, `core/canonical.ts`, `scripts/probe/duitku/channels.ts` | ✅ Fixed + Verified (live) |
| DU-3 | Duitku | 🟠 High | Sisa peta kanal basi: `gopay`→`GP`, `jenius`→`JA`, `bsi_va`→`BS`, `seabank_va`→`S1` (S1=Bank Sampoerna, bukan Seabank), `artajasa_va`→`AG` (AG=Artha Graha, bukan Artajasa), `muamalat_va`→`MY`, `akulaku`→`AT` (AT=ATOME), `kredivo`→`KV` — semuanya diverifikasi live HTTP 404. Verifikasi callback juga hanya menerima MD5 padahal dokumentasi resmi kini memakai HMAC-SHA256 | `core/canonical.ts`, `duitku/signature.ts`, `simulator/generator.ts` | ✅ Fixed + Verified (live) |
| N-1 | Nicepay | 🟠 High | Registrasi/inquiry memakai path tidak sesuai skema direct v2 (`/nicepay/direct/v2/registration`, `/nicepay/direct/v2/inquiry`) | `nicepay/provider.ts` | ✅ Fixed |
| N-2 | Nicepay | 🟡 Medium | Kode mitra Alfamart memakai `ALFA`; kode resmi grup Alfamart adalah `ALMA` | `core/canonical.ts` | ✅ Fixed |
| F-1 | Faspay | 🟢 Low | Signature debit (`sha1(md5(user_id + password + bill_no))`) **sudah sesuai** dokumentasi resmi — tidak ada perubahan | `faspay/provider.ts` | ✅ Verified |
| FP-1 | Finpay | 🔴 High | Implementasi memakai endpoint/auth/payload/signature yang **tidak sesuai** docs resmi (base `sandbox.finpay.co.id`, `merchant_id` di body, signature `merchantId%orderId%amount%key`, callback field datar) | `finpay/provider.ts`, `finpay/signature.ts`, `clients/finpay.ts`, `core/canonical.ts` | ✅ Fixed + Verified (live sandbox) |
| FP-3 | Finpay | 🟠 High | Aturan kanal yang hanya terlihat live: `mobilePhone` wajib E.164, DANA/LinkAja wajib `order.item` (+ DANA butuh `item.category`), OVO wajib `sourceOfFunds.accountId` format lokal, status awal `REQUEST_INITIATED` = pending | `finpay/provider.ts` | ✅ Fixed (verified live) |
| FP-4 | Finpay | 🟡 Medium | Cancel Order / Void belum diimplementasikan → probe tidak bisa membersihkan transaksinya sendiri | `finpay/provider.ts`, `finpay/*`, `clients/finpay.ts` | ✅ Implemented + Verified (live cancel; void reachable & fail-closed) |
| FP-2 | Prismalink | ⚪ Blocked | Gateway tidak stabil & registrasi sandbox/staging tidak dapat diakses; dokumentasi resmi juga tidak ditemukan → payload/signature belum dapat divalidasi; tidak ada perubahan kode | `prismalink/*` | ⏸ Blocked (vendor) |
| M-5 | Midtrans (BI-SNAP) | 🔴 High | Core API standar Bank Indonesia memakai domain, kredensial, endpoint, dan alur autentikasi **berbeda total** dari legacy (`api.midtrans.com/v2`); belum ada dukungan sama sekali | `midtrans/snap.ts` (baru) | ✅ Implemented |
| M-6 | Midtrans (BI-SNAP) | 🟠 High | Status transaksi SNAP bersifat **numerik** (00/01/03/04/05/06/08/09), bukan `transaction_status` tekstual | `midtrans/snap.ts` | ✅ Implemented |
| M-7 | Midtrans (BI-SNAP) | 🔴 High | Tanda tangan: access token = `SHA256withRSA(clientId \| timestamp)`, transaksi = `HMAC_SHA512(HTTPMethod:Path:Token:sha256(body):Timestamp)` | `midtrans/snap.ts`, `utils/snap.ts` (baru) | ✅ Implemented |
| M-8 | Midtrans (BI-SNAP) | 🟡 Medium | Access token berumur 900 detik → wajib di-cache agar tidak memanggil Get Token tiap request | `midtrans/snap.ts` | ✅ Implemented |
| M-9 | Midtrans (BI-SNAP) | 🟠 High | Create VA wajib `partnerServiceId` (8 karakter) + `customerNo` milik akun merchant → harus gagal cepat dengan pesan jelas, bukan mengirim request cacat | `midtrans/provider.ts` | ✅ Implemented |
| M-10 | Midtrans (BI-SNAP) | 🟠 High | Cek status memakai Status API SNAP (`qr-mpm-query` / `transfer-va/status`), bukan `GET /v2/{id}/status` | `midtrans/provider.ts` | ✅ Implemented |
| M-11 | Midtrans (BI-SNAP) | 🟠 High | Notifikasi ditandatangani **asimetris** (Midtrans public key) dengan path per-jenis (`/v1.0/qr/qr-mpm-notify`, `/v1.0/debit/notify`); VA tetap legacy | `midtrans/snap.ts`, `core/buayar.ts` | ✅ Implemented |
| M-12 | Midtrans (BI-SNAP) | 🟡 Medium | Jalur SNAP harus **opt-in** agar merchant lama tidak rusak; tanpa kredensial SNAP perilaku legacy tetap identik | `midtrans/provider.ts` | ✅ Implemented |
| I-5 | iPaymu | 🟠 High | `paymentChannel` COD diperbaiki ke arah yang salah (`rpx`) saat audit dokumen; **pengujian live** membuktikan API mengembalikan `cod` | `core/canonical.ts` | ✅ Fixed (live) |
| I-6 | iPaymu | 🟢 Low | Konflik kanal QRIS (`mpm` vs `qris`) **terjawab**: API live mengembalikan `channel.Code = "mpm"` | `core/canonical.ts` | ✅ Verified |
| M-13 | Midtrans | 🟢 Low | `probePaymentMethods` melakukan charge-probe nyata (create + cancel) — sumber live perlu dinyatakan eksplisit | `midtrans/provider.ts` | ✅ Fixed |
| M-14 | Xendit | 🟠 High | `probePaymentMethods` mengembalikan katalog **statis** tetapi dilaporkan sebagai `source: "live"` oleh manager → merchant bisa salah mengira channel sudah aktif | `xendit/provider.ts` | ✅ Fixed |
| M-15 | Midtrans | 🟠 High | Probe `ovo`/`dana`/`linkaja` gagal tanpa alasan (error di-swallow), dan Midtrans membalas 400 **generik** untuk channel yang belum diaktifkan → developer berputar-putar membetulkan payload | `midtrans/provider.ts`, `midtrans/methods.ts` | ✅ Fixed |
| I-7 | iPaymu | 🟠 High | Direct Payment tidak mengirim `product[]`/`qty[]`/`price[]` (dan dimensi item) — dokumen menjadikannya wajib untuk COD; gateway menolak **"product wajib diisi."** | `ipaymu/provider.ts` | ✅ Fixed (live) |
| I-8 | iPaymu | 🟠 High | Grup live `debitonline` dipetakan apa adanya sebagai `paymentMethod: "debitonline"` → ditolak **"Invalid payment method"**. Mapping benar: `paymentMethod: "cc"` + `paymentChannel: "debitonline"` | `core/canonical.ts`, `src/types/canonical.ts` | ✅ Fixed (live) |
| I-9 | iPaymu | 🟡 Medium | COD Direct butuh `weight[]/width[]/length[]` **dan** data pengiriman (`deliveryArea`, `deliveryAddress`, `shipping`, `shippingService`, `pickupArea`) yang tidak dimodelkan `CreateInvoiceParams` | `ipaymu/provider.ts`, `docs/ipaymu.md` | ✅ Documented |

---

## 1. Midtrans

Referensi: [Request Body (JSON Parameter)](https://docs.midtrans.com/reference/request-body-json-parameter),
[QRIS](https://docs.midtrans.com/reference/qris),
[Get Transaction Status](https://docs.midtrans.com/reference/get-transaction-status),
[Bank Transfer](https://docs.midtrans.com/docs/coreapi-core-api-bank-transfer-integration).

### M-1 — `enabled_payments` Snap bukan nilai valid

`src/providers/midtrans/provider.ts` meneruskan kode kanonikal Buayar langsung ke
`enabled_payments`:

```ts
...(methodCode ? { enabled_payments: [methodCode] } : {}),
```

Dokumen resmi menetapkan daftar nilai yang sah. Yang **berbeda** dari kode kanonikal:

| Kode kanonikal Buayar | Nilai `enabled_payments` Snap yang benar |
|---|---|
| `qris` | `other_qris` |
| `mandiri_va` | `echannel` |
| `gopay_qris` | `gopay` |
| `shopeepay_qris` | `shopeepay` |

Sisanya (`bca_va`, `bni_va`, `bri_va`, `cimb_va`, `danamon_va`, `bsi_va`, `seabank_va`,
`permata_va`, `gopay`, `ovo`, `dana`, `shopeepay`, `alfamart`, `indomaret`, `akulaku`,
`kredivo`, `credit_card`) memang identik.

> **Catatan cakupan:** sebagian besar kode kanonikal dialihkan ke **Core API** lebih dulu
> (jalur Full Integration), sehingga `enabled_payments` Snap baru terpakai saat kode
> yang dikirim bukan salah satu `CORE_API_METHODS` — umumnya lewat escape-hatch raw
> (`{ raw: "...", providerOnly: true }`). Perbaikan ini menutup celah tersebut.

**Perbaikan:** tabel map `CANONICAL_TO_MIDTRANS_SNAP` + dipakai di jalur Snap.

### M-2 — Acquirer QRIS salah

```ts
payload.qris = { acquirer: method === "shopeepay_qris" ? "shopeepay" : "gopay" };
```

Dokumen resmi hanya menyebut dua acquirer: **`gopay`** dan **`airpay shopee`**.
`"shopeepay"` tidak valid.

**Perbaikan:** `shopeepay_qris` → `"airpay shopee"`.

> **Catatan penting (premature claim):** pada Core API QRIS, **tidak ada field `qr_string`**
> di respons. Yang tersedia hanya `actions[]` berisi `generate-qr-code` /
> `generate-qr-code-v2` (URL PNG). Jadi janji "Full Integration → `qrString` EMVCo" **tidak
> bisa dipenuhi Midtrans**; yang valid adalah `qrCodeUrl`. Kode tetap membaca `qr_string`
> bila ada (mis. lewat BI-SNAP) tetapi `qrCodeUrl` yang menjadi keluaran andalan.

### M-3 — Probe Permata

`MIDTRANS_PROBE_PAYLOADS.permata` memakai `payment_type: "permata"` — tidak ada di
dokumentasi. Permata VA adalah `payment_type: "bank_transfer"` + `bank_transfer.bank = "permata"`.

### M-4 — `phone: ""`

`customer_details.phone` diisi string kosong bila pelanggan tidak punya telepon. Lebih aman
di-omit agar tidak dianggap nilai tidak valid oleh channel tertentu.

---

## 2. Xendit

Referensi: [Migrate Payment API v2 → v3](https://docs.xendit.co/docs/migrate-payment-api-v2-to-v3),
[Payments via API Overview](https://docs.xendit.co/docs/payments-via-api-overview).

### X-1 — Klaim v3, implementasi v2

Komentar kode menyebut *"Payment Requests API v3"* dan README menulis `Payments v3`, tetapi:

| Aspek | Yang dipakai kode | Yang benar untuk v3 |
|---|---|---|
| URL | `POST /payment_requests` | `POST /v3/payment_requests` |
| Header | — | `api-version: 2024-11-11` |
| Intent | `payment_method.reusability` | top-level `type: "PAY"` |
| Pemilih kanal | `payment_method.{type}.channel_code` | top-level `channel_code` |
| Properti kanal | `payment_method.{type}.channel_properties` | top-level `channel_properties` |
| Nominal | `amount` | `request_amount` |
| Status | `REQUIRES_ACTION/SUCCEEDED/FAILED` | + `ACCEPTING_PAYMENTS`, `CANCELED`, `EXPIRED`, `AUTHORIZED` |
| Aksi | `actions[].url_type/action/url` | `actions[].type/value/descriptor` (`REDIRECT_CUSTOMER` / `PRESENT_TO_CUSTOMER`) |

**Perbaikan:** jalur direct kini memakai `/v3/payment_requests` + header `api-version`,
dengan skema v3. Parser respons menangani **kedua bentuk** (v3: `channel_properties` &
`actions[].value`; v2: `payment_method.*`) supaya tahan banting. Untuk kompatibilitas
mundur, `config.extra.xenditApiVersion = "v2"` mengembalikan perilaku lama.

### X-2 — `channel_properties` E-Wallet

Xendit mensyaratkan `success_return_url`; praktik yang dianjurkan juga mengisi
`failure_return_url` agar pelanggan tidak tertahan di halaman e-wallet saat gagal.

### X-3 — Invoice v2 legacy → Payment Sessions (`/sessions`)

Halaman resmi [Migrate to Xendit's latest integration stack](https://docs.xendit.co/docs/migrating-to-xendit-s-latest-payments-stack)
(update 26 Jul 2026) menyatakan secara eksplisit:

| Jika memakai… | Pindah ke… |
|---|---|
| Payment API v2 (`/payment_methods`, `/payment_requests`) | Payments API v3 — `/v3/payment_requests` + `/v3/payment_tokens` |
| **Payment Links / Invoices (`/v2/invoices`)** | **Payment Sessions — `/sessions` (mode `PAYMENT_LINK`)** |

Legacy API "masih berfungsi" tetapi **bukan lagi tempat fitur/kanal/region baru rilis**,
dan ada pemberitahuan partner soal *"Xendit legacy API sunset on 15 September 2026"*.

**Perbaikan:** jalur semi-integrasi kini default ke `POST /sessions`
(`session_type: PAY`, `mode: PAYMENT_LINK`), membaca `payment_link_url` dari respons,
menormalisasi nomor telepon ke E.164, dan menyanitasi `customer.reference_id` agar
alfanumerik. Fallback legacy tetap tersedia lewat `config.extra.xenditRedirect = "invoice"`.
`checkTransaction` juga mengenali ID sesi (`ps-...`) via `GET /sessions/{id}`.

### X-4 — Klaim `customer` inline v3 dikoreksi

Dokumentasi lama di kode menyebut *"Payment Requests API rejects the inline `customer`
object"*. Itu berlaku untuk skema v2 generik, **bukan v3**. [API reference
`POST /v3/payment_requests`](https://docs.xendit.co/apidocs/create-payment-request)
(update 10 Sep 2026) justru mendefinisikan objek `customer` terstruktur
(`type: INDIVIDUAL`, `reference_id`, `individual_detail`). Yang menjadi kendala nyata:
`customer.reference_id` **wajib alfanumerik tanpa karakter khusus**, sedangkan `orderId`
umumnya mengandung `-`. Karena `customer` bersifat opsional pada `type: PAY`, objek itu
kini sengaja **tidak** dikirim; atribusi tetap bisa lewat `customer_id`. Komentar kode dan
laporan dikoreksi agar tidak menyesatkan.

> **`api-version` diverifikasi:** API reference menetapkan nilai valid **hanya
> `"2024-11-11"`** (bukan inferensi dari contoh), jadi nilai yang dipakai sudah benar.

### X-5 — Kode kanal VA di v3: `<BANK>_VIRTUAL_ACCOUNT`

Probe live (lihat §7) menunjukkan seluruh VA gagal di jalur v3:
*"API endpoint and method is not supported for 'BCA' channel code with country 'ID'"*.
Dokumentasi migrasi mencontohkan `channel_code: "BCA_VIRTUAL_ACCOUNT"` dengan
`channel_properties: { display_name, expires_at, virtual_account_number?, success_return_url? }`.
Diperbaiki: v3 memakai sufiks `_VIRTUAL_ACCOUNT` + `display_name`; jalur legacy v2 tetap
memakai kode polos (`BCA`) + `customer_name` (terbukti masih 11/11 hidup). Kode VA yang
sama untuk v2/v3 dipisah agar tidak saling merusak.

### X-6 — Retail outlet: `type: "REUSABLE_PAYMENT_CODE"` + `payer_name`

Di v3, OTC (Alfamart/Indomaret) dengan `type: "PAY"` ditolak:
*"channel_properties must have required property 'payer_name'"*. Mengganti `customer_name`
menjadi `payer_name` saja **berhasil**; kombinasi yang dipakai SDK adalah
`type: "REUSABLE_PAYMENT_CODE"` + `channel_properties.payer_name` (sesuai panduan migrasi
OTC, dan terbukti live). Jalur v2 tetap memakai `over_the_counter` + `customer_name`.

### X-7 — OVO butuh nomor HP (`account_mobile_number` / `mobile_number`)

OVO mewajibkan nomor HP pelanggan — v3: `channel_properties.account_mobile_number`;
v2: `channel_properties.mobile_number` (terkonfirmasi lewat pesan validasi gateway).
SDK kini mengisi keduanya dari `customer.phone` yang dinormalisasi E.164 (`toE164`).

### X-8 — Sumber daftar channel Xendit sebenarnya LIVE

`GET /payment_channels` **bekerja** untuk akun sandbox (11 channel terdaftar).
`probePaymentMethods` kini melaporkan `source: "live"` saat endpoint itu mengembalikan data,
dan `"static"` hanya jika jatuh ke katalog SDK.

---

## 3. DOKU

Referensi:
[Alfa Group (non-SNAP)](https://developers.doku.com/accept-payments/direct-api/non-snap/convenience-store/alfa-group.md),
[Indomaret (non-SNAP)](https://developers.doku.com/accept-payments/direct-api/non-snap/convenience-store/indomaret.md),
[OVO Push Payment (non-SNAP)](https://developers.doku.com/accept-payments/direct-api/non-snap/e-wallet/ovo-push-payment.md),
[QRIS (SNAP)](https://developers.doku.com/accept-payments/direct-api/snap/integration-guide/qris.md).

### D-1 / D-2 / D-4 — Convenience store & e-wallet non-SNAP

Kode sebelumnya:

```ts
alfamart:  { endpoint: "/alfa-online/v2/payment-code", ... }
indomaret: { endpoint: "/indomaret-online/v2/payment-code", ... }
ovo:       { endpoint: "/ovo-payment/v2/charge", ... }
dana:      { endpoint: "/dana-payment/v2/charge", ... }
shopeepay: { endpoint: "/shopeepay-payment/v2/charge", ... }
```

Dokumen resmi non-SNAP:

| Kanal | Endpoint resmi | Catatan payload |
|---|---|---|
| Alfamart / Alfa Group | `/alfa-online-to-offline/v2/payment-code` | `online_to_offline_info` (bukan `online_info`) |
| Indomaret | `/indomaret-online-to-offline/v2/payment-code` | `online_to_offline_info` + `indomaret_info.receipt` |
| OVO Push Payment | `/ovo-emoney/v1/payment` | `client.id`, `order`, `ovo_info.ovo_id`, `security.check_sum` |
| DANA | — | **Tidak ada** di non-SNAP (SNAP-only) |
| ShopeePay | — | **Tidak ada** di non-SNAP (SNAP-only) |

Konsekuensi lama: setiap charge Alfamart/Indomaret memakai nama body salah
(`online_info`) sehingga **tidak akan pernah** ditemukan payment code di respons
(`data.online_info.payment_code` selalu `undefined`); OVO/DANA/ShopeePay menuju
endpoint yang tidak ada. DANA & ShopeePay kini dikembalikan ke jalur Checkout
(semi-integrasi) atau SNAP bila `config.extra.snap` diaktifkan.

### D-5 — `checkTransaction` SNAP selalu Query QRIS

`snapCheckTransaction` memanggil `/snap-adapter/b2b/v1.0/qr/qr-mpm-query` dengan
`serviceCode: "47"` untuk semua transaksi. Untuk VA, endpoint & service code berbeda
(`transfer-va/status`, service code VA). Ditambahkan pemilihan endpoint berdasarkan
`config.extra.snapQueryType` (`"qr"` default, `"va"` untuk VA) dan field
`originalReferenceNo` yang wajib pada Query QRIS.

### D-6 — Digest webhook dari objek, bukan raw bytes

`verifyDokuWebhookSignature` menghitung `Digest = base64(sha256(JSON.stringify(body)))`.
Bila framework sudah mem-parse body menjadi objek, urutan key/spasi tidak lagi identik dengan
byte yang dikirim DOKU → HMAC gagal. Perbaikan: gunakan `config.rawBody` bila tersedia,
fallback ke `JSON.stringify` hanya sebagai upaya terakhir.

### D-7 — `feeType` SNAP

Contoh resmi SNAP QRIS memakai `"feeType": "1"` (string). Diubah agar konsisten string.

### D-8 … D-12 — Temuan dari probe live per-channel (2026-09-26)

Sumber: [DOKU Jokul — Virtual Account Overview](https://jokul.doku.com/docs/docs/jokul-direct/virtual-account/virtual-account-overview/),
[BNI VA](https://jokul.doku.com/docs/docs/jokul-direct/virtual-account/section/bni-va/bni-virtual-account-dgpc/),
[Permata VA](https://jokul.doku.com/docs/docs/jokul-direct/virtual-account/section/permata-va/permata-virtual-account-dgpc/),
[Jokul Direct Overview](https://jokul.doku.com/docs/docs/jokul-direct/jokul-direct-overview/).

- **D-8 (BSI):** nama `{{channel-name}}` resmi adalah **`bsm-virtual-account`**, bukan
  `bsi-virtual-account`. Live: `bsi-virtual-account` → *"No static resource"*.
- **D-9 (QRIS):** Jokul Direct **tidak punya kanal QRIS**; endpoint `/qris-payment/v2/generate-qr-code`
  hanya ada di jalur SNAP. QRIS kini ditandai `snapOnly` seperti DANA & ShopeePay.
- **D-10 (Permata):** Permata menolak `virtual_account_info.info1` → *"Invalid JSON Format"*;
  kanal itu memakai `ref_info[]`. Diverifikasi live (dengan `ref_info` → VA terbit).
- **D-11 (BNI):** `merchant_unique_reference` wajib, alfanumerik, ≤13, **unik per request**.
  Turunan dari digit orderId kolaps jadi 1 karakter dan bentrok → *"different request data"*.
- **D-12 (expiry):** `expired_date` pada respons VA berformat **compact `yyyyMMddHHmmss`**
  (bukan ISO) untuk BCA/Mandiri/BNI/BRI/Danamon/BSI/Permata → `new Date()` menghasilkan
  `Invalid Date`. Kini diutamakan `expired_date_utc` (ISO) lalu parse compact.

### D-13 … D-15 — DOKU MCP Server sebagai sumber channel **live**

**Masalah:** DOKU tidak menyediakan REST API "daftar channel", sehingga `getPaymentMethods`
hanya mengembalikan katalog statis — merchant bisa menampilkan kanal yang **tidak aktif** di
akunnya. DOKU menyediakan **MCP Server** (`tools/call` → `get_merchant_payment_methods`) yang
mengembalikan channel **yang benar-benar terdaftar** (JSON-RPC via `POST` dengan header
`Client-Id` + `Authorization: Basic <API-Key-General>:`). Dalam sandbox: **32 channel / 7 kategori**.

**Solusi (`src/providers/doku/mcp.ts`, baru):**

- `fetchDokuMerchantPaymentMethods()` — panggil MCP, ekstrak `result.content[0].text` (JSON).
- `parseDokuMcpChannels()` / `buildDokuMcpMethods()` — normalkan ke `PaymentMethod[]`.
- `mapDokuMcpChannelCode()` — peta kode MCP → kanonikal, mencakup **seluruh 17 VA** di daftar MCP
  (termasuk `VIRTUAL_ACCOUNT_BTN` → `btn_va`, `VIRTUAL_ACCOUNT_BANK_BJB` → `bjb_va`,
  `VIRTUAL_ACCOUNT_BPD_BALI` → `bpd_bali_va`, `VIRTUAL_ACCOUNT_SINARMAS`, `VIRTUAL_ACCOUNT_BANK_OCBC`,
  `VIRTUAL_ACCOUNT_BNC`, `VIRTUAL_ACCOUNT_BSS`, `VIRTUAL_ACCOUNT_DOKU`, `VIRTUAL_ACCOUNT_MAYBANK`).
- Kredensial dari `extra.mcpApiKey` (diisi otomatis dari `DOKU_MCP_API_KEY`/`DOKU_API_KEY`;
  API Key "General" ini **berbeda** dari Secret Key `SK-...`) dan `extra.mcpUrl`.

`DokuProvider.getPaymentMethods()` kini **MCP-first**: bila kredensial MCP ada dan MCP membalas
data, hasilnya ditandai `rawResponse.source === "mcp"` (daftar **LIVE**); jika tidak, jatuh ke
katalog statis (`rawResponse` berupa array channel). `probePaymentMethods()` melaporkan
`source: "live"` **hanya** bila MCP berhasil, `"static"` bila fallback — konsisten dengan
prinsip M-14 (jangan menyebut katalog statis sebagai live).

**D-13 — endpoint VA baru (diverifikasi live):** bank dari daftar MCP diuji sebagai *endpoint
existence probe* (POST minimal ke `/{channel}-virtual-account/v2/payment-code` dengan signature DOKU).
Hasil: `doku-virtual-account` ✅ (`VA=8000000000024660`) & `maybank-virtual-account` ✅
(`VA=7867590000000338`) → ditambahkan ke `CANONICAL_TO_DOKU` + union `CanonicalPaymentMethod`.
Sebaliknya `btn/bjb/bpd-bali/sinarmas/ocbc/bnc/bss-virtual-account` → **404** (lihat D-16).

### D-16 — VA BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS hanya lewat **DOKU MCP Server**

**Pertanyaan:** apa penamaan kanal non-SNAP DOKU untuk ketujuh bank tersebut?

**Jawaban (diverifikasi live 2026-09-26):** **tidak ada**. Semua varian penamaan diuji sebagai
*endpoint existence probe* — `btn-virtual-account`, `bjb-virtual-account`, `bpd-bali-virtual-account`,
`sinarmas-virtual-account`, `ocbc-virtual-account`, `bnc-virtual-account`, `bss-virtual-account`,
plus varian `nispel-`, `bank-bjb-`, `bpd-bali-bjb-` — semuanya konsisten **404 "No static resource"**.
Dokumentasi resmi mengonfirmasi: `llms.txt` developers.doku.com kini hanya mencantumkan halaman VA
tersebut di bawah jalur **SNAP BI** (`/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va`), dan
bagian *Non-SNAP / Jokul Direct* tidak lagi memiliki VA sama sekali (overview lama hanya memuat 9 bank:
BCA, Mandiri, BSI, DOKU, BRI, CIMB, Permata, BNI, Danamon).

**Jalur non-SNAP mereka adalah layanan VA terpadu DOKU yang diekspos lewat DOKU MCP Server** —
tool `create_virtual_account_payment` (parameter `channel` menentukan bank tujuan), dengan respons
berbentuk VA BI-SNAP (`virtualAccountData.virtualAccountNo` + `howToPayPage` per bank). Ketujuh
channel diverifikasi **live** dan VA sandbox benar-benar terbit (`responseCode 2002700`):

| Bank | Kode channel MCP | VA sandbox terbit | `howToPayPage` |
|---|---|---|---|
| BTN | `VIRTUAL_ACCOUNT_BTN` | `9596260000000043838` | `/virtual-account/btn/` |
| BJB | `VIRTUAL_ACCOUNT_BANK_BJB` | `12000000000000000685` | `/bank_bjb/` |
| BPD Bali | `VIRTUAL_ACCOUNT_BPD_BALI` | `9890051000000043` | `/bpd_bali/` |
| Sinarmas | `VIRTUAL_ACCOUNT_SINARMAS` | `8890100000000299` | `/sinarmas/` |
| OCBC | `VIRTUAL_ACCOUNT_BANK_OCBC` | `1559900000000056` | `/ocbc/` |
| BNC | `VIRTUAL_ACCOUNT_BNC` | `9034153700000690` | `/bnc/` |
| BSS | `VIRTUAL_ACCOUNT_BSS` | `6000100000012745` | `/bss/` |

**Solusi SDK:**

- `CANONICAL_TO_DOKU`: tujuh kanal baru `btn_va`, `bjb_va`, `bpd_bali_va`, `sinarmas_va`,
  `ocbc_va`, `bnc_va`, `bss_va` dengan flag **`mcpOnly: true`** (union `CanonicalPaymentMethod`
  diperluas; sudah dikenali sejak D-14).
- `mcp.ts`: `DOKU_MCP_ONLY_VA_CHANNELS` (kanonikal → kode channel MCP), `callDokuMcpTool()`
  (panggilan `tools/call` generik), `createDokuMcpVirtualAccount()` (amount diformat `"10000.00"`).
- `provider.ts`: `createInvoice` kanal `mcpOnly` dirutekan ke `createMcpVaInvoice()` (terbitkan VA
  via MCP, normalisasi `virtualAccountData` → `InvoiceResponse` `mode: "va"` dengan `vaNumber`,
  `vaBank`, `paymentUrl = howToPayPage`, `expiresAt`); `updateVirtualAccount`/`deleteVirtualAccount`
  dirutekan ke tool MCP `update_virtual_account_payment`/`delete_virtual_account_payment`.
- Tanpa kredensial MCP → error jelas yang menyebut fallback SNAP/Checkout (tanpa panggilan REST).

### D-17 — verifikasi notifikasi pembayaran VA kanal mcpOnly

**Format notifikasi:** pembayaran VA DOKU SNAP memakai satu format yang sama untuk **seluruh 17 bank**
VA (termasuk 7 kanal mcpOnly) — `POST` ke Notification URL merchant (dikonfigurasi per channel di
DOKU Back Office: *Settings → Payment Settings → Virtual Account SNAP → CONFIGURE*) dengan header
`X-TIMESTAMP`, `X-SIGNATURE` (HMAC-SHA512 `clientSecret` atas
`POST:path::sha256(rawBody):timestamp`, AccessToken kosong) dan body BI-SNAP:
`partnerServiceId`, `customerNo`, `virtualAccountNo`, `trxId` (= invoice merchant),
`paidAmount.value`. Jalur **non-SNAP** memakai format lain (`transaction.status`, `order.invoice_number`,
signature header `Signature: HMACSHA256=...`) — keduanya sudah didukung `DokuProvider.verifyCallback`
(D-5/D-6 + `verifySnapCallback`), fail-closed tanpa signature.

**Tidak ada API simulasi pembayaran di DOKU MCP** (35 tool, tanpa `simulate_*`). Simulasi dilakukan
lewat **Payment Simulator sandbox DOKU** (`sandbox.doku.com/integration/simulator/` → backend
`/doku/simulator/v1/...`) yang meniru inquiry→payment bank dan memicu notifikasi DOKU. Dari 7 bank,
hanya **BTN** (`btn/inquiry` → `btn/payment`) dan **BNC** (`bnc/payment-notification`) yang punya kanal
simulator; BJB, BPD Bali, Sinarmas, OCBC, BSS belum ada di simulator sandbox DOKU.

**Probe live end-to-end (`scripts/probe/doku/va-notification.ts`, 2026-09-26):** create VA via MCP →
cek status `PENDING` (via MCP `get_transaction_by_invoice_number`) → simulasi bayar via simulator →
cek status akhir. Hasil:

| Bank | VA terbit | Simulasi bayar | Status akhir |
|---|---|---|---|
| BTN | `9596260000000043843` | ✅ `2002500 Successful` | ✅ **SUCCESS** |
| BNC | `9034153700000691` | ✅ `Success Payment (00)` | ✅ **SUCCESS** |
| BJB, BPD Bali, Sinarmas, OCBC, BSS | ✅ 5/5 terbit | ⏸️ tidak ada simulator kanal | `PENDING` (tertrack) |

Alur inquiry → payment → update status **terbukti hidup end-to-end** untuk BTN & BNC; VA kelima bank
lain terbit & tertrack dengan benar (status PENDING), hanya pembayaran mereka yang tidak bisa
disimulasikan tanpa akses simulator kanal (perlu uji manual lewat m-banking asli/ke sandbox produksi
bank, atau tunggu DOKU menambah kanal simulator).

**Kit uji manual 5 bank tanpa simulator (BJB, BPD Bali, Sinarmas, OCBC, BSS):**

1. Terbitkan VA + panduan bayar per bank:
   `DOKU_CLIENT_ID=... DOKU_API_KEY=... bun run scripts/probe/doku/va-manual.ts`
   — VA, nominal, masa berlaku, link `howToPayPage`, dan state sesi (`doku-va-manual-state.json`).
   Polling status otomatis via MCP `get_transaction_by_invoice_number` sampai SUCCESS;
   jalankan ulang dengan `RESUME=1` untuk polling lanjutan tanpa membuat VA baru.
2. Receiver notifikasi (verifikasi webhook fail-closed + log JSONL):
   `DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... bun run scripts/probe/doku/notification-receiver.ts`
   lalu ekspos ke internet (mis. `ssh -R 80:localhost:4571 nokey@localhost.run`) dan isi URL-nya
   ke DOKU Back Office → Settings → Payment Settings → Virtual Account SNAP → CONFIGURE.
3. Bayar VA lewat kanal bank asli sesuai `howToPayPage`; status ter-update otomatis di polling
   (step 1) dan notifikasi terverifikasi di receiver (step 2).

Sesi uji manual 2026-09-26: 5/5 VA terbit (BJB `12000000000000000687`, BPD Bali `9890051000000045`,
Sinarmas `8890100000000301`, OCBC `1559900000000058`, BSS `6000100000012747`) @ Rp 10.000, semua
PENDING menunggu pembayaran kanal bank asli.

**Test regresi (D-17):** notifikasi SNAP VA dengan signature HMAC valid → `isPaid` + `orderId` +
`amount`; signature palsu → fail-closed; notifikasi non-SNAP tanpa signature → fail-closed.

---

## 4. iPaymu

Referensi: [Introduction](https://docs.ipaymu.com/en/docs),
[Signature Generation](https://docs.ipaymu.com/en/docs/signature),
[Direct Payment](https://docs.ipaymu.com/en/docs/payment/direct-payment),
[Redirect Payment](https://docs.ipaymu.com/en/docs/payment/redirect-payment),
[Payment Channels](https://docs.ipaymu.com/en/docs/payment/payment-channels).

### I-1 — Format `timestamp`

Dokumentasi: *"Current timestamp (format: YYYYMMDDHHmmss …)"*. Kode lama memakai
`Date.now().toString()` (epoch milidetik, 13 digit). Diperbaiki menjadi `YYYYMMDDHHmmss`
(zona WIB/UTC+7).

### I-2 — `expired: 24` untuk semua channel

Dokumen Direct Payment menyatakan: **BSI VA max 3 jam, BRI VA max 2 jam, BCA VA tidak bisa
dikustom (default 12 jam), Alfamart tidak bisa dikustom (24 jam), QRIS tidak bisa dikustom
(default 5 menit)**. Kode lama selalu mengirim `{ expired: 24, expiredType: "hours" }`.
Diperbaiki: nilai dapat diatur via `params.extra.expiredHours` / `config.extra.expiredHours`,
di-clamp per channel, dan **di-omit** untuk channel yang tidak boleh dikustom.

### I-3 — URL redirect channel CC / Paylater

Direct Payment mendukung `successUrl` & `cancelUrl` untuk channel yang butuh redirect
(Credit Card, Akulaku). Nilai `returnUrl` kini diteruskan sebagai `successUrl`/`cancelUrl`
untuk channel tersebut.

> **Catatan (belum diubah, perlu klarifikasi vendor):** daftar resmi `paymentChannel`
> untuk `ewallet` pada tabel dokumentasi hanya `dana` & `shopeepay`, sedangkan SDK resmi
> iPaymu (Golang) menyebut `OVO`, `DANA`, `GoPay`, `LinkAja`, `ShopeePay`. Buayar saat ini
> mengikuti SDK resmi (lebih permisif); mohon dikonfirmasi ke iPaymu sebelum dipersempit.

### I-7 — Direct Payment wajib mengirim `product`/`qty`/`price` (+ dimensi item)

Dokumentasi [Direct Payment](https://docs.ipaymu.com/en/docs/payment/direct-payment) mencantumkan
`product[]`, `qty[]`, `price[]` sebagai parameter body (WAJIB untuk COD; contoh resmi bahkan
menyertakannya untuk VA). Payload Direct lama hanya mengirim `comments`, sehingga charge COD
ditolak: **"product wajib diisi."**. Diperbaiki: rincian item kini selalu dikirim pada jalur
Direct, diturunkan dari `params.items` bila ada, atau dari `productDetails`/`amount` sebagai
single-item. Dimensi `weight[]`/`width[]`/`length[]`/`height[]` ikut dikirim bila **semua** item
mendefinisikannya (iPaymu mencocokkan indeks array).

### I-8 — Debit Online: `cc` + `debitonline`, bukan `paymentMethod: "debitonline"`

`GET /api/v2/payment-channels` mengembalikan grup `debitonline` (channel `debitonline`). Mengirim
`paymentMethod: "debitonline"` **ditolak** gateway dengan *"Invalid payment method"* — `debitonline`
bukan nilai `paymentMethod` resmi. Pengujian live membuktikan kombinasi yang diterima adalah
`paymentMethod: "cc"` + `paymentChannel: "debitonline"` (beserta `successUrl`/`cancelUrl`).
Mapping kanonikal `debitonline → { cc, debitonline }` ditambahkan, plus fallback untuk kode
mengandung `debit`.

### I-9 — Prasyarat COD Direct Payment (data pengiriman)

Setelah I-7, charge COD melewati validasi `product` dan berhenti di **"weight wajib diisi."**;
dengan dimensi + data pengiriman lengkap, error bergeser ke **"Pickup area not registered"** —
sebuah konfigurasi akun merchant (area pickup belum terdaftar), **bukan** cacat payload.
Kebutuhan COD yang tidak dimodelkan SDK (`deliveryArea`, `deliveryAddress`, `shipping`,
`shippingService`, `pickupArea`) dipasok lewat `items` (dimensi) + `providerParams` (pengiriman)
— didokumentasikan di [`docs/ipaymu.md`](./ipaymu.md#6-logistik-cod-cash-on-delivery).

---

## 5. Gelombang 2 — Duitku, Nicepay, Faspay, Finpay, Prismalink

### DU-1 — Signature POP Duitku (header HMAC, bukan body)

Referensi: [Duitku POP — Create Invoice](https://docs.duitku.com/pop/en/).

Endpoint resmi POP: `POST https://api-prod.duitku.com/api/merchant/createInvoice`
(sandbox: `https://api-sandbox.duitku.com/api/merchant/createInvoice`).

| Header/Field | Nilai resmi |
|---|---|
| `x-duitku-timestamp` | UNIX epoch **milidetik** (zona Jakarta) |
| `x-duitku-signature` | `HMAC_SHA256(merchantCode + timestamp, apiKey)` → hex |
| `x-duitku-merchantcode` | merchant code |
| body POP | **tanpa** field `signature`/`merchantCode` |

Dokumen eksplisit menyatakan *"The previous signature SHA256 method has been obsolete."*
Kode lama mengirim `signature` (MD5/sha256 atas body) di dalam body POP → request ditolak.
Ditambahkan `getDuitkuPopSignature()` dan header di atas; field `signature` dihapus dari
body POP. Jalur legacy `webapi/.../v2/inquiry` (signature MD5 pada body) **tetap** dipertahankan.

### DU-2 — Field Request Transaction yang hilang & peta kanal FT/DN/LQ

Referensi: [Duitku API — Request Transaction](https://docs.duitku.com/api/en/)
(tabel *Payment Method* & *HTTP Code*).

Probe live 2026-09-27 menemukan 3 kanal gagal: `FT`, `DN`, `LQ`. Hasil penyelidikan terhadap
dokumentasi resmi & sandbox:

| Kode | Nama resmi | Penyebab | Tindakan |
|---|---|---|---|
| `FT` | RETAIL (Pegadaian/ALFA/Pos) | HTTP 500 "Failed to generate payment number Retail" untuk semua nominal & kombinasi field → hambatan provider, tidak dapat digenerate untuk akun ini | diklasifikasikan `expected` di probe |
| `DN` | INDODANA PAYLATER | SDK tidak mengirim `customerDetail` (dan `billingAddress`-nya) sehingga Duitku membalas HTTP 400 berbadan kosong; setelah dikirim, validasi lolos → HTTP 500 "Failed to generate Indodana payment Url" (paylater belum ter-provision) | field dikirim; sisa kegagalan provider-side → `expected` |
| `LQ` | LINKAJA QRIS | Sudah dihapus Duitku (changelog Jan 2025 "Remove payment channel QRIS Link Aja") tetapi sandbox masih mencantumkannya di `getpaymentmethod`; inquiry selalu HTTP 500 "Failed to generate QR String LinkAja" | diklasifikasikan `expected` di probe |

Yang diperbaiki di SDK:

1. `createInvoice` Direct Inquiry kini mengirim `customerVaName` (dipotong 20 karakter sesuai
tabel parameter Duitku), `customerDetail` (beserta `billingAddress` — wajib-efektif untuk
`DN`, walaupun dokumentasi menandai alamat opsional), dan `itemDetails` bila merchant
menyediakan `params.items` (agar jumlahnya konsisten dengan `paymentAmount`).
2. Peta kanonikal diperbaiki: `indodana` → `DN` (sebelumnya `ID`) dan `alfamart` → `FT`
(sebelumnya `AL`). Diverifikasi live: `ID`/`AL` → HTTP 404 "Payment channel not available".
3. `scripts/probe/duitku/channels.ts` menandai kanal hambatan provider (`FT`/`DN`/`LQ`)
sebagai `expected` beserta alasan, agar tidak tampak seperti bug permintaan SDK.

Hasil live akhir: **24/27 diterima · 3 expected · 0 gagal** (semua kanal lain tidak
terpengaruh oleh field tambahan).

### DU-3 — Peta kanal basi & signature callback dua-skema

Referensi: [Duitku API — Payment Method](https://docs.duitku.com/api/en/) (tabel
*Payment Method* & changelog "signature enhancement using HMAC").

**Peta kanal.** Beberapa kode kanonikal masih menunjuk kode Duitku yang sudah tidak ada
(atau menunjuk kanal yang salah). Diverifikasi live 2026-09-27:

| Kanonikal | Kode lama | Kode benar | Catatan live |
|---|---|---|---|
| `gopay` | `GP` | — (tidak ada) | `GP` → 404; Duitku tidak punya GoPay |
| `jenius` | `JA` | `JP` | `JA` → 404, `JP` → 200 |
| `bsi_va` | `BS` | `BV` | `BS` → 404, `BV` → 200 |
| `seabank_va` | `S1` | — (S1=Sampoerna) | `S1` → 200 tapi itu **Bank Sampoerna**, bukan Seabank |
| `artajasa_va` | `AG` | — (AG=Artha Graha) | `AG` → 200 tapi itu **Bank Artha Graha** |
| `muamalat_va` | `MY` | — (tidak ada) | `MY` → 404 |
| `akulaku` | `AT` | — (AT=ATOME) | `AT` → 404; `AT` resmi untuk ATOME |
| `kredivo` | `KV` | — (tidak ada) | `KV` → 404 |
| `maybank_va` | (belum ada) | `VA` | `VA` → 200 |
| `bnc_va` | (belum ada) | `NC` | `NC` → 200 |

`CANONICAL_TO_DUITKU`/`DUITKU_TO_CANONICAL` diperbaiki; entri yang menunjuk kanal tak ada
dihapus dan `maybank_va`/`bnc_va` ditambahkan. `DM` (Danamon) resmi tetapi belum aktif untuk
akun ini (404) — dibiarkan dengan catatan.

**Signature callback.** Dokumentasi kini memakai
`HMAC_SHA256(merchantCode + amount + merchantOrderId, apiKey)`, sedangkan SDK hanya menerima
`MD5(merchantCode + amount + merchantOrderId + apiKey)`. `verifyDuitkuCallbackSignature`
kini menerima **kedua skema** (HMAC lebih dulu, lalu MD5 sebagai fallback transisi) dan
menolak bila `signature`/`apiKey` kosong. Simulator webhook Duitku diubah menghasilkan
HMAC-SHA256 (skema saat ini). Fail-closed tetap terjaga: kedua skema memerlukan `apiKey`,
dan `resultCode` tetap tidak ikut ditandatangani sehingga `isPaid` tetap tidak pernah `true`
dari callback.

### N-1 / N-2 — Nicepay direct v2 & kode mitra Alfamart

Referensi: [Nicepay — Direct API](https://docs.nicepay.co.id/).

- Endpoint terpadu non-SNAP: `POST /nicepay/direct/v2/registration` dan
  `POST /nicepay/direct/v2/inquiry`.
- `merchantToken = SHA256(timeStamp + iMid + referenceNo + amt + merchantKey)`;
  `timeStamp` berformat `YYYYMMDDHH24MISS`.
- `mitraCd` Alfamart resmi = **`ALMA`** (sebelumnya `ALFA`).
- Field wajib lain: `billingAddr`/`billingCity`/`billingState`/`billingPostCd`/`billingCountry`,
  `cartData`, `userIP`, `dbProcessUrl`.
- Respons status numerik (mis. `3` = unpaid), `resultCd` (`0000` = sukses).

### F-1 — Faspay (terverifikasi, tanpa perubahan)

Referensi: [Faspay — POST Data Transaction](https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction/post-data-transaction).
Signature debit `sha1(md5(user_id + password + bill_no))` yang dipakai kode **sudah cocok**
dengan dokumentasi resmi.

### FP-1 — Finpay (fixed) — dokumentasi resmi ditemukan

Referensi: [docs.finpay.id](https://docs.finpay.id/api-reference/finpay-pg/) —
[Authorization & Headers](https://docs.finpay.id/api-reference/finpay-pg/authorization-and-headers.md),
[Hosted Payment](https://docs.finpay.id/api-reference/finpay-pg/hosted-payment.md),
[Initiate VA](https://docs.finpay.id/api-reference/finpay-pg/core-api/virtual-account/close-payment/initiate-virtual-account.md),
[Status Check](https://docs.finpay.id/api-reference/finpay-pg/after-payment/status-check-payment-gateway.md),
[Notification Callback](https://docs.finpay.id/api-reference/finpay-pg/after-payment/notification-callback.md),
[Source Of Funds List](https://docs.finpay.id/api-reference/appendix/enumeration/source-of-funds-list.md).

Temuan: kode lama memakai kontrak yang **sama sekali berbeda** dari API resmi.

| Aspek | Kode lama (salah) | Dokumentasi resmi | Perbaikan |
|---|---|---|---|
| Base URL | `https://sandbox.finpay.co.id` / `https://api.finpay.id` | `https://devo.finnet.co.id` / `https://live.finnet.co.id` | ✅ |
| Auth | `merchant_id` + `signature` di body | `Authorization: Basic base64(merchantId:merchantKey)` | ✅ |
| Create | `POST /pg/payment/direct` (flat) | `POST /pg/payment/card/initiate` (nested `{order,customer,url,sourceOfFunds}`) | ✅ |
| Sukses | `status`/`response_code` bervariasi | `responseCode === "2000000"` | ✅ |
| Status | `POST /pg/payment/status` | `GET /pg/payment/card/check/{orderId}` | ✅ |
| Callback | field datar `order_id`/`payment_status` | bersarang `order.id`, `result.payment.status` | ✅ |
| Signature | `HMAC-SHA512("merchantId%orderId%amount%merchantKey")` | `HMAC-SHA512(json_encode(body tanpa signature), Merchant Key)` | ✅ |
| Kanal | kode buatan (`BCA`, `QRIS`, …) | SOF ID resmi (`vabca`, `qris`, `idm`, `cc`, …) | ✅ |

Caller diperbarui: `FinpayClient`, `simulator/generator.ts` (callback bersarang bertanda tangan),
`providerRegistry` (deteksi payload `order.id` + `result.payment.status`), dan test.
Regresi baru: `tests/finpay.test.ts` + blok **FP-1** di `tests/pg-fidelity.test.ts`.

**Verifikasi live (akun sandbox merchant)** — `scripts/probe/finpay/channels.ts`: **19/20 lolos · 1 diharapkan · 0 gagal**.
Probe membersihkan dirinya sendiri lewat **Cancel Order** (`GET /pg/payment/card/cancel/{orderId}`,
FP-4): **8/13 transaksi dibatalkan**; QRIS & e-wallet menolak cancel pada status awal
(`4040100 Invalid Transaction Status`) sehingga ditandai *expected* dan kedaluwarsa sendiri.

**Void live (`PROBE_VOID=<orderId>`):** endpoint `GET /pg/payment/card/void/{orderId}` terbukti
**reachable & terautentikasi**; pada order belum dibayar ia menjawab `4030015 Transaction Not Permitted`
yang dipetakan ke `success:false` (fail-closed) tanpa mengubah status. Jalur sukses Void butuh order
yang benar-benar sudah dibayar — sandbox Finpay tidak menyediakan simulator pembayaran (simulator
legacy `sandbox.finpay.co.id/simdev` hanya untuk platform bill-hosting lama).

| Kanal | SOF | Hasil live |
|---|---|---|
| bca_va / bni_va / bri_va / mandiri_va / permata_va | vabca / vabni / vabri / vamandiri / vapermata | ✅ VA terbit |
| qris | qris | ✅ string QR terbit |
| alfamart | alfamart | ✅ paymentCode terbit |
| ovo / dana / shopeepay / linkaja | ovo / dana / shopeepay / linkaja | ✅ setelah fix `accountId`/`order.item` |
| credit_card | cc | ✅ redirect URL |
| hosted (tanpa method) | — | ✅ redirect URL |
| indomaret | idm | ⏭️ `Feature Not Allowed` (kanal belum aktif di akun) |

Temuan live tambahan (**FP-3**): `customer.mobilePhone` wajib berformat E.164 (fix:
`normalizeFinpayPhone`), DANA & LinkAja wajib `order.item` (DANA juga wajib
`item.category`), OVO wajib `sourceOfFunds.accountId` format lokal `0…`, dan status awal
status-check `REQUEST_INITIATED` berarti `pending`. Semua sudah diperbaiki + diuji.

Sisa opsional: aktifkan kanal Indomaret, dan implementasikan Cancel/Void agar probe bisa
membersihkan transaksinya sendiri.

### FP-2 — Prismalink (blocked oleh pihak vendor)

Terblokir bukan karena kurang riset, melainkan karena **kondisi vendor**:

1. **Gateway Prismalink (VALINK) saat ini kurang stabil** sehingga tidak dapat diandalkan untuk pengujian.
2. **Registrasi untuk mengakses sandbox/staging tidak dapat dilakukan** — tidak ada jalur untuk memperoleh akun uji.
3. **Dokumentasi API resmi tidak ditemukan** lewat pencarian, sehingga spesifikasi payload, signature, dan daftar kanal belum dapat dipastikan.

Sesuai prinsip "jangan menebak payload", **tidak ada perubahan kode** pada kode warisan.
Satu-satunya jaminan saat ini adalah webhook **fail-closed** (`tests/webhook-security.test.ts`).

Pembuka blokir: akses sandbox/staging yang stabil, dokumentasi API resmi, atau akun merchant
+ dukungan teknis Prismalink.

### I-4 / I-5 / I-6 — Konfirmasi `paymentChannel` e-wallet/paylater iPaymu

Sumber: [iPaymu — Payment Channels](https://docs.ipaymu.com/en/docs/payment/payment-channels),
SDK resmi [ipaymu-go-api `constanta.go`](https://github.com/ipaymu/ipaymu-go-api) (v0.2.0),
dan **API live** `GET /api/v2/payment-channels` (sandbox, lihat §7).

| Grup | Kanal (tabel API docs) | SDK resmi Go | Hasil verifikasi **live** |
|---|---|---|---|
| VA | `bag, bca, bpd_bali, bni, cimb, mandiri, bmi, bri, bsi, permata, danamon, btn` | — | `danamon, cimb, bca, permata, bmi, bni, mandiri, bri, bag, btn` |
| C-Store | `alfamart, indomaret` | — | `alfamart, indomaret` |
| E-Wallet | `dana, shopeepay` | `ovo`, `gopay`, `linkaja` | `dana, shopeepay` (group `ewallet-asia` kosong) |
| QRIS | `mpm` | `qris` | **`mpm`** (group `qris`) |
| Paylater | `akulaku` | — | `akulaku` |
| COD | `rpx` | `rpx` | **`cod`** |
| CC / Debit | `cc` | — | `cc`, `debitonline` |

Perubahan `core/canonical.ts`: menambah `ovo`/`gopay`/`linkaja` (permisif — merchant yang
mengaktifkannya bisa langsung memakai), **menghapus** `kredivo` (bukan kanal iPaymu — jatuh
ke mode Semi-Integrasi), dan COD memakai `paymentChannel: "cod"` dengan `rpx` tetap diterima
sebagai alias eksplisit.

> **Selesai:** pertanyaan lama "QRIS `mpm` atau `qris`?" kini **terjawab** — API live
> mengembalikan `channel.Code = "mpm"`, jadi tabel dokumentasi benar dan konstanta SDK Go
> (`qris`) tidak dipakai.

---

## 6. Midtrans BI-SNAP Core API — implementasi (M-5 … M-12)

Referensi: [Overview BI-SNAP](https://docs.midtrans.com/reference/core-api-snap-open-api-overview),
[Moving to BI-SNAP](https://docs.midtrans.com/reference/moving-to-snap-based-core-api),
[Signature Generation](https://docs.midtrans.com/reference/signature-generation),
[Access Token API](https://docs.midtrans.com/reference/access-token-api),
[MPM / QRIS](https://docs.midtrans.com/reference/mpm-api-qris),
[Bank Transfer / VA](https://docs.midtrans.com/reference/virtual-account-api-bank-transfer).

> *"As regulated by Bank Indonesia, merchants will need to integrate to BI-SNAP-based Core API."*

### Ringkasan perbedaan vs legacy

| Aspek | Legacy Core API | BI-SNAP Core API |
|---|---|---|
| Domain | `api(.sandbox).midtrans.com` | `merchants.sbx.midtrans.com` / `merchants.midtrans.com` |
| Auth | Server Key (Basic Auth) | `X-CLIENT-KEY` + `X-PARTNER-ID` + `SHA256withRSA` → access token, lalu `HMAC_SHA512` per call |
| Path | `/v2/charge`, `/v2/{id}/status` | `/{version}/{service-group}/{operation}`, mis. `/v1.0/qr/qr-mpm-generate` |
| Status | `transaction_status` tekstual | numerik: `00` success, `01` initiated, `03` pending, `04` refunded, `05` canceled, `06` failed, `08` expiry, `09` rejected |
| Notifikasi | satu URL untuk semua | path per-jenis: `/v1.0/debit/notify`, `/v1.0/qr/qr-mpm-notify` (VA tetap legacy) |

### Yang diimplementasikan

- `src/utils/snap.ts` — primitif BI-SNAP generik (timestamp, `sha256Hex`, signature simetris/asimetris).
  Primitif ini kini **dipakai bersama** adapter DOKU SNAP (tidak lagi diduplikasi).
- `src/providers/midtrans/snap.ts` — konstanta domain/path, resolver kredensial,
  `MidtransSnapClient` (cache access token 900 detik), body builder & parser QRIS + VA,
  mapping status numerik, dan verifikasi notifikasi asimetris.
- `src/providers/midtrans/provider.ts` — routing opt-in di `createInvoice` (VA bank & QRIS MPM),
  `checkTransaction` lewat Status API SNAP, dan `verifyCallback` untuk notifikasi SNAP.
- `src/core/buayar.ts` — ekstraksi header `X-SIGNATURE`/`X-TIMESTAMP` untuk verifikasi notifikasi.

### Cara mengaktifkan

```ts
new Buayar({
  provider: "midtrans",
  serverKey: "SB-Mid-server-...", // tetap dipakai jalur legacy
  sandbox: true,
  extra: {
    snap: true,
    snapClientId: "...",          // X-CLIENT-KEY (dari Midtrans)
    snapClientSecret: "...",      // kunci HMAC transaksi (dari Midtrans)
    snapPartnerId: "...",         // X-PARTNER-ID (dari Midtrans)
    snapPrivateKey: "-----BEGIN PRIVATE KEY-----...",
    snapMerchantId: "M001234",
    snapPartnerServiceId: "1234", // hanya untuk VA
    snapCustomerNo: "0000000000", // hanya untuk VA
    // snapQueryType: "va" | "qris"  (default "qris")
    // snapNotificationPath + snapMidtransPublicKey untuk verifikasi notifikasi
  },
});
```

Tanpa `extra.snap`/kredensial SNAP, seluruh jalur legacy berjalan persis seperti sebelumnya
(dijaga oleh test `M-12`).

> **Belum diverifikasi (butuh akun merchant SNAP):** nilai `additionalInfo.bank` per bank pada
> Create VA, serta field status pada respons VA (`latestTransactionStatus` dibaca dari root
> maupun `virtualAccountData` sebagai upaya defensif). Keduanya perlu satu kali uji sandbox.

---

## 7. Verifikasi Live — daftar channel & laporan gabungan probe

Skrip: `scripts/probe/check.ts`

```bash
bun scripts/probe/check.ts                      # semua provider
bun scripts/probe/check.ts ipaymu               # provider tertentu
RAW=1 bun scripts/probe/check.ts ipaymu         # dump kode channel mentah
LIVE_PROBE=1 bun scripts/probe/check.ts midtrans # probe channel aktif
```

### CLI terpadu — semua probe provider sekaligus

`scripts/probe/all.ts` (alias `bun run probe`) menjalankan **semua** probe per-channel
(`probe-midtrans-channels.ts`, `probe-ipaymu-channels.ts`, `probe-xendit-channels.ts`,
`probe-doku-channels.ts`) berurutan dengan `PROBE_JSON=1`, lalu mencetak **tabel manusia +
ringkasan JSON**. Provider yang kredensialnya tidak diset akan **dilewati** (bukan error),
sehingga aman dijalankan di lingkungan mana pun.

```bash
bun run probe                       # semua provider yang kredensialnya tersedia
bun run probe midtrans doku         # provider tertentu
PROBE_PROVIDERS=xendit bun run probe
PROBE_JSON=1 bun run probe          # hanya ringkasan JSON (dipakai CI)
```

Ringkasan JSON berbentuk `{ totals: { tested, passed, expected, failed }, providers: [...] }`,
di mana tiap `providers[i]` adalah `ProbeSummary` (`provider`, `source`, `tested`, `passed`,
`expected`, `failed`, `skipped`, `reason`, `results[]`, `sideEffects`). Setiap skrip probe juga
bisa dijalankan sendiri dengan `PROBE_JSON=1` untuk mengeluarkan baris penanda
`__PROBE_JSON__<json>` yang diekstrak CLI terpadu (helper: `scripts/probe/lib.ts`).

### Matriks sumber daftar channel

| Provider | `getPaymentMethods` | Sumber "channel aktif" | Catatan |
|---|---|---|---|
| **iPaymu** | **LIVE** `GET /api/v2/payment-channels` | live (`source: "live"`) | Memfilter `FeatureStatus != active` / `HealthStatus != online` |
| **Midtrans** | statis (`MIDTRANS_STATIC_METHODS`) | live via `probePaymentMethods` (charge-probe + cancel) | 1 request `/charge` per channel; `probePaymentMethodsDetailed()` memberi alasan per channel |
| **Xendit** | **LIVE** `GET /payment_channels` (fallback statis) | `source: "live"` bila endpoint berhasil, `"static"` bila fallback katalog | 11 channel terdaftar di sandbox; charge-probe: `scripts/probe/xendit/channels.ts` |
| **DOKU** | **LIVE** via DOKU MCP Server `get_merchant_payment_methods` (fallback statis) | `source: "live"` bila MCP berhasil, `"static"` bila fallback katalog | Tidak ada REST API daftar channel; **32 channel aktif** di sandbox; charge-probe: `scripts/probe/doku/channels.ts` |

### Hasil verifikasi sandbox (2026-09-25)

**iPaymu — 19 channel aktif** (kredensial sandbox `sandbox.md`)

- Virtual Account (10): `danamon, cimb, bca, permata, bmi, bni, mandiri, bri, bag, btn`
- E-Wallet (2): `dana, shopeepay` — group `ewallet-asia` (`ovo`/`gopay`/`linkaja`) **kosong**
- QRIS (1): `mpm` ("QRIS Dynamic NOBU") · COD (1): `cod` · Paylater (1): `akulaku`
- Retail (2): `alfamart, indomaret` · Kartu (2): `cc, debitonline`

**Xendit / DOKU** — daftar statis berhasil dibaca (16 / 17 channel).

**Midtrans — 16 dari 19 probe aktif** (kredensial sandbox `midtrans`)

| Status | Channel |
|---|---|
| ✅ Aktif | `qris, gopay, shopeepay, bca, bni, bri, cimb, danamon, bsi, seabank, mandiri, permata, alfamart, indomaret, akulaku, kredivo` |
| ❌ Tidak aktif | `ovo` (400 generik), `dana` (400 generik), `linkaja` (401) |

Kesimpulan penting: katalog statis (`getPaymentMethods`, 18 channel) **menyesatkan** untuk akun
ini — e-wallet `ovo`/`dana`/`linkaja` terdaftar di katalog tetapi **tidak aktif**. Ini alasan
konkret mengapa `probePaymentMethods()` harus dipakai untuk UI yang hanya boleh menampilkan
channel siap-pakai.

Cara memastikan 3 kegagalan itu **bukan** masalah payload kita (M-15): OVO diuji dengan tiga
varian (`phone: 08...`, `phone: 62...`, plus `customer_details.phone`) dan DANA dengan/tanpa
phone — semuanya gagal **identik**; LinkAja `401`. Karena itu `hintMidtransProbeError()`
sekarang menjelaskan ke developer bahwa channel tersebut perlu diaktivasi Midtrans.

> ⚠️ **Temuan penting:** hasil live **mengoreksi** keputusan berbasis dokumen pada gelombang
> sebelumnya (COD `cod`, bukan `rpx`) — lihat I-5 dan I-6. Pelajaran: untuk daftar kanal,
> API live lebih otoritatif daripada tabel dokumentasi.

### Probe Direct Payment per channel iPaymu (2026-09-26)

Skrip: `scripts/probe/ipaymu/channels.ts` — memanggil `createInvoice()` untuk **setiap** channel
aktif memakai kode kanonikal (jalur konsumen), lalu mengaudit payload yang benar-benar dikirim
(intersept `fetch`) dan respons mentahnya. Ini memverifikasi payload, bukan sekadar daftar kanal.

```bash
IPAYMU_VA=... IPAYMU_API_KEY=... bun run scripts/probe/ipaymu/channels.ts
PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe/ipaymu/channels.ts
PROBE_CHANNELS="cod:rpx,cc:debitonline" PROBE_COD_SHIPPING=1 bun run scripts/probe/ipaymu/channels.ts
```

Hasil (19 channel aktif, nominal Rp 10.000):

| Status | Jumlah | Channel |
|---|:--:|---|
| ✅ Diterima | **14** | `bca, cimb, permata, bmi, bni, mandiri, bag, btn` (VA) · `alfamart, indomaret` (retail) · `cc` · `debitonline` · `dana` (ewallet) · `qris/mpm` |
| ⚠️ Butuh data akun | 1 | `cod` — validasi kini lolos s/d **"Pickup area not registered"** (konfigurasi pickup area merchant, bukan payload) |
| ❌ Partner-side | 4 | `shopeepay` ("Failed from partner") · `akulaku` ("Failed from partner") · `danamon` & `bri` ("Failed to generate VA") |

Catatan:

- Empat kegagalan terakhir **konsisten** pada semua variasi yang diuji (nominal Rp 10.000 & Rp 100.000,
  dengan/tanpa `expired`) — indikasi kanal belum aktif di sisi partner/akun sandbox, bukan bug payload
  (pola identik dengan Midtrans `ovo`/`dana`/`linkaja` pada bagian di atas).
- `bmi` & `btn` sempat gagal transien (502 / timeout) lalu **lolos saat diulang**.
- Temuan yang diperbaiki dari probe ini: **I-7** (product/qty/price) dan **I-8** (`debitonline` → `cc`).
- ⚠️ Probe membuat transaksi sandbox **nyata** (iPaymu tidak menyediakan endpoint pembatalan);
  ~19 transaksi dibuat selama audit dan akan kedaluwarsa sendiri.

### Probe per channel Xendit (2026-09-26)

Skrip: `scripts/probe/xendit/channels.ts` — memanggil `createInvoice()` untuk setiap channel yang
dikembalikan `GET /payment_channels`, mengaudit payload yang benar-benar dikirim, dan menguji
matriks koreksi payload (`PROBE_CASES=1`).

```bash
XENDIT_SECRET_KEY=... bun run scripts/probe/xendit/channels.ts
PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe/xendit/channels.ts
PROBE_API_VERSION=v2 bun run scripts/probe/xendit/channels.ts     # jalur legacy
RAW=1 PROBE_CASES=1 bun run scripts/probe/xendit/channels.ts       # dump channel + matriks payload
```

Hasil (11 channel terdaftar di sandbox):

| Jalur | Sebelum perbaikan | Sesudah perbaikan |
|---|:--:|:--:|
| **v3** (default) | 3/11 | **11/11** |
| **v2** (legacy) | 8/11 (OVO gagal) | **11/11** |

| Kanal | v3 sebelum | v3 sesudah |
|---|---|---|
| VA `bca, bri, bni, mandiri, permata` | ❌ `API_VALIDATION_ERROR` | ✅ VA terbit |
| Retail `alfamart, indomaret` | ❌ `payer_name` required | ✅ payment code terbit |
| E-Wallet `ovo` | ❌ `account_mobile_number` required | ✅ diterima |
| E-Wallet `dana, linkaja` | ✅ | ✅ |
| QRIS `qris` | ✅ | ✅ |

- Temuan yang diperbaiki dari probe ini: **X-5** (VA `_VIRTUAL_ACCOUNT` + `display_name`),
  **X-6** (OTC `REUSABLE_PAYMENT_CODE` + `payer_name`), **X-7** (OVO mobile), **X-8** (sumber live).
- Catatan: `GET /payment_channels` mengembalikan kode VA polos (`BCA`) sementara endpoint v3
  menuntut `BCA_VIRTUAL_ACCOUNT` — SDK memisahkan kode v2 vs v3 agar keduanya tetap valid.
- ⚠️ Probe membuat transaksi **nyata** di akun Xendit (test mode): 11 transaksi per run × beberapa run.

### Probe per channel Midtrans (2026-09-26)

Skrip: `scripts/probe/midtrans/channels.ts` — memanggil `createInvoice()` per kode kanonikal
(Core API `POST /v2/charge`) dan **membatalkan** transaksi yang sukses.

```bash
MIDTRANS_SERVER_KEY=... bun run scripts/probe/midtrans/channels.ts
PROBE_ONLY=bca_va,qris PROBE_AMOUNT=1000 bun run scripts/probe/midtrans/channels.ts
PROBE_NO_CANCEL=1 bun run scripts/probe/midtrans/channels.ts   # pertahankan transaksi
```

Hasil (19 kanal Core API):

| Status | Jumlah | Kanal |
|---|:--:|---|
| ✅ Diterima | **16** | VA `bca, bni, bri, cimb, danamon, bsi, seabank, mandiri, permata` · `qris` · `gopay`, `shopeepay` · `alfamart, indomaret` · `akulaku, kredivo` |
| ❌ Channel belum diaktifkan | 3 | `ovo`, `dana` (400 generik) · `linkaja` (401) |

- Semua kegagalan **bukan** masalah payload; `hintMidtransProbeError()` menjelaskan langkah aktivasi.
- `gopay` sempat gagal transien (*"Our system is recovering…"*) lalu lolos saat retry.

### Probe per channel DOKU (Jokul v2 non-SNAP, 2026-09-26)

Skrip: `scripts/probe/doku/channels.ts` — kini **MCP-driven**: bila kredensial MCP tersedia
(`PROBE_MCP=1` + `DOKU_API_KEY`/`DOKU_MCP_API_KEY`), daftar channel diambil dari **DOKU MCP Server**
(`get_merchant_payment_methods`) dan **seluruh bank VA** di daftar MCP ikut diprobe — bukan hanya
katalog statis. Setiap channel diklasifikasikan: `sdk` (sudah dipetakan & non-SNAP, via
`createInvoice()` + audit payload), `snapOnly` (QRIS/DANA/ShopeePay), `endpoint` (VA belum
dipetakan → *endpoint existence probe* dengan signature DOKU), atau `unmapped`.

```bash
DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... bun run scripts/probe/doku/channels.ts
PROBE_MCP=1 DOKU_API_KEY=doku_key_sandbox_... bun run scripts/probe/doku/channels.ts
PROBE_ONLY=bca_va,doku_va,maybank_va PROBE_AMOUNT=1000 bun run scripts/probe/doku/channels.ts
PROBE_JSON=1 ... bun run scripts/probe/doku/channels.ts        # ringkasan JSON
RAW=1 PROBE_ONLY=permata_va PROBE_EXTRA_JSON='{"virtual_account_info":{...}}' bun run scripts/probe/doku/channels.ts
```

MCP `get_merchant_payment_methods` melaporkan **32 channel aktif / 7 kategori** (VA 17 bank,
E-Wallet 6, O2O 2, QRIS, Credit Card, Paylater 4).

Hasil probe (non-SNAP):

| Status | Jumlah | Kanal |
|---|:--:|---|
| ✅ Diterima | **13** | VA `bca, mandiri, bni, bri, permata, cimb, danamon, bsi` (SDK) + `doku, maybank` (uji endpoint) · `alfamart, indomaret` · `ovo` |
| ⏸️ SNAP-only (diharapkan) | 3 | `qris`, `dana`, `shopeepay` |

Hasil *endpoint existence probe* untuk **seluruh 17 bank VA** di daftar MCP:

| Bank (kode MCP) | Kanal non-SNAP | Hasil |
|---|---|---|
| BCA, Mandiri, BNI, BRI, Permata, CIMB, Danamon | `<bank>-virtual-account` | ✅ dipetakan SDK & terima transaksi |
| BSI | `bsm-virtual-account` | ✅ (nama resmi `bsm-`, bukan `bsi-`) |
| DOKU | `doku-virtual-account` | ✅ `VA=8000000000024660` (D-13) |
| Maybank | `maybank-virtual-account` | ✅ `VA=7867590000000338` (D-13) |
| BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS | `<bank>-virtual-account` | ❌ **404** — tidak ada endpoint REST non-SNAP; diterbitkan via **DOKU MCP** `create_virtual_account_payment` ✅ 7/7 VA terbit live (D-16) |

- Temuan yang diperbaiki: **D-8** (BSI `bsm-`), **D-9** (QRIS SNAP-only), **D-10** (Permata `ref_info`),
  **D-11** (BNI unique reference), **D-12** (expiry compact), **D-13** (`doku_va`/`maybank_va`),
  **D-14** (peta kode MCP → kanonikal), **D-15** (MCP sebagai sumber live `getPaymentMethods`),
  **D-16** (VA 7 bank via MCP `create_virtual_account_payment`).
- DOKU tidak menyediakan pembatalan seragam untuk transaksi non-SNAP → transaksi sandbox tertinggal.

### Laporan gabungan — semua probe live (2026-09-27)

Perintah (kredensial sandbox dari `sandbox.md`):

```bash
bun run scripts/probe/all.ts      # = bun run probe
```

7 provider berjalan (sisanya tanpa kredensial, mis. Prismalink yang terblokir vendor):

| Provider | Sumber | Diterima | Diharapkan | Gagal | Efek samping | Penilaian |
|---|---|---:|---:|---:|---:|---|
| Midtrans | live | 16/19 | 0 | 3 | 16 | Kode sehat; 3 kanal belum aktif di akun |
| iPaymu | live | 13/19 | 0 | 6 | 19 | 2 partner-side, 2 timeout, 1 butuh `weight`, 1 VA gagal |
| Xendit | live | 11/11 | 0 | 0 | 11 | ✅ Sehat (blokir IP allowlist sudah diperbaiki) |
| DOKU | mcp | 20/32 | 12 | 0 | 20 | Sehat; 12 kanal SNAP-only / belum dipetakan |
| Duitku | live | 24/27 | 3 | 0 | 24 | 24 kanal sehat; 3 kanal hambatan provider (FT/DN/LQ) — **DU-2** |
| Finpay | live | 19/20 | 1 | 0 | 0 | **Sehat + auto-cleanup** (Cancel Order) |
| Xenith | live | 2/12 | 0 | 10 | 0 | IP allowlist lagi: egress WARP berotasi ke `.215.133` |
| **TOTAL** | | **105/140** | **16** | **19** | **90** | |

Analisis (memisahkan bug SDK dari hambatan akun/config):

- **10 dari 19 kegagalan murni hambatan akun (IP allowlist):** Xenith 10 — egress WARP berotasi ke IP di luar yang didaftarkan (lihat pembaruan di bawah). Xendit kini lolos setelah di-whitelist.
- **9 kegagalan bersifat konfigurasi akun / partner / probe:**
  - Midtrans `ovo`/`dana` (400 generik), `linkaja` (401) → kanal belum diaktifkan di akun.
  - iPaymu `shopeepay`/`akulaku` ("Failed from partner"), `danamon`/`indomaret` (timeout 20s), `cod` (probe tidak mengirim `weight`), `bri` ("Failed to generate VA").
- **3 kanal Duitku adalah hambatan provider, bukan bug SDK (DU-2):**
  - `FT` — RETAIL (Pegadaian/ALFA/Pos): HTTP 500 "Failed to generate payment number Retail" untuk semua nominal dan kombinasi field → kanal tidak dapat digenerate untuk akun ini.
  - `DN` — INDODANA PAYLATER: sebelum perbaikan, HTTP 400 berbadan kosong karena SDK tidak mengirim `customerDetail`/`billingAddress`; setelah dikirim, permintaan lolos validasi dan Duitku membalas HTTP 500 "Failed to generate Indodana payment Url" → paylater belum ter-provision di akun.
  - `LQ` — LINKAJA QRIS: sudah dihapus Duitku (changelog Jan 2025 "Remove payment channel QRIS Link Aja"), tetapi masih tampil di `getpaymentmethod` sandbox; inquiry selalu 500 "Failed to generate QR String LinkAja".
- **Sehat & terverifikasi live:** Xendit (11/11), DOKU (20/32 aktif, 12 SNAP-only), Finpay (semua kanal + auto-cleanup + signature fail-closed), webhook Xenith 2/2.

Tindakan lanjutan:

1. Perluas **IP allowlist** Xenith ke rentang WARP (`104.28.215.0/24`, `104.28.247.0/24`) — Xendit sudah selesai; Xenith masih berotasi keluar rentang yang didaftarkan.
2. iPaymu COD: kirim rincian pengiriman (`PROBE_COD_SHIPPING=1`) agar bobot ikut terkirim.
3. Duitku `FT`/`DN`/`LQ`: ~~cocokkan kode kanal dengan dokumentasi resmi~~ — **terjawab (DU-2)**: `FT`=RETAIL (Pegadaian/ALFA/Pos), `DN`=Indodana Paylater, `LQ`=LinkAja QRIS. Field `customerVaName`/`customerDetail`/`billingAddress`/`itemDetails` kini dikirim sesuai dokumentasi; ketiga kanal diklasifikasikan `expected` (hambatan provider).

**Pembaruan whitelist IP (2026-09-27):** setelah IP keluar runner `104.28.215.130`
didaftarkan, **Xendit ✅ kini 11/11 diterima live**. Ternyata runner keluar lewat **Cloudflare
WARP** dan IP yang dilihat server **berbeda tergantung tujuan**:

- Destination **di belakang Cloudflare** (mis. `api.xendit.co` → `104.19.159.99`) melihat
  `104.28.215.130` → inilah yang membuat Xendit lolos setelah di-whitelist.
- Destination **publik biasa** (mis. `checkip.amazonaws.com`, `ident.me`, `ifconfig.me`)
  melihat `104.28.247.132`.
- **Xenith bukan Cloudflare** (`openapi.sandbox.xenithpay.com` → `13.114.248.245`, AWS
  Singapura) sehingga kemungkinan besar melihat `104.28.247.132`, bukan `104.28.215.130`.

**Xenith ✅ sempat 13/13** setelah `104.28.247.132` ditambahkan ke **Developer Settings →
IP Whitelist** (uji webhook yang tadinya tampak gagal hanya karena `XENITH_WEBHOOK_SECRET`
belum diset di env). Namun di run gabungan berikutnya, egress non-Cloudflare **berotasi ke
`104.28.215.133`** — tepat di luar rentang `.130`–`.132` yang didaftarkan — sehingga Xenith
kembali tertolak 10. Ini membuktikan IP WARP adalah **pool yang berputar**, dan mendaftarkan
IP satu per satu tidak cukup.

**Rekomendasi:** perluas IP Whitelist ke rentang yang menutup pool WARP yang teramati,
mis. `104.28.215.0/24` + `104.28.247.0/24`, lalu jalankan ulang probe. Alternatifnya,
periksa & sesuaikan IP tiap kali menjalankan probe:

- destinasi publik (Xenith): `curl -s -4 https://checkip.amazonaws.com`
- destinasi di belakang Cloudflare (Xendit): `curl -s -4 https://api.ipify.org`

Catatan integrasi probe:

- `scripts/probe/xenith/channels.ts` dirapikan agar memancarkan **ringkasan JSON** (sebelumnya muncul sebagai "dilewati" di CLI terpadu) dan **kredensial sandbox tidak lagi tertanam di file** — sekarang wajib dari environment (`XENITH_ACCESS_KEY`/`XENITH_SECRET_KEY`).

---

## 8. Definition of Done gelombang ini

- [x] Midtrans: `enabled_payments` valid (M-1), acquirer QRIS benar (M-2), probe Permata (M-3), `phone` bersih (M-4)
- [x] Xendit: jalur direct memakai Payment Requests v3 + `api-version`, parser dua-versi (X-1), `failure_return_url` (X-2)
- [x] DOKU: endpoint & body cstore non-SNAP (D-1/D-2), OVO non-SNAP (D-3), DANA/ShopeePay SNAP-only (D-4), `checkTransaction` SNAP VA (D-5), raw-body digest (D-6), `feeType` (D-7)
- [x] iPaymu: `timestamp` (I-1), clamp `expired` (I-2), `successUrl`/`cancelUrl` (I-3), kanal e-wallet/paylater (I-4)
- [x] Duitku: signature POP header HMAC (DU-1)
- [x] Nicepay: endpoint direct v2 (N-1), `mitraCd: ALMA` (N-2)
- [x] Faspay: signature terverifikasi (F-1, tanpa perubahan)
- [x] Midtrans BI-SNAP: adapter opt-in lengkap (M-5 … M-12) + 13 test regresi
- [x] Daftar channel: probe live (`source: "live"` vs `"static"`) jujur per provider (M-13/M-14)
- [x] Diagnosa probe Midtrans per-channel + petunjuk aktivasi channel (M-15)
- [x] iPaymu: `cod` & `mpm` terverifikasi lewat API live (I-5/I-6)
- [x] iPaymu: probe Direct Payment **per channel** — `product`/`qty`/`price` (I-7), `debitonline` → `cc` (I-8), prasyarat COD (I-9); 14/19 diterima, sisanya partner-side/konfigurasi akun
- [x] Xendit: probe **per channel** — VA `_VIRTUAL_ACCOUNT` + `display_name` (X-5), OTC `REUSABLE_PAYMENT_CODE` + `payer_name` (X-6), OVO mobile (X-7), sumber live (X-8); v3 **11/11**, v2 **11/11**
- [x] Midtrans: probe **per channel** via `createInvoice` + auto-cancel — 16/19 aktif (`ovo`/`dana`/`linkaja` belum diaktifkan di akun sandbox)
- [x] DOKU: probe **per channel** + daftar channel via MCP — BSI `bsm-` (D-8), QRIS SNAP-only (D-9), Permata `ref_info` (D-10), BNI unique ref (D-11), expiry compact (D-12); 11/14 non-SNAP + 3 SNAP-only
- [x] DOKU: **MCP Server sebagai sumber channel live** — `getPaymentMethods` MCP-first (`source: "live"`/`"static"`), peta kode MCP → kanonikal lintas 17 VA (D-14), endpoint VA `doku`/`maybank` diverifikasi live (D-13)
- [x] DOKU: **VA BTN/BJB/BPD Bali/Sinarmas/OCBC/BNC/BSS via MCP** — terbukti tidak ada endpoint REST non-SNAP (404 semua varian); kanal `mcpOnly` dirutekan ke `create_virtual_account_payment`, **7/7 VA sandbox terbit live** (D-16) + 4 test regresi
- [x] DOKU: **notifikasi pembayaran VA mcpOnly** (D-17) — format SNAP & non-SNAP didukung dan fail-closed; probe live e2e: BTN & BNC **terbayar SUCCESS** lewat simulator sandbox, 5 bank lain VA-nya terbit & tertrack (simulator kanal belum tersedia di DOKU) + 3 test regresi
- [x] CLI terpadu `bun run probe` — menjalankan semua probe provider dengan ringkasan JSON (`scripts/probe/all.ts`, `scripts/probe/lib.ts`)
- [x] Test regresi MCP DOKU: peta kode MCP (D-14), jalur live & fallback statis (D-15), endpoint VA baru (D-13)
- [x] `bun test` hijau + `tsc --noEmit` bersih
- [x] Finpay (FP-1/FP-3/FP-4) — dokumentasi resmi (`docs.finpay.id`) + **verifikasi live sandbox** (`scripts/probe/finpay/channels.ts`, 19/20 lolos · 1 diharapkan, auto-cleanup via Cancel Order); endpoint/auth/payload/signature/status/kanal + aturan telepon/item/accountId + Cancel/Void diselaraskan + regresi baru
- [ ] Prismalink (FP-2) — ⏸ **terblokir oleh vendor**: gateway tidak stabil & registrasi sandbox/staging tidak dapat diakses; butuh akses/dokumen dari Prismalink

## 9. Gelombang berikutnya (belum dikerjakan)

1. **Xendit:** `checkTransaction` untuk Payment Requests v3 (`GET /v3/payment_requests`)
   di samping jalur `/sessions` yang sudah ada; pertimbangkan mengirim objek `customer`
   terstruktur pada v3 (setelah strategi `reference_id` alfanumerik diputuskan).
   _Probe per channel sudah dilakukan (X-5…X-8); `gopay`/`shopeepay`/`credit_card`/`kredivo`
   tidak dikembalikan `GET /payment_channels` untuk akun sandbox ini sehingga belum diuji live._
   **Blocker 2026-09-27:** seluruh 16 probe Xendit ditolak **IP allowlist** (IP keluar runner belum
   didaftarkan) — tambahkan IP ke dashboard Xendit lalu jalankan ulang (§7 laporan gabungan).
2. **DOKU:** tombol `snapQueryType` otomatis berdasarkan metadata transaksi. ~~Temukan penamaan
   kanal non-SNAP untuk BTN, BJB, BPD Bali, Sinarmas, OCBC, BNC, BSS~~ — **terjawab (D-16): tidak
   ada endpoint REST non-SNAP; VA diterbitkan lewat DOKU MCP `create_virtual_account_payment`,
   7/7 diverifikasi live**. ~~Verifikasi notifikasi pembayaran VA MCP~~ — **terjawab (D-17): format
   notifikasi SNAP VA berlaku untuk ketujuh bank; e2e terbukti via simulator untuk BTN & BNC**.
   Sisa: uji pembayaran manual 5 bank tanpa simulator kanal (BJB, BPD Bali, Sinarmas, OCBC, BSS)
   lewat kanal bank asli, atau pantau penambahan kanal simulator DOKU.
3. **iPaymu:** ~jalankan ulang probe setelah kanal partner (`shopeepay`, `akulaku`, `danamon`, `bri`)
   diaktifkan; konfirmasi penamaan kanal QRIS (`mpm`) — **sudah terjawab live** (I-6).
4. **Finpay (FP-1):** ✅ selesai terhadap dokumentasi resmi — sisa opsional: uji live sandbox dengan akun merchant (`FINPAY_MERCHANT_ID`, `FINPAY_MERCHANT_KEY`). **Prismalink (FP-2):** ⏸ terblokir oleh vendor — gateway tidak stabil & registrasi sandbox/staging tidak dapat diakses; audit menunggu akses/dokumen dari Prismalink.
5. **Midtrans BI-SNAP:** verifikasi sandbox untuk `additionalInfo.bank` per bank, field status VA,
   dan flow Direct Debit (GoPay tokenization / GoPay deeplink) yang belum diadopsi.
5b. **Daftar channel:** Midtrans & DOKU sudah diprobe per channel (§7); DOKU MCP
   `get_merchant_payment_methods` kini menjadi **sumber live** `DokuProvider.getPaymentMethods`
   (D-15) dan dipakai `scripts/probe/doku/channels.ts`; CLI terpadu `bun run probe` menjalankan
   semua probe dengan ringkasan JSON.
6. **Provider Indonesia lain:** OY! lalu pendalaman Faspay (kanal, payload, signature, status mapping)
   — sesuai prioritas "Indonesia dulu".
7. **Provider internasional:** Stripe, PayPal, Adyen, Checkout.com, Razorpay, Square, PayU,
   Braintree, 2Checkout, SumoPod — audit yang sama.
8. **IP allowlist (Xendit & Xenith):** daftarkan IP keluar runner agar probe yang tertolak bisa diuji live. **Xendit ✅** (`104.28.215.130`) kini 11/11 live. **Xenith ⏳** sempat 13/13 tetapi kembali tertolak karena egress berotasi ke `104.28.215.133` — perluas whitelist ke rentang WARP (`104.28.215.0/24`, `104.28.247.0/24`). Runner keluar lewat **Cloudflare WARP** dan IP yang dilihat server berbeda per tujuan (Cloudflare-fronted vs publik) serta berputar sepanjang waktu.
9. ~~**Duitku `FT`/`DN`/`LQ`:** periksa 3 kanal yang gagal di probe terhadap dokumentasi resmi.~~ — **selesai (DU-2)**: kode kanal dipetakan (`FT`=RETAIL/Pegadaian-ALFA-Pos, `DN`=Indodana Paylater, `LQ`=LinkAja QRIS); SDK menyertakan `customerVaName` + `customerDetail` (termasuk `billingAddress` wajib-efektif untuk `DN`) + `itemDetails` sesuai Request Transaction resmi; ketiga kanal ditandai `expected` di probe karena hambatan provider (kanal dihapus / belum ter-provision).
10. ~~**Duitku — signature legacy MD5 (temuan sampingan DU-2):** dokumentasi resmi kini memakai
    `HMAC_SHA256(merchantCode + amount + merchantOrderId, apiKey)` untuk callback (changelog
    Apr 2026: *"set obsolete md5 and sha256"*), sedangkan SDK hanya menerima MD5.~~ — **selesai
    (DU-3):** `verifyDuitkuCallbackSignature` kini menerima HMAC-SHA256 (lebih dulu) **dan** MD5
    lama (fallback transisi), menolak bila `signature`/`apiKey` kosong; simulator menghasilkan
    HMAC-SHA256. Sisa: `getDuitkuInquirySignatures` (signature body Direct Inquiry) **masih MD5**
    dan sandbox masih menerimanya — perlu dipantau/diuji dengan callback live sungguhan sebelum
    memindahkan Direct Inquiry ke HMAC (lihat `src/providers/duitku/signature.ts`).
