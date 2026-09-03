# 💳 Panduan Unified `@crediblemark/buayar`

Panduan ini adalah **satu-satunya** panduan yang Anda butuhkan untuk mengintegrasikan **semua** payment gateway yang didukung Buayar (19 provider: 10 Indonesia + 9 Internasional). Anda **tidak perlu** membaca dokumentasi masing-masing PG — kode yang Anda tulis **identik** untuk semua provider.

> 🎯 **Prinsip "mata tertutup":** Anda 100% tidak tahu (dan tidak perlu tahu) provider mana yang sedang aktif. Yang Anda tahu hanya: "Buaya mendukung PG A, PG B, PG C". Cukup ubah kredensial di `.env`, semuanya jalan.

---

## 📑 Daftar Isi

1. [Filosofi Unified](#-filosofi-unified)
2. [Inisialisasi & Konfigurasi](#-inisialisasi--konfigurasi)
3. [Membuat Transaksi (Semi & Full)](#-membuat-transaksi)
4. [Ambil Metode Pembayaran (Accordion-Ready)](#-ambil-metode-pembayaran)
5. [Cek Status Transaksi](#-cek-status-transaksi)
6. [Webhook Universal](#-webhook-universal)
7. [Refund / Saldo / Payout Unified](#-refund--saldo--payout-unified)
8. [Zero-Code PG Switch](#-zero-code-pg-switch)
9. [Provider Dinamis & Autodetect](#-provider-dinamis--autodetect)
10. [Cek Capability Provider (Portabilitas)](#-cek-capability-provider-portabilitas)
11. [Fitur Khusus Provider (`<X>Client`)](#-fitur-khusus-provider-xclient)
12. [Panduan Pengisian Variabel Universal (`BUAYAR_*`) per Provider](#-panduan-pengisian-variabel-universal-buayar_-per-provider)
13. [Daftar Canonical Payment Methods](#-daftar-canonical-payment-methods)

---

## 🧠 Filosofi Unified

Seluruh provider mengimplementasikan **satu kontrak API** yang sama. Artinya:

| Kebutuhan Anda | API yang Anda gunakan |
| :--- | :--- |
| Checkout (redirect / direct) | `buayar.createInvoice()` |
| Daftar channel pembayaran | `buayar.getPaymentMethods()` |
| Cek status transaksi | `buayar.checkTransaction()` |
| Verifikasi callback | `buayar.verifyWebhook()` |
| Refund | `buayar.refund()` |
| Cek saldo merchant | `buayar.checkBalance()` |
| Transfer dana / payout | `buayar.disburse()` |
| Fitur benar-benar eksklusif per PG | `buayar.get<X>Client()` |

Semua metode pembayaran memakai **kode canonical universal** (`bca_va`, `qris`, `gopay`, `alfamart`, dst.) yang dipetakan otomatis ke format internal provider aktif. Anda tidak pernah menyentuh format internal siapa pun.

---

## ⚙️ Inisialisasi & Konfigurasi

### 1. Zero-Config (baca dari `.env`) — **Direkomendasikan**

Cukup isi **variabel universal** yang sama untuk semua provider. SDK otomatis memetakannya ke kredensial yang dibutuhkan provider aktif.

```env
# (opsional) Provider aktif: midtrans, duitku, ipaymu, xendit, doku, prismalink,
# faspay, finpay, nicepay, oy, stripe, paypal, adyen, checkoutcom,
# razorpay, square, payu, braintree, twocheckout
# Bila dikosongkan, provider AUTO-DIDETEKSI dari kredensial yang terisi.
BUAYAR_PROVIDER=midtrans

# Kredensial Universal (dipetakan otomatis per provider)
BUAYAR_API_KEY=your-server-key-atau-secret
BUAYAR_MERCHANT_CODE=merchant-id-atau-username
BUAYAR_CLIENT_KEY=client-atau-public-key   # bila provider butuh
BUAYAR_MERCHANT_ID=merchant-id             # bila berbeda dari code
BUAYAR_SANDBOX=true

# Callback & Return URL
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

```typescript
import { buayar } from "@crediblemark/buayar";
// Konfigurasi ter-baca otomatis dari process.env. Selesai.
```

> **🪄 Autodetect:** Jika `BUAYAR_PROVIDER` dikosongkan, Buayar menebak provider aktif dari kredensial yang terisi di `.env` (mis. `STRIPE_SECRET_KEY` → Stripe, `DUITKU_API_KEY` → Duitku). Anda bahkan bisa **tidak menyebut nama provider sama sekali**.

### 2. Inisialisasi Manual (programatik)

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayar = new Buayar({
  provider: "xendit",
  apiKey: "xnd_development_xxxx",
  merchantCode: "",              // jika dibutuhkan (mis. Midtrans boleh kosong)
  sandbox: true,
  extra: { webhookSecret: "whsec_..." }, // untuk provider yang butuh secret tambahan
});
```

> 💡 Banyak `get<X>Client()` juga bisa dipakai dengan meneruskan `provider` di `configOverride` agar menargetkan provider tertentu dari satu instance `buayar`.

### Variable Environment: Universal vs Spesifik

Setiap provider punya kredensial yang **berbeda-beda** (`MIDTRANS_SERVER_KEY` vs `DUITKU_API_KEY` vs `FASPAY_PASSWORD`, dst.). Itu sebabnya Buayar menyediakan **variabel universal** yang sama untuk semua provider, jadi Anda tidak perlu menghafal perbedaan tiap PG:

| Variabel Universal | Dipakai sebagai |
| :--- | :--- |
| `BUAYAR_PROVIDER` | nama provider aktif (opsional → autodetect) |
| `BUAYAR_API_KEY` | secret / server key / password provider |
| `BUAYAR_MERCHANT_CODE` | merchant id / va / username / imid / client id |
| `BUAYAR_CLIENT_KEY` | client / public / publishable key |
| `BUAYAR_MERCHANT_ID` | merchant id (bila beda dari code) |
| `BUAYAR_SANDBOX` | mode sandbox (`true`/`false`) |
| `BUAYAR_CALLBACK_URL` / `BUAYAR_RETURN_URL` | URL webhook & redirect |
| `BUAYAR_WEBHOOK_SECRET` / `BUAYAR_WEBHOOK_TOKEN` | secret webhook |

> 🔧 Variabel spesifik per provider (`MIDTRANS_SERVER_KEY`, `DUITKU_API_KEY`, dll.) **tetap didukung** sebagai fallback. Prioritas konfigurasi: `config` eksplisit → `BUAYAR_*` → variabel spesifik → default.

---

## 🛠️ Membuat Transaksi

### Semi Integrasi (Redirect / Hosted Checkout)

Tanpa `paymentMethod`, SDK mengembalikan `paymentUrl` untuk mengarahkan pelanggan ke halaman checkout PG.

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-1001",
  amount: 250000,
  currency: "IDR",               // wajib untuk PG internasional (USD, EUR, dll)
  productDetails: "Pembelian Lisensi Software Premium",
  customer: { name: "Budi", email: "budi@example.com", phone: "081234567890" },
  returnUrl: "https://myapp.com/payment/success",
});

if (invoice.success) {
  redirect(invoice.paymentUrl!);  // redirect pelanggan ke sini
}
```

### Full Integrasi (Custom Native UI)

Sertakan `paymentMethod` dengan **kode canonical**. SDK mengembalikan data mentah (`vaNumber`, `qrString` EMVCo, `paymentCode`, `deeplink`) untuk dirender di UI Anda sendiri.

```typescript
// Virtual Account
const va = await buayar.createInvoice({
  orderId: "ORDER-1002",
  amount: 150000,
  paymentMethod: "bca_va",   // canonical — berlaku di semua provider
  productDetails: "Top Up Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});
console.log("Nomor VA:", va.vaNumber);   // "123456789012"
console.log("Bank:", va.vaBank);         // "bca"

// QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-1003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});
console.log("Raw QRIS (EMVCo):", qris.qrString);   // untuk dirender
console.log("QR Image URL:", qris.qrCodeUrl);
```

### Menargetkan Provider Tertentu (opsional)

Jika satu instance `buayar` dipakai untuk beberapa provider sekaligus, lewatkan `provider` pada `configOverride`:

```typescript
const stripeInvoice = await buayar.createInvoice(
  { orderId: "ORDER-2001", amount: 50000, paymentMethod: "credit_card" },
  { provider: "stripe", apiKey: "sk_test_..." }   // override provider & kredensial
);
```

---

## 📋 Ambil Metode Pembayaran

Dapatkan daftar channel aktif yang sudah dikelompokkan per kategori (accordion-ready), lengkap dengan fee dan icon URL.

```typescript
const { categories } = await buayar.getPaymentMethods({ amount: 150000 });
// categories: { "Virtual Account": [...], "QRIS": [...], "E-Wallet": [...], ... }
```

---

## 🔍 Cek Status Transaksi

```typescript
const result = await buayar.checkTransaction({ merchantOrderId: "ORDER-1001" });

if (result.success) {
  console.log("Status:", result.status);          // "paid" | "pending" | "failed"
  console.log("Pesan:", result.statusMessage);
}
```

---

## 🪝 Webhook Universal

Satu endpoint untuk semua provider. Provider **terdeteksi otomatis** dari struktur payload — tidak ada routing manual.

```typescript
import { buayar } from "@crediblemark/buayar";

// Bekerja dengan Express, Elysia, Hono, Next.js App Router, dll.
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers);
  // header signature otomatis diekstrak sesuai provider (Stripe-Signature,
  // Cko-Signature, X-Razorpay-Signature, dll.)

  if (!result.isValid) return res.status(400).json({ error: "Invalid signature" });

  if (result.isPaid) {
    console.log(`✅ Order ${result.orderId} senilai ${result.amount} LUNAS!`);
    // Aktifkan langganan / kirim produk
  }

  return res.status(200).json({ status: "OK" });
});
```

> `buayar.handleWebhook(payload, headers)` adalah alias dari `verifyWebhook`.

---

## 💸 Refund / Saldo / Payout Unified

Selain alur transaksi inti, Buayar menyediakan **operasi lanjutan unified** untuk hal-hal yang paling sering dipakai: **refund**, **cek saldo**, dan **payout** (disbursement).

Sama seperti operasi lainnya — kode Anda **tidak bergantung provider**. Setiap operasi otomatis diarahkan ke provider aktif.

> 🧊 **Provider tanpa fitur** mengembalikan `{ supported: false }` — bukan error. Anda bisa cek `result.supported` untuk menangani fallback.

### 1. Refund

```typescript
const refund = await buayar.refund({
  transactionId: "pi_3MtwBwLkdIwHu7ix28a3tqPa", // ID transaksi/capture/payment
  amount: 50000,       // opsional — default full refund
  reason: "Produk cacat", // opsional, bila didukung provider
  currency: "IDR",     // opsional, untuk provider internasional
});

if (refund.success) {
  console.log("Refund diproses:", refund.reference);
} else if (!refund.supported) {
  console.log("Provider aktif tidak mendukung refund!");
}
```

Mendukung: **Midtrans, Stripe, PayPal, Adyen, Checkout.com, Razorpay, Square, PayU, Braintree, 2Checkout**.

### 2. Cek Saldo Merchant

```typescript
const balance = await buayar.checkBalance();

if (balance.success) {
  console.log("Saldo:", balance.balance, balance.currency);
}
```

Mendukung: **Midtrans, Duitku, iPaymu, Xendit, OY!, Stripe, PayPal, Checkout.com, Razorpay, Square**.

### 3. Payout / Transfer Dana (Disbursement)

```typescript
const payout = await buayar.disburse({
  externalId: "DISB-001",   // ID unik merchant untuk transfer ini
  bankCode: "BCA",          // kode bank tujuan (ikuti aturan provider aktif)
  accountHolderName: "Budi Santoso", // wajib untuk beberapa provider
  accountNumber: "1234567890",
  amount: 500000,
  description: "Penarikan saldo mitra",
});

if (payout.success) {
  console.log("Transfer diproses:", payout.reference);
}
```

Mendukung: **Duitku, Xendit, OY!**.

---

## 🔄 Zero-Code PG Switch

Beralih provider **tanpa mengubah satu baris pun** di controller/service Anda — cukup ubah kredensial di `.env`:

```env
# Sebelum: Midtrans
BUAYAR_PROVIDER=midtrans
BUAYAR_API_KEY=SB-Mid-server-xxxx

# Sesudah: Stripe — kode aplikasi TIDAK berubah
BUAYAR_PROVIDER=stripe
BUAYAR_API_KEY=sk_test_51...
BUAYAR_WEBHOOK_SECRET=whsec_...
```

Bahkan bisa **tanpa `BUAYAR_PROVIDER`** — cukup ganti kredensial, dan provider terdeteksi otomatis:

```env
# Auto: cukup isi key-nya, provider tertelan
BUAYAR_API_KEY=sk_test_51...      # berubah ke Stripe
```

---

## 🌐 Provider Dinamis & Autodetect

Registry provider **dinamis**: Anda bisa menambah/mendaftarkan provider kustom tanpa mengedit core SDK, sekaligus memanfaatkan autodetect.

### 1. Autodetect dari `.env`
Tanpa menyebut `BUAYAR_PROVIDER`, SDK menebak provider dari kredensial yang terisi:
```typescript
const b = new Buayar();
b.detectProviderFromEnv(process.env); // "stripe" | "duitku" | ... | undefined
```

### 2. Autodetect dari payload webhook
```typescript
b.detectProviderFromPayload({
  signature_key: "x", transaction_status: "settlement",
}); // "midtrans"
```

### 3. Daftar provider terdaftar & registrasi kustom
```typescript
b.listProviders();                       // ["midtrans","duitku",...]
b.registerProvider(new MyCustomProvider());          // untuk eksekusi
b.registerProviderDescriptor({
  name: "mypg",
  envKeys: ["MYPG_SECRET"],              // untuk autodetect
  methods: ["qris", "bca_va"],           // untuk capability
  operations: { refund: true, checkBalance: true, disburse: true },
});
```

---

## 🔎 Cek Capability Provider (Portabilitas)

Jawab pertanyaan "provider ini dukung fitur & metode apa?" secara **runtime** — berguna untuk memutuskan migrasi atau menampilkan channel yang valid.

```typescript
b.getCapabilities("duitku");
// { methods: ["bca_va","qris",...], operations: { refund: false, checkBalance: true, disburse: true } }

b.supports("xendit", "checkBalance");   // true
b.supports("doku", "refund");           // false
b.supportsMethod("qris", "stripe");     // true
b.getSupportedMethods("midtrans");      // ["bca_va","bni_va",...]
```

> 💡 Ini berguna untuk skenario **migrasi anti-lock-in**: cek dulu apakah provider target punya metode/op yang Anda butuhkan sebelum pindah. Provider yang tidak mendukung suatu operasi tetap mengembalikan `{ supported: false }` (bukan error), bukan crash.

---

## 🏦 Fitur Khusus Provider (`<X>Client`)

Refund, saldo, dan payout sudah tersedia secara **unified** di atas. Namun untuk **fitur yang benar-benar eksklusif** tiap PG yang tidak masuk interface umum (subscription, payment link, tokenisasi GoPay, billing invoice, dsb.), pakai getter client per provider:

```typescript
const xendit = buayar.getXenditClient();
const balance = await xendit.checkBalance("CASH");
```

Rangkuman kemampuan ekstra tiap provider:

| Provider | Status | Getter | Kemampuan ekstra |
| :--- | :---: | :--- | :--- |
| Midtrans | - | `getMidtransClient()` | cancel/refund/expire/approve/deny/capture, GoPay tokenization, Subscription, Payment Link, IRIS balance |
| Duitku | - | `getDuitkuClient()` | balance, listBanks, inquiryBankAccount, disburse, checkDisbursementStatus |
| [iPaymu](ipaymu.md) | Tested | `getIpaymuClient()` | balance, checkTransaction, getHistory, getBankList, getPaymentMethods/getPaymentChannels, Split Payment (registerUser / subAccountId), COD logistics (getArea, getRate, getPickup, getAwb, getTracking), Public Area API (Province, City, District, Village). *Lihat [panduan lengkap iPaymu](ipaymu.md)* |
| Xendit | - | `getXenditClient()` | balance, expireInvoice, createDisbursement |
| DOKU | - | `getDokuClient()` | checkTransaction |
| PrismaLink | - | `getPrismalinkClient()` | checkTransaction |
| Faspay | - | `getFaspayClient()` | cancelTransaction, checkTransaction |
| Finpay | - | `getFinpayClient()` | checkTransaction |
| Nicepay | - | `getNicepayClient()` | cancelTransaction, checkTransaction |
| OY! Bisnis | - | `getOyClient()` | checkTransaction, balance, remit (transfer dana) |
| Stripe | - | `getStripeClient()` | balance, createRefund, retrieveCheckoutSession, retrievePaymentIntent |
| PayPal | - | `getPaypalClient()` | captureOrder, getOrder, refundCapture, checkBalance, verifyWebhookSignature |
| Adyen | - | `getAdyenClient()` | capturePayment, cancelPayment, refundPayment, getPaymentDetails, getAvailablePaymentMethods |
| Checkout.com | - | `getCheckoutComClient()` | balance, refundPayment, voidPayment, getPaymentDetails, listPaymentLinks |
| Razorpay | - | `getRazorpayClient()` | capturePayment, createRefund, checkBalance, fetchPayment, listPayments |
| Square | - | `getSquareClient()` | retrieveBalance, refundPayment, cancelPayment, getPayment, listLocations |
| PayU | - | `getPayuClient()` | cancelOrder, getOrder, refundOrder |
| Braintree | - | `getBraintreeClient()` | getClientToken, findTransaction, refundTransaction, voidTransaction |
| 2Checkout | - | `getTwoCheckoutClient()` | getOrder, listOrders, getSubscription, refundOrder |

---

## 📚 Panduan Pengisian Variabel Universal (`BUAYAR_*`) per Provider

Anda **tidak perlu** membuat nama variabel khusus per provider (seperti `IPAYMU_API_KEY`, `DUITKU_API_KEY`, dsb.). Cukup gunakan set variabel seragam **`BUAYAR_*`**.

Tabel berikut menunjukkan data apa dari dashboard masing-masing payment gateway yang perlu Anda masukkan ke variabel `BUAYAR_*`:

| Provider | `BUAYAR_PROVIDER` | `BUAYAR_API_KEY` | `BUAYAR_MERCHANT_CODE` | `BUAYAR_CLIENT_KEY` / Tambahan |
| :--- | :--- | :--- | :--- | :--- |
| **Midtrans** | `midtrans` | Server Key | *(opsional)* | Client Key |
| **Duitku** | `duitku` | API Key | Merchant Code | *(tidak perlu)* |
| **iPaymu** | `ipaymu` | API Key | Nomor Virtual Account (VA) | *(tidak perlu)* |
| **Xendit** | `xendit` | Secret Key | *(opsional)* | Webhook Verification Token (`BUAYAR_WEBHOOK_SECRET`) |
| **DOKU Jokul** | `doku` | Secret Key | Client ID / Merchant ID | Client ID |
| **PrismaLink** | `prismalink` | Secret Key | Merchant ID | *(tidak perlu)* |
| **Faspay** | `faspay` | Password | Merchant ID | User ID |
| **Finpay** | `finpay` | Merchant Key | Merchant ID | *(tidak perlu)* |
| **Nicepay** | `nicepay` | Server Key (Secret) | I-MID (Merchant ID) | *(tidak perlu)* |
| **OY! Bisnis** | `oy` | API Key | Username | Username |
| **Stripe** | `stripe` | Secret Key (`sk_...`) | *(tidak perlu)* | Publishable Key (`pk_...`) / Webhook Secret |
| **PayPal** | `paypal` | Client Secret | Client ID | Client ID |
| **Adyen** | `adyen` | API Key | Merchant Account Name | Client Key / HMAC Key (`BUAYAR_WEBHOOK_SECRET`) |
| **Checkout.com** | `checkoutcom` | Secret Key (`sk_...`) | *(tidak perlu)* | Public Key (`pk_...`) / Webhook Secret |
| **Razorpay** | `razorpay` | Key Secret | Key ID | Key ID |
| **Square** | `square` | Access Token | Application ID | Location ID (`BUAYAR_PROJECT_ID`) |
| **PayU** | `payu` | MD5 Key / Secret | POS ID | POS ID |
| **Braintree** | `braintree` | Private Key | Merchant ID | Public Key |
| **2Checkout** | `twocheckout` | Secret Key | Merchant Code | Secret Word (`BUAYAR_WEBHOOK_SECRET`) |

> 💡 **Mode Sandbox:** Cukup tambahkan `BUAYAR_SANDBOX=true` (atau `false` saat production), SDK otomatis menyesuaikan URL endpoint API seluruh provider di atas tanpa perlu konfigurasi tambahan.

---

## 🏷️ Daftar Canonical Payment Methods

| Kategori | Canonical Code |
| :--- | :--- |
| **Virtual Account** | `bca_va`, `mandiri_va`, `bni_va`, `bri_va`, `permata_va`, `cimb_va`, `danamon_va`, `bsi_va`, `seabank_va`, `bag_va`, `muamalat_va` |
| **QRIS** | `qris`, `gopay_qris`, `shopeepay_qris`, `nobu_qris` |
| **E-Wallet** | `gopay`, `shopeepay`, `ovo`, `dana`, `linkaja`, `jenius` |
| **Retail** | `alfamart`, `indomaret`, `pos` |
| **Kartu Kredit** | `credit_card` |
| **Paylater** | `kredivo`, `akulaku`, `indodana` |
| **International** | `apple_pay`, `google_pay`, `paypal`, `klarna`, `sepa` |

> Tidak semua canonical code tersedia di semua provider. Selalu gunakan `getPaymentMethods()` untuk memfilter channel yang benar-benar aktif pada provider Anda.
