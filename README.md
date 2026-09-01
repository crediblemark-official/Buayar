# 💳 @crediblemark/buayar

[![npm version](https://img.shields.io/npm/v/@crediblemark/buayar.svg?style=flat-square&color=amber)](https://www.npmjs.com/package/@crediblemark/buayar)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

> 🇮🇩 [Baca dalam Bahasa Indonesia](#-bahasa-indonesia) · 🇬🇧 [Read in English](#-english)

---

## 🇬🇧 English

**`@crediblemark/buayar`** is a **Unified Payment Gateway SDK** for Node.js and TypeScript, supporting **19 payment providers** (10 Indonesian + 9 International) through a single, consistent API.

> 💡 **Zero-Code PG Switcher:** Switch your active payment provider — e.g. from Midtrans to Stripe — **without changing a single line in your controller or service layer**. Just update the credentials in your `.env` file.

### 🚀 Key Features

- 🔄 **Zero-Code PG Switcher** — Swap providers via `.env` only. No code refactoring needed.
- ⚡ **Semi & Full Integration**:
  - 🟡 **Semi (Redirect/Hosted)** — Returns a `paymentUrl` to redirect customers to the PG's hosted checkout.
  - 🟢 **Full (Custom Native UI)** — Returns raw data (`vaNumber`, EMVCo `qrString`, `paymentCode`, `deeplink`) to render a completely custom payment UI.
- 🏷️ **Canonical Payment Methods** — Use universal codes (`bca_va`, `qris`, `gopay`, etc.) and the SDK maps them automatically to each provider's internal format.
- 📂 **Accordion-Ready Categorization** — Payment methods are pre-grouped by category (`Virtual Account`, `QRIS`, `E-Wallet`, `Retail`, `Credit Card`, `Paylater`) with fees and icon URLs included.
- 🪝 **Universal Webhook Verifier** — One endpoint to verify and normalize callbacks from any supported provider. Auto-detects the provider from the payload structure.
- 🛡️ **Strong TypeScript Types** — Fully typed request and response interfaces to catch errors at compile time.
- 🌍 **Multi-Currency** — Supports `currency` field for international providers (USD, EUR, GBP, INR, etc.).

### 📦 Supported Providers

#### 🇮🇩 Indonesian (10)

| Provider | Redirect | Direct API | Webhook | Client |
|---|:---:|:---:|:---:|:---:|
| Midtrans | ✅ Snap | ✅ Core API | SHA-512 | `MidtransClient` |
| Duitku | ✅ | ✅ | MD5 | `DuitkuClient` |
| iPaymu | ✅ | ✅ | HMAC-SHA256 | `IpaymuClient` |
| Xendit | ✅ Invoice v2 | ✅ Payments v3 | Token | `XenditClient` |
| DOKU Jokul | ✅ v1 | ✅ v2 | HMAC-SHA256 | `DokuClient` |
| PrismaLink | ✅ | ✅ | SHA-256 | `PrismalinkClient` |
| Faspay | ✅ | ✅ | SHA1(MD5) | `FaspayClient` |
| Finpay | ✅ | ✅ | HMAC-SHA512 | `FinpayClient` |
| Nicepay | ✅ | ✅ | SHA-256 | `NicepayClient` |
| OY! Bisnis | ✅ | ✅ | Header Auth | `OyClient` |

#### 🌍 International (9)

| Provider | Redirect | Direct API | Webhook | Client |
|---|:---:|:---:|:---:|:---:|
| Stripe | ✅ Checkout Sessions | ✅ Payment Intents | HMAC-SHA256 | `StripeClient` |
| PayPal | ✅ Orders v2 | ✅ Capture | OAuth2 | `PaypalClient` |
| Adyen | ✅ Sessions v68 | ✅ Payments v68 | HMAC-SHA256 | `AdyenClient` |
| Checkout.com | ✅ Payment Links | ✅ Payments API | HMAC-SHA256 | `CheckoutComClient` |
| Razorpay | ✅ Payment Links | ✅ Orders API | HMAC-SHA256 | `RazorpayClient` |
| Square | ✅ Payment Links | ✅ Payments API | HMAC-SHA256 | `SquareClient` |
| PayU | ✅ Orders v2.1 | ✅ Pay Methods | MD5/SHA-256 | `PayuClient` |
| Braintree | ✅ Drop-in UI Token | ✅ Transaction API | SHA1 HMAC | `BraintreeClient` |
| 2Checkout | ✅ REST v6.0 | ✅ REST v6.0 | IPN MD5 | `TwoCheckoutClient` |

### ⚙️ Environment Variables

#### Universal (Recommended)
```env
# Active provider: any of the 19 supported names
PROVIDER_PG=midtrans

# Universal credentials (auto-mapped per provider)
BUAYAR_API_KEY=your-server-key-or-secret
BUAYAR_MERCHANT_CODE=your-merchant-id-or-username
BUAYAR_SANDBOX=true

# Callback & Return URLs
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

#### Provider-Specific Variables

| Variable | Provider | Description |
| :--- | :--- | :--- |
| `MIDTRANS_SERVER_KEY` | Midtrans | Server Key |
| `MIDTRANS_CLIENT_KEY` | Midtrans | Client Key (frontend) |
| `DUITKU_API_KEY` / `DUITKU_MERCHANT_CODE` | Duitku | API Key & Merchant Code |
| `IPAYMU_API_KEY` / `IPAYMU_VA` | iPaymu | API Key & VA number |
| `XENDIT_SECRET_KEY` / `XENDIT_WEBHOOK_TOKEN` | Xendit | Secret Key & Webhook Token |
| `DOKU_CLIENT_ID` / `DOKU_SECRET_KEY` | DOKU | Client ID & Secret Key |
| `PRISMALINK_MERCHANT_ID` / `PRISMALINK_SECRET_KEY` | PrismaLink | Merchant ID & Secret Key |
| `FASPAY_MERCHANT_ID` / `FASPAY_USER_ID` / `FASPAY_PASSWORD` | Faspay | Merchant ID, User ID & Password |
| `FINPAY_MERCHANT_ID` / `FINPAY_MERCHANT_KEY` | Finpay | Merchant ID & Key |
| `NICEPAY_IMID` / `NICEPAY_KEY` | Nicepay | iMid & Merchant Key |
| `OY_USERNAME` / `OY_API_KEY` | OY! Bisnis | Username & API Key |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLIC_KEY` | Stripe | Secret, Webhook Secret, Publishable Key |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | PayPal | OAuth2 Credentials & Webhook ID |
| `ADYEN_API_KEY` / `ADYEN_MERCHANT_ACCOUNT` / `ADYEN_HMAC_KEY` | Adyen | API Key, Merchant Account & HMAC Key |
| `CHECKOUTCOM_SECRET_KEY` / `CHECKOUTCOM_PUBLIC_KEY` / `CHECKOUTCOM_WEBHOOK_SECRET` | Checkout.com | Secret, Public Key & Webhook Secret |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay | Key ID, Key Secret & Webhook Secret |
| `SQUARE_ACCESS_TOKEN` / `SQUARE_APPLICATION_ID` / `SQUARE_LOCATION_ID` | Square | Access Token, App ID & Location ID |
| `PAYU_POS_ID` / `PAYU_MD5_KEY` / `PAYU_OAUTH_CLIENT_ID` / `PAYU_OAUTH_CLIENT_SECRET` | PayU | POS ID, MD5 Key & OAuth2 Credentials |
| `BRAINTREE_MERCHANT_ID` / `BRAINTREE_PUBLIC_KEY` / `BRAINTREE_PRIVATE_KEY` | Braintree | Merchant ID, Public & Private Key |
| `TWOCHECKOUT_MERCHANT_CODE` / `TWOCHECKOUT_SECRET_KEY` / `TWOCHECKOUT_SECRET_WORD` | 2Checkout | Merchant Code, Secret Key & IPN Word |

### 📖 Usage

#### 1. Initialize (Zero-Config)
```typescript
import { buayar } from "@crediblemark/buayar";
// Reads config automatically from process.env
```

#### 2. Semi Integration — Redirect / Hosted Checkout
```typescript
const invoice = await buayar.createInvoice({
  orderId: "ORDER-1001",
  amount: 150000,
  productDetails: "Pro Plan Subscription",
  customer: { name: "John Doe", email: "john@example.com" },
  returnUrl: "https://myapp.com/orders/ORDER-1001",
  // No paymentMethod = redirect to PG hosted page
});

if (invoice.success) {
  redirect(invoice.paymentUrl!); // redirect user here
}
```

#### 3. Full Integration — Custom Native UI
```typescript
// Step A: Get available payment methods (accordion-ready)
const { categories } = await buayar.getPaymentMethods({ amount: 150000 });
// categories: { "Virtual Account": [...], "QRIS": [...], "E-Wallet": [...] }

// Step B: Charge with canonical method code
const vaInvoice = await buayar.createInvoice({
  orderId: "ORDER-1002",
  amount: 150000,
  paymentMethod: "bca_va", // canonical code — works across all providers
  productDetails: "Wallet Top-up",
  customer: { name: "John", email: "john@example.com" },
});

console.log(vaInvoice.vaNumber);   // "123456789012"
console.log(vaInvoice.vaBank);     // "bca"

// QRIS
const qrisInvoice = await buayar.createInvoice({
  orderId: "ORDER-1003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Coffee",
  customer: { name: "John", email: "john@example.com" },
});

console.log(qrisInvoice.qrString); // Raw EMVCo string for QR rendering
```

#### 4. Universal Webhook Handler
```typescript
// Works with Express, Elysia, Hono, Next.js App Router, etc.
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers);
  // Auto-detects the provider from payload — no manual routing needed

  if (!result.isValid) return res.status(400).json({ error: "Invalid signature" });

  if (result.isPaid) {
    // ✅ Payment confirmed — activate subscription, deliver product
    console.log(`Order ${result.orderId} paid — Amount: ${result.amount}`);
  }

  return res.status(200).json({ status: "OK" });
});
```

#### 5. Zero-Code PG Switch
```env
# Switch from Midtrans to Stripe — zero code change required
PROVIDER_PG=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 🇮🇩 Bahasa Indonesia

**`@crediblemark/buayar`** adalah **Unified Payment Gateway SDK** untuk Node.js dan TypeScript yang mendukung **19 payment provider** (10 Indonesia + 9 Internasional) melalui satu arsitektur API yang seragam.

> 💡 **Zero-Code PG Switcher:** Berganti provider payment gateway (misal dari Midtrans ke Duitku atau sebaliknya) **tanpa perlu merombak kode controller/service aplikasi**. Cukup ubah kredensial di file `.env`!

### 🚀 Fitur Utama

- 🔄 **Zero-Code PG Switcher** — Ganti provider hanya via `.env`, tanpa refactoring kode.
- ⚡ **Dukungan Spektrum Integrasi Penuh**:
  - 🟡 **Semi Integrasi (Redirect/Hosted)** — Menghasilkan `paymentUrl` untuk redirect ke halaman checkout PG.
  - 🟢 **Full Integrasi (Custom Native UI)** — Mengembalikan data mentah (`vaNumber`, `qrString` EMVCo, `paymentCode`, `deeplink`) untuk dirender di UI custom.
- 🏷️ **Canonical Payment Method Mapping** — Gunakan kode universal (`bca_va`, `qris`, `gopay`), SDK memetakannya otomatis ke format internal provider aktif.
- 📂 **Pre-Kategorisasi (Accordion Ready)** — Channel pembayaran sudah dikelompokkan per kategori (`Virtual Account`, `QRIS`, `E-Wallet`, `Retail`, `Kartu Kredit`, `Paylater`) lengkap dengan fee dan icon URL.
- 🪝 **Universal Webhook Verifier** — Satu endpoint untuk verifikasi dan normalisasi callback dari provider manapun. Provider terdeteksi otomatis dari struktur payload.
- 🛡️ **TypeScript Strong-Typed** — Interface request & response terdeklarasi penuh untuk mencegah runtime error.
- 🌍 **Multi-Currency** — Field `currency` untuk provider internasional (USD, EUR, GBP, dll).

### 📦 Provider yang Didukung

#### 🇮🇩 Lokal Indonesia (10)

* **Midtrans** — Snap API (Redirect/Popup) & Core API Direct Charge. Verifikasi SHA-512. `MidtransClient`.
* **Duitku** — Redirect Checkout & Direct Inquiry API. Verifikasi MD5. `DuitkuClient` (Disbursement, Inquiry Rekening, Saldo).
* **iPaymu** — Redirect & Direct Payment API v2. Verifikasi HMAC-SHA256. `IpaymuClient` (Cek Saldo, Cek Transaksi).
* **Xendit** — Invoice v2 & Payment Requests v3. Webhook Token. `XenditClient` (Saldo, Expire Invoice, Disbursement).
* **DOKU Jokul** — Checkout v1 & Direct API v2. HMAC-SHA256 + Digest. `DokuClient`.
* **PrismaLink** — Checkout Page & Direct API. SHA-256. `PrismalinkClient`.
* **Faspay** — Post Data Transaction (Redirect & Direct). SHA1(MD5()). `FaspayClient`.
* **Finpay** — Payment Initiate & Direct API. HMAC-SHA512. `FinpayClient`.
* **Nicepay** — Order Regist & One-Step API. SHA-256 merchantToken. `NicepayClient`.
* **OY! Bisnis** — Payment Checkout v2 & Direct VA/QRIS. Header Auth. `OyClient` (Inquiry, Saldo, Disbursement).

#### 🌍 Internasional (9)

* **Stripe** — Checkout Sessions (redirect) & Payment Intents (direct). HMAC-SHA256. `StripeClient`.
* **PayPal** — Orders API v2 + OAuth2 auto-token. `PaypalClient` (Capture, Refund, Saldo).
* **Adyen** — Sessions v68 (redirect) & Payments v68 (direct). HMAC-SHA256. `AdyenClient`.
* **Checkout.com** — Payment Links & Payments API. HMAC-SHA256. `CheckoutComClient`.
* **Razorpay** — Payment Links & Orders API. HMAC-SHA256. `RazorpayClient`.
* **Square** — Payment Links & Payments API. HMAC-SHA256. `SquareClient`.
* **PayU** — Orders API v2.1 + OAuth2. Verifikasi MD5/SHA-256. `PayuClient`.
* **Braintree** — Drop-in UI Client Token & Transaction API. SHA1 HMAC. `BraintreeClient`.
* **2Checkout/Verifone** — REST API 6.0. IPN MD5. `TwoCheckoutClient`.

### ⚙️ Konfigurasi Environment Variables (`.env`)

#### Universal (Direkomendasikan)
```env
# Provider aktif (19 pilihan tersedia)
PROVIDER_PG=midtrans

# Kredensial Universal (dipetakan otomatis per provider)
BUAYAR_API_KEY=server-key-atau-secret
BUAYAR_MERCHANT_CODE=merchant-id-atau-username
BUAYAR_SANDBOX=true

# Callback & Return URL
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

#### Kamus Variabel Lengkap Spesifik Provider

| Variabel `.env` | Provider | Keterangan |
| :--- | :--- | :--- |
| `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` | Midtrans | Server Key & Client Key |
| `DUITKU_API_KEY` / `DUITKU_MERCHANT_CODE` | Duitku | API Key & Merchant Code |
| `IPAYMU_API_KEY` / `IPAYMU_VA` | iPaymu | API Key & Nomor VA Merchant |
| `XENDIT_SECRET_KEY` / `XENDIT_WEBHOOK_TOKEN` | Xendit | Secret Key & Webhook Token |
| `DOKU_CLIENT_ID` / `DOKU_SECRET_KEY` | DOKU | Client ID & Secret Key |
| `PRISMALINK_MERCHANT_ID` / `PRISMALINK_SECRET_KEY` | PrismaLink | Merchant ID & Secret Key |
| `FASPAY_MERCHANT_ID` / `FASPAY_USER_ID` / `FASPAY_PASSWORD` | Faspay | Merchant ID, User ID & Password |
| `FASPAY_MERCHANT_NAME` | Faspay | Nama display merchant di halaman Faspay |
| `FINPAY_MERCHANT_ID` / `FINPAY_MERCHANT_KEY` | Finpay | Merchant ID & Merchant Key |
| `NICEPAY_IMID` / `NICEPAY_KEY` | Nicepay | iMid & Merchant Key |
| `OY_USERNAME` / `OY_API_KEY` | OY! Bisnis | Username & API Key |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLIC_KEY` | Stripe | Secret Key, Webhook Secret & Publishable Key |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | PayPal | Client ID, Client Secret & Webhook ID |
| `ADYEN_API_KEY` / `ADYEN_MERCHANT_ACCOUNT` / `ADYEN_HMAC_KEY` | Adyen | API Key, Merchant Account & HMAC Key |
| `ADYEN_CLIENT_KEY` / `ADYEN_LIVE_URL_PREFIX` | Adyen | Client Key (frontend) & Live URL prefix (production) |
| `CHECKOUTCOM_SECRET_KEY` / `CHECKOUTCOM_PUBLIC_KEY` / `CHECKOUTCOM_WEBHOOK_SECRET` | Checkout.com | Secret Key, Public Key & Webhook Secret |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Razorpay | Key ID, Key Secret & Webhook Secret |
| `SQUARE_ACCESS_TOKEN` / `SQUARE_APPLICATION_ID` / `SQUARE_LOCATION_ID` | Square | Access Token, App ID & Location ID |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square | Signature Key untuk verifikasi webhook |
| `PAYU_POS_ID` / `PAYU_MD5_KEY` | PayU | POS ID (Merchant ID) & MD5 Key untuk webhook |
| `PAYU_OAUTH_CLIENT_ID` / `PAYU_OAUTH_CLIENT_SECRET` | PayU | OAuth2 Client ID & Secret untuk Bearer Token |
| `BRAINTREE_MERCHANT_ID` / `BRAINTREE_PUBLIC_KEY` / `BRAINTREE_PRIVATE_KEY` | Braintree | Merchant ID, Public Key & Private Key |
| `TWOCHECKOUT_MERCHANT_CODE` / `TWOCHECKOUT_SECRET_KEY` / `TWOCHECKOUT_SECRET_WORD` | 2Checkout | Merchant Code, Secret Key & Secret Word (IPN) |

### 📖 Panduan Penggunaan

#### 1. Inisialisasi (Zero-Config)
```typescript
import { buayar } from "@crediblemark/buayar";
// Otomatis membaca konfigurasi dari process.env
```

#### 2. Mode Semi Integrasi (Redirect / Hosted Checkout)
```typescript
const invoice = await buayar.createInvoice({
  orderId: "ORDER-1001",
  amount: 150000,
  productDetails: "Langganan Paket Pro 1 Bulan",
  customer: { name: "Budi Santoso", email: "budi@example.com" },
  returnUrl: "https://myapp.com/orders/ORDER-1001",
  // Tanpa paymentMethod = redirect ke halaman checkout PG
});

if (invoice.success) {
  redirect(invoice.paymentUrl!);
}
```

#### 3. Mode Full Integrasi (Custom Native UI)
```typescript
// Langkah A: Ambil daftar metode pembayaran (Accordion-Ready)
const { categories } = await buayar.getPaymentMethods({ amount: 150000 });
// categories: { "Virtual Account": [...], "QRIS": [...], "E-Wallet": [...] }

// Langkah B: Direct Charge dengan kode canonical
const vaInvoice = await buayar.createInvoice({
  orderId: "ORDER-1002",
  amount: 150000,
  paymentMethod: "bca_va", // kode canonical — berlaku di semua provider
  productDetails: "Topup Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA:", vaInvoice.vaNumber);  // "123456789012"
console.log("Bank:", vaInvoice.vaBank);        // "bca"
console.log("QRIS:", vaInvoice.qrString);      // Raw EMVCo string
```

#### 4. Universal Webhook Handler
```typescript
// Bekerja dengan Express, Elysia, Hono, Next.js App Router, dll.
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers);
  // Provider terdeteksi otomatis dari struktur payload

  if (!result.isValid) return res.status(400).json({ error: "Invalid signature" });

  if (result.isPaid) {
    console.log(`✅ Order ${result.orderId} senilai ${result.amount} telah LUNAS!`);
    // Aktifkan langganan / kirim produk
  }

  return res.status(200).json({ status: "OK" });
});
```

#### 5. Zero-Code PG Switch
```env
# Ganti dari Midtrans ke Stripe — tanpa ubah satu baris kode pun
PROVIDER_PG=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 🏷️ Daftar Canonical Payment Methods

| Kategori | Canonical Code | Keterangan |
| :--- | :--- | :--- |
| **Virtual Account** | `bca_va`, `mandiri_va`, `bni_va`, `bri_va`, `permata_va`, `cimb_va`, `danamon_va`, `bsi_va`, `seabank_va` | Transfer bank via VA |
| **QRIS** | `qris`, `gopay_qris`, `shopeepay_qris`, `nobu_qris` | QRIS standar EMVCo |
| **E-Wallet** | `gopay`, `shopeepay`, `ovo`, `dana`, `linkaja`, `jenius` | Dompet digital |
| **Retail** | `alfamart`, `indomaret`, `pos` | Bayar di gerai retail |
| **Kartu Kredit** | `credit_card` | Visa, Mastercard, JCB, Amex |
| **Paylater** | `kredivo`, `akulaku`, `indodana` | Cicilan & paylater |
| **International** | `apple_pay`, `google_pay`, `paypal`, `klarna`, `sepa` | Metode internasional |

---

## 📄 License / Lisensi

MIT License — Copyright © 2026 Rasyiqi Crediblemark.

This project is licensed under the **MIT License**. You are free to use, modify, and distribute it in personal and commercial projects.

Proyek ini dilisensikan di bawah **MIT License**. Bebas digunakan, dimodifikasi, dan didistribusikan untuk keperluan personal maupun komersial.
