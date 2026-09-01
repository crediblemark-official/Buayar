# 💳 @crediblemark/buayar

[![npm version](https://img.shields.io/npm/v/@crediblemark/buayar.svg?style=flat-square&color=amber)](https://www.npmjs.com/package/@crediblemark/buayar)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**`@crediblemark/buayar`** adalah **Unified Payment Gateway SDK** untuk Node.js dan TypeScript yang dirancang untuk mempermudah integrasi berbagai Payment Gateway di Indonesia menggunakan satu arsitektur API yang seragam.

> 💡 **Zero-Code PG Switcher:** Berganti provider payment gateway (misal dari Midtrans ke Duitku atau sebaliknya) **tanpa perlu merombak kode controller/service aplikasi**. Cukup ubah kredensial di file `.env`!

---

## 🚀 Fitur Utama

- 🔄 **Zero-Code PG Switcher**: Ubah provider dan kredensial langsung via environment variable (`.env`).
- ⚡ **Dukungan Spektrum Integrasi Penuh**:
  - 🟡 **Semi Integrasi (Redirect/Hosted)**: Menghasilkan `paymentUrl` atau `snap_token` siap redirect/popup.
  - 🟢 **Full Integrasi (Custom Native UI / Direct API)**: Mengembalikan data mentah (`vaNumber`, `qrString` EMVCo, `paymentCode`, `deeplink`) untuk dirender langsung di UI custom aplikasi/web Anda.
- 🏷️ **Canonical Payment Method Mapping**: Gunakan kode universal (`bca_va`, `mandiri_va`, `qris`, `gopay`, `shopeepay`, `alfamart`, `indomaret`), SDK otomatis memetakannya ke format internal provider aktif.
- 📂 **Pre-Categorization (Accordion Ready)**: Pengelompokan channel pembayaran bawaan (`Virtual Account`, `QRIS`, `E-Wallet`, `Retail / Gerai`, `Kartu Kredit`, `Paylater / Cicilan`) lengkap dengan fee dan icon URL untuk mempermudah pembuatan UI accordion.
- 🪝 **Universal Webhook Verifier**: Endpoint webhook tunggal untuk memverifikasi signature (SHA-512 Midtrans / MD5 Duitku) dan menormalisasi status (`isPaid`, `isPending`, `isFailed`, `isExpired`).
- 🛡️ **Tipe Data Kuat (TypeScript)**: Tipe data deklaratif dan ketat untuk mencegah *runtime error*.

---

## 📦 Provider yang Didukung

* 🏛️ **[Integrasi Midtrans (docs/midtrans.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/midtrans.md)**
  * Snap API (Redirect Checkout / Popup JS Modal).
  * Core API Direct Charge (BCA, BNI, BRI, Mandiri Bill, Permata, CIMB, QRIS Gopay/ShopeePay, E-Wallet deeplinks, Kartu Kredit 3DS, Alfamart/Indomaret, Paylater).
  * Verifikasi callback otomatis (SHA-512).
  * Ekstensi `MidtransClient` (Refund, Cancel, Subscription, Recurring, Payment Link).

* 🏛️ **[Integrasi Duitku (docs/duitku.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/duitku.md)**
  * Redirect Checkout (Duitku Hosted Page).
  * Direct Inquiry API (VA BCA, Mandiri, BNI, BRI, Permata, QRIS ShopeePay/Nobu, Gerai Retail).
  * Dynamic Payment Methods API (Query channel aktif + dynamic fee).
  * Verifikasi callback otomatis (MD5).
  * Ekstensi `DuitkuClient` (Disbursement / Payout, Inquiry Rekening Bank, Saldo Merchant).

* 🏛️ **[Integrasi iPaymu (docs/ipaymu.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/ipaymu.md)**
  * Redirect Checkout (iPaymu Hosted Page).
  * Direct Payment API (VA BCA, Mandiri, BNI, BRI, CIMB, Permata, Danamon, BSI, QRIS, Alfamart, Indomaret, CC, Akulaku).
  * Verifikasi callback otomatis & signature HMAC-SHA256.
  * Ekstensi `IpaymuClient` (Cek Saldo, Cek Status Transaksi).

* 🏛️ **[Integrasi Xendit (docs/xendit.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/xendit.md)**
  * Invoice v2 API (Redirect Checkout).
  * Payment Requests API v3 Direct Charge (VA BCA, Mandiri, BNI, BRI, Permata, CIMB, Danamon, BSI, QRIS, OVO, DANA, ShopeePay, LinkAja, Alfamart, Indomaret).
  * Verifikasi webhook callback token.
  * Ekstensi `XenditClient` (Cek Saldo, Expire Invoice, Disbursement / Payout).

* 🏛️ **[Integrasi DOKU Jokul (docs/doku.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/doku.md)**
  * Jokul Checkout v1 (Redirect Payment Page).
  * Direct Payment API v2 (VA BCA, Mandiri, BNI, BRI, Permata, CIMB, Danamon, BSI, QRIS, Alfamart, Indomaret, OVO, DANA, ShopeePay).
  * Verifikasi signature HMAC-SHA256 & Digest otomatis.
  * Ekstensi `DokuClient` (Cek Status Pesanan).

* 🏛️ **[Integrasi PrismaLink (docs/prismalink.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/prismalink.md)**
  * Checkout Payment Page (Redirect).
  * Direct Payment API (VA BCA, Mandiri, BNI, BRI, Permata, CIMB, Danamon, BSI, QRIS, Alfamart, Indomaret, E-Wallet, CC).
  * Verifikasi signature SHA-256 otomatis.
  * Ekstensi `PrismalinkClient` (Cek Status Transaksi).

* 🏛️ **[Integrasi Faspay (docs/faspay.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/faspay.md)**
  * Post Data Transaction (Payment Page & Direct VA/QRIS/Retail).
  * Channel lengkap (VA BCA, Mandiri, BNI, BRI, Permata, CIMB, Danamon, BSI, QRIS, Alfamart, Indomaret, OVO, DANA, ShopeePay, LinkAja, Kredivo, Akulaku, CC).
  * Verifikasi signature SHA1(MD5()) otomatis.
  * Ekstensi `FaspayClient` (Inquiry Status & Cancel Transaction).

* 🏛️ **[Integrasi Finpay (docs/finpay.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/finpay.md)**
  * Payment Initiate & Checkout Link (Redirect).
  * Direct Payment API (VA BCA, Mandiri, BNI, BRI, Permata, CIMB, Danamon, BSI, QRIS, Pos Indonesia, Alfamart, Indomaret, E-Wallet, CC).
  * Verifikasi signature HMAC-SHA512 otomatis.
  * Ekstensi `FinpayClient` (Inquiry Status Pembayaran).

* 🏛️ **[Integrasi Nicepay (docs/nicepay.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/nicepay.md)**
  * Order Regist & Hosted Checkout (Redirect).
  * Direct One-Step API (VA BCA BBBB, Mandiri BMRI, BNI BNIN, BRI BRIN, Permata BBBA, CIMB BNIA, Danamon BDIN, BSI BBSI, QRIS, Alfamart, Indomaret, E-Wallet, Paylater, CC).
  * Verifikasi merchantToken SHA-256 otomatis.
  * Ekstensi `NicepayClient` (Inquiry Status & Cancel Transaction).

* 🏛️ **[Integrasi OY! Bisnis (docs/oy.md)](file:///media/rasyiqi/7653717A1C07B131/Buayar/docs/oy.md)**
  * Payment Checkout v2 (Payment Link / Redirect).
  * Direct API (Static/Dynamic VA BCA 014, Mandiri 008, BNI 009, BRI 002, Permata 013, CIMB 022, Danamon 011, BSI 451, QRIS, E-Wallet).
  * Verifikasi Header & Webhook otomatis.
  * Ekstensi `OyClient` (Inquiry Status, Saldo Merchant & Kirim Uang/Disbursement).

---

## ⚙️ Konfigurasi Environment Variables (`.env`)

SDK `Buayar` membaca konfigurasi secara otomatis dari `process.env`. Anda dapat menggunakan variabel universal ataupun variabel spesifik provider:

### 1. Standar Universal (Direkomendasikan)
```env
# Provider aktif: 'midtrans' | 'duitku' | 'ipaymu' | 'xendit' | 'doku' | 'prismalink' | 'faspay' | 'finpay' | 'nicepay' | 'oy'
PROVIDER_PG=oy

# Kredensial Universal
BUAYAR_MERCHANT_CODE=myusername # Username OY! Bisnis
BUAYAR_API_KEY=oy-secret-key-xxxxxxxxxxxxxxxx # API Key OY! Bisnis
BUAYAR_SANDBOX=true

# Callback & Return URL (Opsional)
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

### 2. Kamus Variabel Lengkap & Spesifik Provider

| Variabel `.env` | Provider | Keterangan |
| :--- | :--- | :--- |
| `PROVIDER_PG` / `PG_PROVIDER` / `BUAYAR_PROVIDER` / `PAYMENT_PROVIDER` | Semua | Nama provider yang aktif (`midtrans`, `duitku`, `ipaymu`, `xendit`, `doku`, `prismalink`, `faspay`, `finpay`, `nicepay`, `oy`). |
| `BUAYAR_API_KEY` / `PG_API_KEY` | Semua | Kunci API universal (Server Key Midtrans / API Key Duitku / API Key iPaymu / Secret Key Xendit / Secret Key DOKU / Secret Key PrismaLink / Password Faspay / Merchant Key Finpay / Key Nicepay / API Key OY!). |
| `BUAYAR_MERCHANT_CODE` / `PG_MERCHANT_CODE` | Semua | Kode Merchant Duitku / Nomor VA iPaymu / Client ID DOKU / Merchant ID PrismaLink / Merchant ID Faspay / Merchant ID Finpay / iMid Nicepay / Username OY!. |
| `BUAYAR_SANDBOX` / `PG_SANDBOX` | Semua | Mode sandbox / development (`true` atau `false`). |
| `MIDTRANS_SERVER_KEY` | Midtrans | Midtrans Server Key spesifik. |
| `MIDTRANS_CLIENT_KEY` | Midtrans | Midtrans Client Key spesifik. |
| `DUITKU_API_KEY` | Duitku | API Key Duitku spesifik. |
| `DUITKU_MERCHANT_CODE` | Duitku | Merchant Code Duitku spesifik. |
| `IPAYMU_API_KEY` | iPaymu | API Key iPaymu spesifik. |
| `IPAYMU_VA` | iPaymu | Nomor Virtual Account merchant iPaymu. |
| `XENDIT_SECRET_KEY` | Xendit | Secret Key Xendit (`xnd_development_...` / `xnd_production_...`). |
| `XENDIT_WEBHOOK_TOKEN` | Xendit | Verification Token Webhook Xendit. |
| `DOKU_CLIENT_ID` | DOKU | Client ID merchant DOKU Jokul. |
| `DOKU_SECRET_KEY` | DOKU | Secret Key merchant DOKU Jokul. |
| `PRISMALINK_MERCHANT_ID` | PrismaLink | Merchant ID merchant PrismaLink. |
| `PRISMALINK_SECRET_KEY` | PrismaLink | Secret Key merchant PrismaLink. |
| `FASPAY_MERCHANT_ID` | Faspay | Merchant ID merchant Faspay (misal: `31112`). |
| `FASPAY_USER_ID` | Faspay | User ID API Faspay (misal: `db31112`). |
| `FASPAY_PASSWORD` | Faspay | Password API Faspay. |
| `FASPAY_MERCHANT_NAME` | Faspay | Nama display merchant di Faspay. |
| `FINPAY_MERCHANT_ID` | Finpay | Merchant ID merchant Finpay. |
| `FINPAY_MERCHANT_KEY` | Finpay | Merchant Key / Secret Key Finpay. |
| `NICEPAY_IMID` | Nicepay | Merchant ID (iMid) Nicepay (misal: `IONPAYTEST`). |
| `NICEPAY_KEY` | Nicepay | Merchant Key rahasia Nicepay. |
| `OY_USERNAME` | OY! Bisnis | Username akun OY! Bisnis. |
| `OY_API_KEY` | OY! Bisnis | API Key OY! Bisnis. |
| `BUAYAR_API_KEY` / `PG_API_KEY` / `PAYMENT_API_KEY` | Semua | API Key / Server Key universal. |
| `BUAYAR_MERCHANT_CODE` / `PG_MERCHANT_CODE` | Duitku / Umum | Kode merchant dari dashboard payment gateway. |
| `BUAYAR_SANDBOX` / `PG_SANDBOX` / `PAYMENT_SANDBOX` | Semua | Mode sandbox (`true` / `false`). |
| `MIDTRANS_SERVER_KEY` | Midtrans | Server key rahasia Midtrans. |
| `MIDTRANS_CLIENT_KEY` | Midtrans | Client key publik Midtrans. |
| `MIDTRANS_MERCHANT_ID` | Midtrans | Merchant ID Midtrans (opsional). |
| `MIDTRANS_IS_PRODUCTION` | Midtrans | `true` untuk production, `false` untuk sandbox. |
| `DUITKU_API_KEY` | Duitku | API Key merchant Duitku. |
| `DUITKU_MERCHANT_CODE` | Duitku | Kode Merchant Duitku (misal: `D1234`). |
| `DUITKU_SANDBOX` | Duitku | `true` untuk sandbox Duitku. |
| `BUAYAR_PROJECT_ID` / `PG_PROJECT_ID` | Custom / Extra | Project ID untuk provider masa depan yang membutuhkan project scoping. |
| `BUAYAR_PUBLIC_KEY` / `BUAYAR_PRIVATE_KEY` | Custom / Extra | Public / Private asymmetric key jika dibutuhkan. |

---

## 📖 Panduan Penggunaan

### 1. Inisialisasi Klien (Zero-Config)
```typescript
import { buayar } from "@crediblemark/buayar";

// Otomatis membaca konfigurasi dari process.env
```

---

### 2. Mode Semi Integrasi (Redirect / Hosted Checkout)
Jika Anda ingin menyerahkan antarmuka pembayaran kepada halaman checkout bawaan Payment Gateway, cukup kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-1001",
  amount: 150000,
  productDetails: "Langganan Paket Pro 1 Bulan",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/orders/ORDER-1001",
});

if (invoice.success) {
  // Arahkan pelanggan ke URL ini:
  console.log("Redirect URL:", invoice.paymentUrl);
}
```

---

### 3. Mode Full Integrasi (Custom Native UI / Direct API)
Jika Anda ingin membangun halaman checkout sendiri di dalam aplikasi tanpa redirect ke halaman luar:

#### Langkah A: Ambil Daftar Metode Pembayaran (Accordion-Ready)
```typescript
const result = await buayar.getPaymentMethods({ amount: 150000 });

// Akses daftar terkelompok untuk render komponen Accordion UI:
console.log(result.categories);
/*
{
  "Virtual Account": [
    { code: "bca_va", paymentName: "BCA Virtual Account", paymentImage: "...", totalFee: "IDR 4,000" },
    { code: "mandiri_va", paymentName: "Mandiri Bill Payment", ... }
  ],
  "QRIS": [
    { code: "qris", paymentName: "QRIS Universal", paymentImage: "...", totalFee: "0.7%" }
  ],
  "E-Wallet": [
    { code: "gopay", paymentName: "GoPay", ... },
    { code: "shopeepay", paymentName: "ShopeePay", ... }
  ]
}
*/
```

#### Langkah B: Direct Charge saat Pelanggan Memilih Metode
```typescript
// Contoh 1: Direct Virtual Account (BCA)
const vaInvoice = await buayar.createInvoice({
  orderId: "ORDER-1002",
  amount: 150000,
  paymentMethod: "bca_va", // Canonical ID
  productDetails: "Topup Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA:", vaInvoice.vaNumber);   // Contoh: "123456789012"
console.log("Bank:", vaInvoice.vaBank);         // "bca"
console.log("Batas Bayar:", vaInvoice.expiresAt);

// Contoh 2: Direct QRIS (Render ke Canvas / SVG QR)
const qrisInvoice = await buayar.createInvoice({
  orderId: "ORDER-1003",
  amount: 50000,
  paymentMethod: "qris", // Canonical ID
  productDetails: "Kopi Kenangan",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS String (EMVCo):", qrisInvoice.qrString);
console.log("URL Gambar QR:", qrisInvoice.qrCodeUrl);

// Contoh 3: Gerai Retail (Indomaret / Alfamart)
const retailInvoice = await buayar.createInvoice({
  orderId: "ORDER-1004",
  amount: 100000,
  paymentMethod: "indomaret",
  productDetails: "Voucher Game",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Kode Bayar Kasir:", retailInvoice.paymentCode);
```

---

### 4. Universal Webhook Handler
Tangani callback notifikasi dari PG manapun hanya dengan 1 endpoint universal:

```typescript
// Contoh implementasi di Express / Elysia / Next.js API Route
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers);

  if (!result.isValid) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (result.isPaid) {
    console.log(`✅ Order ${result.orderId} senilai Rp${result.amount} telah LUNAS!`);
    // Jalankan logika aktivasi langganan / kirim produk
  } else if (result.isExpired) {
    console.log(`⏰ Order ${result.orderId} telah kedaluwarsa.`);
  }

  // Balas respons OK ke gateway
  return res.status(200).json({ status: "OK" });
});
```

---

## 🏷️ Daftar Canonical Payment Methods

| Kategori | Canonical Code | Duitku Mapped Code | Midtrans Core Mapped Type |
| :--- | :--- | :--- | :--- |
| **Virtual Account** | `bca_va` | `BC` | `bank_transfer (bca)` |
| | `mandiri_va` | `M2` | `echannel` |
| | `bni_va` | `I1` | `bank_transfer (bni)` |
| | `bri_va` | `BR` | `bank_transfer (bri)` |
| | `permata_va` | `BT` | `bank_transfer (permata)` |
| | `cimb_va` | `B1` | `bank_transfer (cimb)` |
| | `danamon_va` | `DM` | `bank_transfer (danamon)` |
| | `bsi_va` | `BS` | `bank_transfer (bsi)` |
| | `seabank_va` | `S1` | `bank_transfer (seabank)` |
| **QRIS** | `qris` | `SP` / `NQ` | `qris` |
| **E-Wallet** | `gopay` | `GP` | `gopay` |
| | `shopeepay` | `SA` | `shopeepay` |
| | `ovo` | `OV` | `ovo` |
| | `dana` | `DA` | `dana` |
| | `linkaja` | `LA` | `linkaja` |
| **Retail** | `alfamart` | `AL` | `cstore (alfamart)` |
| | `indomaret` | `IR` | `cstore (indomaret)` |
| **Kartu** | `credit_card` | `VC` | `credit_card` |
| **Paylater** | `kredivo` | `KV` | `kredivo` |
| | `akulaku` | `AT` | `akulaku` |

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License**. Hak Cipta © 2026 Rasyiqi Crediblemark.
