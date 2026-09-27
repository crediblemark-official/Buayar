# Finpay — Implementasi Buayar

> ✅ **Status Pengujian:** **VERIFIED LIVE (sandbox)** — seluruh endpoint, auth, payload, signature, dan pemetaan status diverifikasi terhadap [docs.finpay.id](https://docs.finpay.id/api-reference/finpay-pg/) **dan** akun sandbox nyata lewat `scripts/probe/finpay/channels.ts` (13/13 kanal aktif lolos; 1 kanal belum diaktifkan di akun).

> Status Audit: **✅ FP-1 SELESAI** — kode diselaraskan ke API resmi dan diverifikasi live. Lihat `docs/REVIEW-PG-FIDELITY.md` §FP-1.

## File

| File | Isi |
|---|---|
| `src/providers/finpay/provider.ts` | Invoice (Hosted/Core), status inquiry, cancel/void, daftar channel, webhook |
| `src/providers/finpay/signature.ts` | Generator & verifier HMAC-SHA512 callback |
| `src/clients/finpay.ts` | Klien tipis (Basic auth, status check) |
| `scripts/probe/finpay/channels.ts` | Probe live per kanal (payload + signature + status) |

## Kredensial (`.env`)

```env
FINPAY_MERCHANT_ID=...   # Merchant ID → dipakai sebagai username Basic auth
FINPAY_MERCHANT_KEY=...  # Merchant Key → dipakai sebagai password Basic auth
FINPAY_SANDBOX=true
```

Kredensial sandbox didapat di [Dashboard Finpay → Access Keys](https://dashboard.finpay.id/pages/access-keys).

## Kontrak resmi yang diimplementasikan

Sumber: [Authorization & Headers](https://docs.finpay.id/api-reference/finpay-pg/authorization-and-headers.md), [Hosted Payment](https://docs.finpay.id/api-reference/finpay-pg/hosted-payment.md), [Initiate Virtual Account](https://docs.finpay.id/api-reference/finpay-pg/core-api/virtual-account/close-payment/initiate-virtual-account.md), [Status Check](https://docs.finpay.id/api-reference/finpay-pg/after-payment/status-check-payment-gateway.md), [Notification Callback](https://docs.finpay.id/api-reference/finpay-pg/after-payment/notification-callback.md).

| Aspek | Nilai resmi | Implementasi | Live |
|---|---|---|---|
| Base URL sandbox | `https://devo.finnet.co.id` | ✅ | ✅ |
| Base URL produksi | `https://live.finnet.co.id` | ✅ | — |
| Auth | `Authorization: Basic base64(merchantId:merchantKey)` | ✅ | ✅ |
| Create (Hosted/QRIS/VA) | `POST /pg/payment/card/initiate` | ✅ | ✅ |
| Body | bersarang `{ order, customer, url, sourceOfFunds? }` | ✅ | ✅ |
| Kode sukses | `responseCode === "2000000"` | ✅ | ✅ |
| Status check | `GET /pg/payment/card/check/{orderId}` | ✅ | ✅ |
| Cancel Order | `GET /pg/payment/card/cancel/{orderId}` | ✅ | ✅ |
| Void | `GET /pg/payment/card/void/{orderId}` | ✅ | via Cancel Order (lihat bawah) |
| Callback | `HMAC-SHA512(json_encode(body tanpa signature), Merchant Key)` hex 128 | ✅ | ✅ (offline) |
| Field status callback | `result.payment.status` | ✅ | ✅ |
| SOF ID | mengikuti [Source Of Funds List](https://docs.finpay.id/api-reference/appendix/enumeration/source-of-funds-list.md) | ✅ | ✅ |

## Aturan yang ditemukan dari sandbox live

Beberapa aturan hanya terlihat setelah menembak sandbox nyata:

1. **`customer.mobilePhone` wajib & harus E.164** — format lokal `0812…` ditolak
   ("Invalid Field Format. The customer.mobile phone format is invalid"). SDK menormalisasi
   ke `+62…`; bila merchant tidak mengisi `phone`, dipakai placeholder E.164 yang sah.
2. **`order.item` wajib untuk DANA & LinkAja**, dan DANA menuntut `order.item[].category`
   ("Invalid Mandatory Field order.item.0.category"). SDK selalu mengirim `item`; bila
   merchant tidak memberi rincian, dikirim satu item yang menjumlah persis ke `amount`.
3. **OVO wajib `sourceOfFunds.accountId`** dengan **format lokal `0…`** (contoh dokumen OVO:
   `082232565453`), bukan E.164.
4. **Status awal status-check = `REQUEST_INITIATED`**, yang berarti **`pending`** (bukan gagal).
5. **Indomaret (`idm`)** mengembalikan `Feature Not Allowed` untuk akun sandbox ini — kanal
   belum diaktifkan, bukan bug payload.

## Pemetaan kanal (canonical → `sourceOfFunds.type`)

`bca_va → vabca`, `mandiri_va → vamandiri`, `bni_va → vabni`, `bri_va → vabri`, `permata_va → vapermata`, `cimb_va → vacimb`, `danamon_va → vadanamon`, `bsi_va → vabsi`, `btn_va → vabtn`, `bjb_va → vabjb`, `bnc_va → vabnc`, `qris → qris`, `ovo → ovo`, `dana → dana`, `shopeepay → shopeepay`, `linkaja → linkaja`, `alfamart → alfamart`, `indomaret → idm`, `pos → pospay`, `credit_card → cc`.

Tanpa `paymentMethod` → Hosted Payment (redirect `redirecturl`).

## Pemetaan status

| Status Finpay | Kanonik |
|---|---|
| `PAID`, `CAPTURED`, `SETTLED`, `SETTLEMENT`, `SUCCESS` | `paid` |
| `PENDING`, `PROCESSING`, `REQUEST_INITIATED`, `INITIATED`, `AUTHORIZED` | `pending` |
| `EXPIRED` | `expired` |
| lainnya (termasuk signature tidak valid) | `failed` |

## Probe live

```bash
FINPAY_MERCHANT_ID=... FINPAY_MERCHANT_KEY=... FINPAY_SANDBOX=true \
  bun run scripts/probe/finpay/channels.ts
# atau lewat CLI terpadu:
bun run probe finpay
```

Probe membuat transaksi sandbox nyata lalu **membersihkannya sendiri**: setiap transaksi yang
berhasil langsung dibatalkan lewat **Cancel Order** resmi (`GET /pg/payment/card/cancel/{orderId}`),
dan mengaudit payload yang benar-benar dikirim lewat intersept `fetch`. Set `PROBE_NO_CANCEL=1`
untuk mempertahankannya.

Hasil live terakhir: **19/20 lolos · 1 diharapkan · 0 gagal**, dengan **8/13 transaksi berhasil
dibatalkan**. Kanal **QRIS & e-wallet (OVO, DANA, ShopeePay, LinkAja)** belum bisa dibatalkan pada
status awal sebelum sesi provider terbentuk — Finpay menjawab `4040100 "Invalid Transaction Status"`,
sehingga probe menandainya sebagai hasil yang diharapkan dan transaksinya kedaluwarsa sendiri.
VA, Alfamart, kartu kredit, dan Hosted Payment berhasil dibatalkan.

## Verifikasi

- Live per kanal: `scripts/probe/finpay/channels.ts` (18/19 lolos · 1 diharapkan).
- Contract & fidelity test: `tests/finpay.test.ts` dan blok **FP-1** di `tests/pg-fidelity.test.ts`.
- Fail-closed webhook lintas provider: `tests/webhook-security.test.ts`.

## Cancel / Void

| Metode | Endpoint resmi | Pemakaian |
|---|---|---|
| `FinpayProvider.cancelTransaction(orderId, config)` / `FinpayClient.cancelOrder(orderId)` | `GET /pg/payment/card/cancel/{orderId}` | Transaksi belum dibayar |
| `FinpayProvider.voidTransaction(orderId, config)` / `FinpayClient.voidTransaction(orderId)` | `GET /pg/payment/card/void/{orderId}` | Transaksi sudah diotorisasi/dibayar (sebelum settlement) |

Sukses bila `responseCode === "2000000"`. Docs: [Cancel Order](https://docs.finpay.id/api-reference/finpay-pg/after-payment/cancel-order.md),
[Void](https://docs.finpay.id/api-reference/finpay-pg/after-payment/void.md).

### Verifikasi Void live

Void hanya berlaku untuk transaksi yang **sudah dibayar/diotorisasi**. Sandbox Finpay **tidak
menyediakan simulator pembayaran** (disimulator legacy di `sandbox.finpay.co.id/simdev` hanya untuk
platform bill-hosting lama, bukan PG `devo.finnet.co.id`), jadi order harus dibayar lebih dulu
(mis. transfer ke VA sandbox), lalu di-void dengan mode fokus:

```bash
PROBE_VOID=<orderId> FINPAY_MERCHANT_ID=... FINPAY_MERCHANT_KEY=... \
  bun run scripts/probe/finpay/channels.ts
```

Yang sudah terbukti live: endpoint `void` **reachable dan terautentikasi**, dan pada order yang
**belum dibayar** ia menjawab `4030015 Transaction Not Permitted` yang dipetakan ke `success: false`
(fail-closed) tanpa mengubah status. Jalur sukses Void perlu order yang benar-benar sudah dibayar.

## Sisa opsional

- Aktifkan kanal **Indomaret** di Dashboard Finpay lalu jalankan ulang probe.
- Verifikasi jalur **sukses** Void: bayar satu VA sandbox lebih dulu, lalu jalankan
  `PROBE_VOID=<orderId>` (lihat bagian Cancel / Void).
