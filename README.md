# 💳 @crediblemark/buayar

[![npm version](https://img.shields.io/npm/v/@crediblemark/buayar.svg?style=flat-square&color=amber)](https://www.npmjs.com/package/@crediblemark/buayar)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Tests](https://github.com/crediblemark-official/Buayar/actions/workflows/tests.yml/badge.svg?style=flat-square)](https://github.com/crediblemark-official/Buayar/actions/workflows/tests.yml)
[![Typecheck](https://github.com/crediblemark-official/Buayar/actions/workflows/typecheck.yml/badge.svg?style=flat-square)](https://github.com/crediblemark-official/Buayar/actions/workflows/typecheck.yml)
[![audit](https://img.shields.io/badge/PG%20audit-D1%E2%80%A6D17%20%7C%20M1%E2%80%A6M15%20%7C%20X1%E2%80%A6X8%20%7C%20I1%E2%80%A6I9-verified-blueviolet?style=flat-square)](docs/REVIEW-PG-FIDELITY.md)
[![docs](https://img.shields.io/badge/docs-per%20provider%20%C3%9721-8A2BE2?style=flat-square)](docs/providers/README.md)

> 🇮🇩 [Baca dalam Bahasa Indonesia](#-bahasa-indonesia) · 🇬🇧 [Read in English](#-english)

### 📚 Documentation / Dokumentasi

| Dokumen | Isi |
|---|---|
| **[docs/providers/](docs/providers/README.md)** | **Implementasi per provider (×21)** — peta file, operasi, kredensial, endpoint, status verifikasi live |
| [docs/REVIEW-PG-FIDELITY.md](docs/REVIEW-PG-FIDELITY.md) | Audit fidelity vs dokumentasi resmi PG (D-1…D-17, M-1…M-15, X-1…X-8, I-1…I-9, DU/N/F/FP) |
| [docs/AUDIT-BUG-DAN-PREMATURE.md](docs/AUDIT-BUG-DAN-PREMATURE.md) | Ringkasan bug "premature" & status perbaikan per provider |
| [docs/guide.md](docs/guide.md) · [docs/sumopod.md](docs/sumopod.md) | Panduan pemakaian SDK · panduan lengkap SumoPod |

---

## 🇬🇧 English

**`@crediblemark/buayar`** is a **Unified Payment Gateway SDK** for Node.js and TypeScript, supporting **21 payment providers** (12 Indonesian + 9 International) through a single, consistent API.

> 💡 **Zero-Code PG Switcher:** Switch your active payment provider — e.g. from Midtrans to Stripe — **without changing a single line in your controller or service layer**. Just update the credentials in your `.env` file.

### 🚀 Key Features

- 🔄 **Zero-Code PG Switcher** — Swap providers via `.env` only. No code refactoring needed.
- 🧪 **Zero-Approval Contract Simulator** — Develop and test production-grade integration without waiting 3–6 weeks for merchant account approvals. Enable via `BUAYAR_SIMULATE=1` or `buayar.simulator`.
- 🛡️ **Fail-Closed Webhook Verifier (21/21)** — Universal callback endpoint that rejects invalid or unsigned webhooks across all 21 providers with raw-byte streaming support.
- 🔒 **Compiler-Enforced Portability** — Canonical payment methods (`bca_va`, `qris`, `gopay`, etc.) are type-safe; provider-internal codes are caught at compile time.
- ⚡ **Pre-Flight Capability Verification** — Validates payment method support before network requests are dispatched, returning actionable errors.
- ⚡ **Semi & Full Integration**:
  - 🟡 **Semi (Redirect/Hosted)** — Returns a `paymentUrl` to redirect customers to the PG's hosted checkout.
  - 🟢 **Full (Custom Native UI)** — Returns raw data (`vaNumber`, EMVCo `qrString`, `paymentCode`, `deeplink`) to render a completely custom payment UI.
- 🏷️ **Canonical Payment Methods** — Use universal codes and the SDK maps them automatically to each provider's internal format.
- 📂 **Accordion-Ready Categorization** — Payment methods are pre-grouped by category (`Virtual Account`, `QRIS`, `E-Wallet`, `Retail`, `Credit Card`, `Paylater`) with fees and icon URLs included.
- 🔎 **Live Channel & Payload Probes** — `bun run probe` runs every provider's per-channel probe with a JSON summary; live channel lists come from the iPaymu/Xendit APIs and the DOKU MCP Server (falls back to the static catalog with an honest `source: "static"` marker).
- 🌍 **Multi-Currency** — Supports `currency` field for international providers (USD, EUR, GBP, INR, etc.).

### 📦 Supported Providers

> 📄 Each provider has its own implementation doc — files, operations, credentials, endpoints & live verification status — in [`docs/providers/<provider>/README.md`](docs/providers/README.md).

#### 🇮🇩 Indonesian & Regional (12)

| Provider | Status | Redirect | Direct API | Webhook | Client |
|---|:---:|:---:|:---:|:---:|:---:|
| [Midtrans](docs/providers/midtrans/README.md) | ✅ **Live Sandbox Tested** | ✅ Snap | ✅ Core API + BI-SNAP | SHA-512 | `MidtransClient` |
| [Duitku](docs/providers/duitku/README.md) | ✅ **Live Sandbox Tested** | ✅ POP | ✅ Direct Inquiry | MD5 / HMAC | `DuitkuClient` |
| [iPaymu](docs/providers/ipaymu/README.md) | ✅ **Live Sandbox Tested** | ✅ Redirect | ✅ Direct Payment | HMAC-SHA256 | `IpaymuClient` |
| [Xendit](docs/providers/xendit/README.md) | ✅ **Live Sandbox Tested** | ✅ Sessions v3 | ✅ Payments v3 | Token | `XenditClient` |
| [DOKU Jokul](docs/providers/doku/README.md) | ✅ **Live Sandbox Tested** | ✅ Checkout v2 | ✅ Direct v2 + SNAP | HMAC-SHA256 | `DokuClient` |
| [SumoPod](docs/providers/sumopod/README.md) | ✅ **Live Tested** | ✅ Payments v1 | ✅ QRIS API | Svix / Token | `SumopodClient` |
| [Xenith](docs/providers/xenith/README.md) | ✅ **Live Sandbox Tested** | ✅ Hosted Link | ✅ Direct Pay In (VA/QRIS) | HMAC-SHA256 | `XenithClient` |
| [Nicepay](docs/providers/nicepay/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ | ✅ | SHA-256 | `NicepayClient` |
| [Faspay](docs/providers/faspay/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ | ✅ | SHA1(MD5) | `FaspayClient` |
| [OY! Bisnis](docs/providers/oy/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ | ✅ | Header Auth | `OyClient` |
| [PrismaLink](docs/providers/prismalink/README.md) | ⏸️ **Untested** *(Gateway Unstable / Sandbox Inaccessible)* | ✅ | ✅ | SHA-256 | `PrismalinkClient` |
| [Finpay](docs/providers/finpay/README.md) | ✅ **Tested Live (Sandbox)** | ✅ | ✅ | HMAC-SHA512 | `FinpayClient` |

#### 🌍 International (9)

| Provider | Status | Redirect | Direct API | Webhook | Client |
|---|:---:|:---:|:---:|:---:|:---:|
| [Stripe](docs/providers/stripe/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Checkout Sessions | ✅ Payment Intents | HMAC-SHA256 | `StripeClient` |
| [PayPal](docs/providers/paypal/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Orders v2 | ✅ Capture | OAuth2 | `PaypalClient` |
| [Adyen](docs/providers/adyen/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Sessions v68 | ✅ Payments v68 | HMAC-SHA256 | `AdyenClient` |
| [Checkout.com](docs/providers/checkoutcom/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Payment Links | ✅ Payments API | HMAC-SHA256 | `CheckoutComClient` |
| [Razorpay](docs/providers/razorpay/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Payment Links | ✅ Orders API | HMAC-SHA256 | `RazorpayClient` |
| [Square](docs/providers/square/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Payment Links | ✅ Payments API | HMAC-SHA256 | `SquareClient` |
| [PayU](docs/providers/payu/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Orders v2.1 | ✅ Pay Methods | MD5/SHA-256 | `PayuClient` |
| [Braintree](docs/providers/braintree/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ Drop-in UI Token | ✅ Transaction API | SHA1 HMAC | `BraintreeClient` |
| [2Checkout](docs/providers/twocheckout/README.md) | ⏳ **Untested Live** *(Simulator Only)* | ✅ REST v6.0 | ✅ REST v6.0 | IPN MD5 | `TwoCheckoutClient` |

### ⚙️ Environment Variables

#### Universal (Recommended)
```env
# (optional) Active provider: any of the 21 supported names
# If empty, the provider is AUTO-DETECTED from filled credentials.
BUAYAR_PROVIDER=midtrans

# Universal credentials (auto-mapped per provider — same set for ALL providers)
BUAYAR_API_KEY=your-server-key-or-secret
BUAYAR_MERCHANT_CODE=your-merchant-id-or-username
BUAYAR_CLIENT_KEY=your-client-or-public-key
BUAYAR_MERCHANT_ID=your-merchant-id
BUAYAR_SANDBOX=true

# Callback & Return URLs
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

#### Build-time introspection (portability helpers)

Check what a provider actually supports — no docs digging:

```ts
import { buayar } from "@crediblemark/buayar";

buayar.listProviders();                    // all 21 registered providers
buayar.detectProviderFromEnv(process.env); // guess active provider from .env
buayar.detectProviderFromPayload(payload); // guess provider from webhook payload
buayar.getCapabilities("duitku");
// { methods: [...], operations: { refund: false, checkBalance: true, disburse: true } }
buayar.supports("xendit", "checkBalance"); // true
buayar.supportsMethod("qris", "stripe");   // true
```

#### Universal Credential Mapping (`BUAYAR_*`)

You don't need provider-specific variable names. Simply use unified **`BUAYAR_*`** variables:

| Provider | `BUAYAR_PROVIDER` | `BUAYAR_API_KEY` | `BUAYAR_MERCHANT_CODE` | `BUAYAR_CLIENT_KEY` / Extra |
| :--- | :--- | :--- | :--- | :--- |
| **Midtrans** | `midtrans` | Server Key | *(optional)* | Client Key |
| **Duitku** | `duitku` | API Key | Merchant Code | *(not needed)* |
| **iPaymu** | `ipaymu` | API Key | Virtual Account (VA) | *(not needed)* |
| **Xendit** | `xendit` | Secret Key | *(optional)* | Webhook Token (`BUAYAR_WEBHOOK_SECRET`) |
| **DOKU Jokul** | `doku` | Secret Key | Client ID / Merchant ID | Client ID |
| **Xenith** | `xenith` | Access Key (`ak-...`) | *(not needed)* | Secret Key (`sk-...`) / `BUAYAR_WEBHOOK_SECRET` |
| **PrismaLink** | `prismalink` | Secret Key | Merchant ID | *(not needed)* |
| **Faspay** | `faspay` | Password | Merchant ID | User ID |
| **Finpay** | `finpay` | Merchant Key | Merchant ID | *(not needed)* |
| **Nicepay** | `nicepay` | Server Key | I-MID | *(not needed)* |
| **OY! Bisnis** | `oy` | API Key | Username | Username |
| **Stripe** | `stripe` | Secret Key | *(not needed)* | Publishable Key / Webhook Secret |
| **PayPal** | `paypal` | Client Secret | Client ID | Client ID |
| **Adyen** | `adyen` | API Key | Merchant Account | Client Key / HMAC Key |
| **Checkout.com** | `checkoutcom` | Secret Key | *(not needed)* | Public Key / Webhook Secret |
| **Razorpay** | `razorpay` | Key Secret | Key ID | Key ID |
| **Square** | `square` | Access Token | App ID | Location ID (`BUAYAR_PROJECT_ID`) |
| **PayU** | `payu` | MD5 Key | POS ID | POS ID |
| **Braintree** | `braintree` | Private Key | Merchant ID | Public Key |
| **2Checkout** | `twocheckout` | Secret Key | Merchant Code | Secret Word (`BUAYAR_WEBHOOK_SECRET`) |
| **[SumoPod](docs/sumopod.md)** | `sumopod` | API Key (`X-Api-Key`) | *(not needed)* | Webhook Secret / Token (`BUAYAR_WEBHOOK_SECRET`) |

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
  paymentMethod: "bca_va", // canonical code — mapped per provider automatically
  productDetails: "Wallet Top-up",
  customer: { name: "John", email: "john@example.com" },
});

console.log(vaInvoice.vaNumber);   // "123456789012"
console.log(vaInvoice.vaBank);     // "bca"
console.log(vaInvoice.mode);       // "va" — normalised across all 21 providers

// QRIS
const qrisInvoice = await buayar.createInvoice({
  orderId: "ORDER-1003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Coffee",
  customer: { name: "John", email: "john@example.com" },
});

console.log(qrisInvoice.qrString ?? qrisInvoice.qrCodeUrl);
// ⚠️ `qrString` (EMVCo raw) hanya diisi provider yang benar-benar mengembalikannya
// (Xendit, Duitku, iPaymu, DOKU, …). Midtrans Core API hanya memberi URL PNG.
// Selalu pakai `?? qrCodeUrl` supaya portabel lintas provider.
```

> **Canonical ≠ tersedia di semua provider.** Tidak ada satu pun kode method yang
> didukung 21/21. `buayar.supportsMethod("gopay", "duitku")` memberi jawaban
> sebelum request dikirim, dan `getCapabilities("duitku").methods` memberi daftar
> lengkapnya. Method di luar daftar ditolak pre-flight, bukan gagal 400 dari PG.
> Lihat tabel method per provider di [`docs/providers/README.md`](docs/providers/README.md).

#### 4. Universal Webhook Handler
```typescript
// Works with Express, Elysia, Hono, Next.js App Router, etc.
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers, /* config? */ undefined);
  // Provider diambil dari BUAYAR_PROVIDER / config yang aktif.

  // ⚠️ Deteksi dari payload HANYA jalan bila TIDAK ada provider yang dikonfigurasi.
  // Kalau BUAYAR_PROVIDER di-set, payload milik provider lain akan ditolak — itu
  // fail-closed yang disengaja, bukan bug. Kalau kamu menerima webhook dari
  >1 provider sekaligus, panggil `buayar.detectProviderFromPayload(payload, headers)`
  // lalu teruskan hasilnya sebagai `configOverride.provider`.

  if (!result.isValid) return res.status(400).json({ error: "Invalid signature" });

  if (result.isPaid) {
    // ✅ Payment confirmed — activate subscription, deliver product
    console.log(`Order ${result.orderId} paid — Amount: ${result.amount}`);
  }

  return res.status(200).json({ status: "OK" });
});
```

> **`rawBody` wajib diteruskan** untuk provider yang menandatangani byte mentah
> (Stripe, Checkout.com, Razorpay, Square, PayU, Braintree, DOKU SNAP, SumoPod,
> Xenith). Tanpa itu verifikasi selalu `false` dan `result.error` menjelaskan
> caranya. Template dari `buayar init` sudah menangani ini dengan benar.

#### 5. Zero-Code PG Switch
```env
# Switch from Midtrans to Stripe — zero code change required
BUAYAR_PROVIDER=stripe
BUAYAR_API_KEY=sk_live_...
BUAYAR_WEBHOOK_SECRET=whsec_...
```

> ⚠️ **Dua hal yang harus diketahui sebelum bergantung pada switcher:**
>
> 1. **`BUAYAR_PROVIDER` itu wajib** kalau kamu memakai kredensial universal
>    (`BUAYAR_*`). Autodetect hanya membaca env berprefiks provider
>    (`MIDTRANS_SERVER_KEY`, `STRIPE_SECRET_KEY`, …) — nama universalnya sama
>    untuk semua provider sehingga tidak ada yang bisa ditebak.
> 2. **Jangan campur kredensial provider lain di satu `.env`.** Versi lama membaca
>    webhook secret secara global, sehingga `SUMOPOD_WEBHOOK_TOKEN` yang tertinggal
>    akan menimpa token Xendit dan menggagalkan 100% webhook. Sekarang sudah
>    di-scope per provider, tapi satu env per provider tetap cara paling aman.
>
> Semua provider juga punya **field wajib yang spesifik** (contoh: iPaymu
> mewajibkan `customer.phone` 5–15 digit). Ini divalidasi pre-flight dengan pesan
> yang menyebut provider dan field-nya — lihat
> [`src/core/requirements.ts`](src/core/requirements.ts).

#### 6. Which providers are actually verified?

Not all 21 providers have been fired at a real sandbox. The SDK reports this
itself rather than leaving you to guess:

```bash
npx buayar audit             # table
npx buayar audit --json      # for CI
```

```typescript
buayar.listVerifiedProviders();    // ["doku","duitku","finpay","ipaymu","midtrans","sumopod","xendit","xenith"]
buayar.listUnverifiedProviders();  // 13 sisanya
buayar.getCapabilities("stripe")?.verified;          // false
buayar.getCapabilities("stripe")?.verificationNote;  // "Butuh API key sandbox Stripe (sk_test_...)"
```

> **What `verified: false` does and does not mean.**
> It does **not** mean the code is broken or unfinished. The implementation is
> complete and locked down by contract/simulator tests — webhook fail-closed,
> real signature generation, pre-flight rejection. What is missing is only
> end-to-end proof against a live server, because the sandbox credentials are
> not available yet. Treat it as "not yet proven", not "not ready".

---

## 🇮🇩 Bahasa Indonesia

**`@crediblemark/buayar`** adalah **Unified Payment Gateway SDK** untuk Node.js dan TypeScript yang mendukung **21 payment provider** (12 Indonesia + 9 Internasional) melalui satu arsitektur API yang seragam.

> 💡 **Zero-Code PG Switcher:** Berganti provider payment gateway (misal dari Midtrans ke Duitku atau sebaliknya) **tanpa perlu merombak kode controller/service aplikasi**. Cukup ubah kredensial di file `.env`!

### 🚀 Fitur Utama

- 🔄 **Zero-Code PG Switcher** — Ganti provider hanya via `.env`, tanpa refactoring kode.
- 🧪 **Zero-Approval Contract Simulator** — Koding dan uji transaksi secara production-grade sebelum menunggu 3–6 minggu persetujuan akun PG. Cukup aktifkan `BUAYAR_SIMULATE=1` atau `buayar.simulator`.
- 🛡️ **Fail-Closed Webhook Verifier (21/21)** — Satu endpoint untuk verifikasi dan normalisasi callback dari seluruh 21 provider dengan fail-closed ketat dan dukungan streaming raw bytes.
- 🔒 **Compiler-Enforced Portability** — Canonical payment method terjamin type-safe; kode method provider yang tidak portable langsung dicegah oleh `tsc`.
- ⚡ **Pre-flight Capability Check** — Validasi kapabilitas pembayaran sebelum request dikirim ke PG, mencegah kegagalan runtime.
- ⚡ **Dukungan Spektrum Integrasi Penuh**:
  - 🟡 **Semi Integrasi (Redirect/Hosted)** — Menghasilkan `paymentUrl` untuk redirect ke halaman checkout PG.
  - 🟢 **Full Integrasi (Custom Native UI)** — Mengembalikan data mentah (`vaNumber`, `qrString` EMVCo, `paymentCode`, `deeplink`) untuk dirender di UI custom.
- 🏷️ **Canonical Payment Method Mapping** — Gunakan kode universal (`bca_va`, `qris`, `gopay`), SDK memetakannya otomatis ke format internal provider aktif.
- 📂 **Pre-Kategorisasi (Accordion Ready)** — Channel pembayaran sudah dikelompokkan per kategori (`Virtual Account`, `QRIS`, `E-Wallet`, `Retail`, `Kartu Kredit`, `Paylater`) lengkap dengan fee dan icon URL.
- 🌍 **Multi-Currency** — Field `currency` untuk provider internasional (USD, EUR, GBP, dll).
- 🔎 **Probe Channel & Payload Live** — `bun run probe` menjalankan probe per-channel semua provider dengan ringkasan JSON; daftar channel live diambil dari API iPaymu/Xendit dan DOKU MCP Server (fallback ke katalog statis dengan penanda jujur `source: "static"`).
- 🛠️ **CLI Tools** — Scaffold boilerplate (`buayar init`) & auto-generate `payment-channels.json` (`buayar channels`).

### 📦 Provider yang Didukung

> 📄 Setiap provider punya dokumen implementasi sendiri — peta file, operasi, kredensial, endpoint & status verifikasi live — di [`docs/providers/<provider>/README.md`](docs/providers/README.md).

#### 🇮🇩 Lokal Indonesia (11)

* **[Midtrans](docs/providers/midtrans/README.md)** `[Contract Tested]` — Snap API (Redirect/Popup) & Core API Direct Charge. Verifikasi SHA-512. `MidtransClient`. Mendukung **BI-SNAP Core API** (opt-in via `config.extra.snap`) untuk VA & QRIS MPM: access token `SHA256withRSA`, signature transaksi `HMAC_SHA512`, status numerik, notifikasi asimetris.
* **[Duitku](docs/providers/duitku/README.md)** `[Contract Tested]` — Redirect Checkout & Direct Inquiry API. Verifikasi MD5. `DuitkuClient` (Disbursement, Inquiry Rekening, Saldo).
* **[iPaymu](docs/providers/ipaymu/README.md)** `[Live & Contract Tested]` — Redirect & Direct Payment API v2. Verifikasi HMAC-SHA256. `IpaymuClient` (Cek Saldo, Cek Transaksi, Histori, Bank List, Dynamic Methods, COD).
* **[Xendit](docs/providers/xendit/README.md)** `[Contract Tested]` — Invoice v2 & Payment Requests v3. Webhook Token. `XenditClient` (Saldo, Expire Invoice, Disbursement).
* **[DOKU Jokul](docs/providers/doku/README.md)** `[Contract Tested]` — Checkout v1 & Direct API v2. HMAC-SHA256 + Digest. `DokuClient`. Daftar channel **live** via DOKU MCP Server (`get_merchant_payment_methods`, sandbox 32 channel), fallback katalog statis.
* **[PrismaLink](docs/providers/prismalink/README.md)** `[Contract Tested]` — Checkout Page & Direct API. SHA-256. `PrismalinkClient`. ⏸️ **Terblokir (FP-2):** gateway tidak stabil & registrasi sandbox/staging tidak dapat diakses.
* **[Faspay](docs/providers/faspay/README.md)** `[Contract Tested]` — Post Data Transaction (Redirect & Direct). SHA1(MD5()). `FaspayClient`.
* **[Finpay](docs/providers/finpay/README.md)** `[Live & Contract Tested]` — Hosted Payment & Core API (`/pg/payment/card/initiate`), Basic auth, status check `GET /pg/payment/card/check/{orderId}`. Signature callback HMAC-SHA512. `FinpayClient`. Selaras [docs.finpay.id](https://docs.finpay.id); probe live per kanal: `bun run probe finpay`.
* **[Nicepay](docs/providers/nicepay/README.md)** `[Contract Tested]` — Order Regist & One-Step API. SHA-256 merchantToken. `NicepayClient`.
* **[OY! Bisnis](docs/providers/oy/README.md)** `[Contract Tested]` — Payment Checkout v2 & Direct VA/QRIS. Header Auth. `OyClient` (Inquiry, Saldo, Disbursement).
* **[SumoPod](docs/providers/sumopod/README.md)** `[Live & Contract Tested]` — Payment Link API v1 & QRIS. Verifikasi Svix HMAC-SHA256 / X-Webhook-Token. `SumopodClient`. *Lihat [panduan lengkap SumoPod](docs/sumopod.md)*.

#### 🌍 Internasional (9)

* **[Stripe](docs/providers/stripe/README.md)** `[Contract Tested]` — Checkout Sessions (redirect) & Payment Intents (direct). HMAC-SHA256. `StripeClient`.
* **[PayPal](docs/providers/paypal/README.md)** `[Contract Tested]` — Orders API v2 + OAuth2 auto-token. `PaypalClient` (Capture, Refund, Saldo).
* **[Adyen](docs/providers/adyen/README.md)** `[Contract Tested]` — Sessions v68 (redirect) & Payments v68 (direct). HMAC-SHA256. `AdyenClient`.
* **[Checkout.com](docs/providers/checkoutcom/README.md)** `[Contract Tested]` — Payment Links & Payments API. HMAC-SHA256. `CheckoutComClient`.
* **[Razorpay](docs/providers/razorpay/README.md)** `[Contract Tested]` — Payment Links & Orders API. HMAC-SHA256. `RazorpayClient`.
* **[Square](docs/providers/square/README.md)** `[Contract Tested]` — Payment Links & Payments API. HMAC-SHA256. `SquareClient`.
* **[PayU](docs/providers/payu/README.md)** `[Contract Tested]` — Orders API v2.1 + OAuth2. Verifikasi MD5/SHA-256. `PayuClient`.
* **[Braintree](docs/providers/braintree/README.md)** `[Contract Tested]` — Drop-in UI Client Token & Transaction API. SHA1 HMAC. `BraintreeClient`.
* **[2Checkout/Verifone](docs/providers/twocheckout/README.md)** `[Contract Tested]` — REST API 6.0. IPN MD5. `TwoCheckoutClient`.

### ⚙️ Konfigurasi Environment Variables (`.env`)

#### Universal (Direkomendasikan)
```env
# Provider aktif (21 pilihan). Wajib diisi bila memakai kredensial universal BUAYAR_*.
# dari kredensial yang terisi. Set var ini sama untuk semua provider.
BUAYAR_PROVIDER=midtrans

# Kredensial Universal (dipetakan otomatis per provider)
BUAYAR_API_KEY=server-key-atau-secret
BUAYAR_MERCHANT_CODE=merchant-id-atau-username
BUAYAR_CLIENT_KEY=client-atau-public-key
BUAYAR_MERCHANT_ID=merchant-id
BUAYAR_SANDBOX=true

# Callback & Return URL
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

#### Pemetaan Kredensial ke Variabel Universal `BUAYAR_*`

Anda **tidak perlu** membuat nama variabel khusus per provider. Cukup gunakan set variabel seragam **`BUAYAR_*`**. Tabel berikut menunjukkan data apa dari dashboard masing-masing payment gateway yang perlu Anda masukkan ke variabel `BUAYAR_*`:

| Provider | `BUAYAR_PROVIDER` | `BUAYAR_API_KEY` | `BUAYAR_MERCHANT_CODE` | `BUAYAR_CLIENT_KEY` / Tambahan |
| :--- | :--- | :--- | :--- | :--- |
| **Midtrans** | `midtrans` | Server Key | *(opsional)* | Client Key |
| **Duitku** | `duitku` | API Key | Merchant Code | *(tidak perlu)* |
| **iPaymu** | `ipaymu` | API Key | Nomor Virtual Account (VA) | *(tidak perlu)* |
| **Xendit** | `xendit` | Secret Key | *(opsional)* | Webhook Token (`BUAYAR_WEBHOOK_SECRET`) |
| **DOKU Jokul** | `doku` | Secret Key | Client ID / Merchant ID | Client ID |
| **PrismaLink** | `prismalink` | Secret Key | Merchant ID | *(tidak perlu)* |
| **Faspay** | `faspay` | Password | Merchant ID | User ID |
| **Finpay** | `finpay` | Merchant Key | Merchant ID | *(tidak perlu)* |
| **Nicepay** | `nicepay` | Server Key | I-MID | *(tidak perlu)* |
| **OY! Bisnis** | `oy` | API Key | Username | Username |
| **Stripe** | `stripe` | Secret Key | *(tidak perlu)* | Publishable Key / Webhook Secret |
| **PayPal** | `paypal` | Client Secret | Client ID | Client ID |
| **Adyen** | `adyen` | API Key | Merchant Account | Client Key / HMAC Key |
| **Checkout.com** | `checkoutcom` | Secret Key | *(tidak perlu)* | Public Key / Webhook Secret |
| **Razorpay** | `razorpay` | Key Secret | Key ID | Key ID |
| **Square** | `square` | Access Token | App ID | Location ID (`BUAYAR_PROJECT_ID`) |
| **PayU** | `payu` | MD5 Key | POS ID | POS ID |
| **Braintree** | `braintree` | Private Key | Merchant ID | Public Key |
| **2Checkout** | `twocheckout` | Secret Key | Merchant Code | Secret Word (`BUAYAR_WEBHOOK_SECRET`) |
| **[SumoPod](docs/sumopod.md)** | `sumopod` | API Key (`X-Api-Key`) | *(tidak perlu)* | Webhook Secret (`BUAYAR_WEBHOOK_SECRET`) / Token (`BUAYAR_WEBHOOK_TOKEN`) |

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
  paymentMethod: "bca_va", // kode canonical — dipetakan otomatis per provider
  productDetails: "Topup Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA:", vaInvoice.vaNumber);  // "123456789012"
console.log("Bank:", vaInvoice.vaBank);        // "bca"
console.log("Kanal:", vaInvoice.mode);          // "va" — seragam di 21 provider

// QRIS
const qrisInvoice = await buayar.createInvoice({
  orderId: "ORDER-1003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("QRIS:", qrisInvoice.qrString ?? qrisInvoice.qrCodeUrl);
// ⚠️ `qrString` (EMVCo mentah) hanya diisi provider yang benar-benar
// mengembalikannya. Midtrans Core API hanya memberi URL PNG, bukan string EMVCo.
// Karena itu selalu pakai `?? qrCodeUrl` agar portabel lintas provider.
```

> **Canonical ≠ tersedia di semua provider.** Tidak ada satu pun kode method yang
> didukung 21/21 — `indodana` hanya di Duitku, `gopay` hanya di 4 provider, dan
> `apple_pay` hanya di provider international. Cara memastikannya:
>
> ```typescript
> buayar.supportsMethod("gopay", "duitku");              // false — ditolak sebelum request
> buayar.getCapabilities("duitku").methods;              // daftar lengkap yang didukung
> buayar.getCapabilities("adyen").serverForwardedMethods; // method yang benar-benar dikirim ke PG
> ```
>
> Method di luar daftar ditolak pre-flight dengan pesan jelas — bukan gagal 400 dari PG.

#### 4. Universal Webhook Handler
```typescript
// Bekerja dengan Express, Elysia, Hono, Next.js App Router, dll.
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers);
  // Provider diambil dari BUAYAR_PROVIDER / config yang aktif.

  // ⚠️ Deteksi dari payload HANYA jalan bila TIDAK ada provider yang dikonfigurasi.
  // Kalau BUAYAR_PROVIDER di-set, payload provider lain ditolak — itu fail-closed
  // yang disengaja. Untuk webhook multi-provider, tentukan sendiri provider-nya:
  //
  //   const detected = buayar.detectProviderFromPayload(req.body, req.headers);
  //   const result = await buayar.verifyWebhook(req.body, req.headers, { provider: detected });

  if (!result.isValid) return res.status(400).json({ error: "Invalid signature" });

  if (result.isPaid) {
    console.log(`✅ Order ${result.orderId} senilai ${result.amount} telah LUNAS!`);
    // Aktifkan langganan / kirim produk
  }

  return res.status(200).json({ status: "OK" });
});
```

> **`rawBody` wajib diteruskan** untuk provider yang menandatangani byte mentah
> (Stripe, Checkout.com, Razorpay, Square, PayU, Braintree, DOKU SNAP, SumoPod,
> Xenith). Tanpa itu verifikasi selalu `false`. Template dari `buayar init`
> sudah menangani ini dengan benar.

#### 5. Zero-Code PG Switch
```env
# Ganti dari Midtrans ke Stripe — tanpa ubah satu baris kode pun
BUAYAR_PROVIDER=stripe
BUAYAR_API_KEY=sk_live_...
BUAYAR_WEBHOOK_SECRET=whsec_...
```

> ⚠️ **Dua hal yang harus diketahui sebelum bergantung pada switcher:**
>
> 1. **`BUAYAR_PROVIDER` itu wajib** bila memakai kredensial universal (`BUAYAR_*`).
>    Autodetect hanya membaca env berprefiks provider (`MIDTRANS_SERVER_KEY`,
>    `STRIPE_SECRET_KEY`, …) — nama universalnya sama untuk semua provider
>    sehingga tidak ada yang bisa ditebak. Dan `PROVIDER_PG`/`PG_PROVIDER` (env
>    legacy) masih menang atas `BUAYAR_PROVIDER` demi backward-compatibility;
>    bila keduanya beda, SDK memberi peringatan di startup.
> 2. **Jangan campur kredensial provider lain di satu `.env`.** Sekarang webhook
>    secret sudah di-scope per provider, tapi satu env per provider tetap cara
>    paling aman dan paling mudah dibaca.
>
> Knob khusus provider pun bisa lewat env: `BUAYAR_EXTRA_SNAP=true` untuk
> DOKU QRIS via SNAP, `BUAYAR_EXTRA_COUNTRY_CODE=ID` untuk Adyen, dan seterusnya.
>
> Sebagian provider punya **field wajib yang spesifik** — iPaymu misalnya
> mewajibkan `customer.phone` 5–15 digit. Ini divalidasi pre-flight dengan pesan
> yang menyebut provider dan field-nya, sebelum request dikirim.

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

### 🧪 Zero-Approval Sandbox & Contract Simulator

Anda tidak perlu menunggu 3–6 minggu sampai merchant account PG disetujui hanya untuk menguji alur integrasi pembayaran. `@crediblemark/buayar` menyertakan simulator kontrak bawaan yang realistis untuk ke-21 provider.

#### 1. Aktifkan Mode Simulasi
Cukup tambahkan di environment variable atau instance config:
```env
BUAYAR_SIMULATE=1
```
atau di kode:
```typescript
const buayar = new Buayar({ simulate: true });
```

#### 2. Matriks Status Transaksi Deterministik
Gunakan prefix khusus pada `orderId` untuk menguji berbagai skenario respons PG:
- `ORDER-SIM_PAID-001` → Langsung sukses / lunas (`isPaid: true`, status `settlement`/`paid`)
- `ORDER-SIM_PENDING-002` → Transaksi menunggu pembayaran (`status: "pending"`)
- `ORDER-SIM_EXPIRED-003` → Transaksi kedaluwarsa (`status: "expired"`)
- `ORDER-SIM_FAILED-004` → Transaksi gagal (`status: "failed"`)
- `ORDER-SIM_TIMEOUT-005` → Simulasi network timeout / gateway unreachable
- `ORDER-SIM_ERROR-006` → Simulasi error sistem PG internal

#### 3. Generator Webhook Kriptografis untuk Pengujian Lokal & CI
Generate webhook event lengkap dengan signature kriptografis sah untuk provider apa pun:
```typescript
const webhookEvent = buayar.simulator.createWebhookEvent({
  provider: "midtrans", // atau 'stripe', 'xendit', 'doku', dll.
  orderId: "ORDER-1001",
  amount: 150000,
  status: "paid",
  secretKey: "your-secret",
});

// Kirim ke endpoint webhook Anda atau verifikasi langsung:
const verifyResult = await buayar.verifyWebhook(
  webhookEvent.payload,
  webhookEvent.headers,
  { rawBody: webhookEvent.rawBody }
);

console.log(verifyResult.isValid); // true
console.log(verifyResult.isPaid);  // true
```

---

## 📄 License / Lisensi

MIT License — Copyright © 2026 Rasyiqi Crediblemark.

This project is licensed under the **MIT License**. You are free to use, modify, and distribute it in personal and commercial projects.

Proyek ini dilisensikan di bawah **MIT License**. Bebas digunakan, dimodifikasi, dan didistribusikan untuk keperluan personal maupun komersial.
