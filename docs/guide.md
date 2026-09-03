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
9. [Fitur Khusus Provider (`<X>Client`)](#-fitur-khusus-provider-xclient)
10. [Kamus Variabel `.env` per Provider](#-kamus-variabel-env-per-provider)

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

```env
# Pilih provider aktif: midtrans, duitku, ipaymu, xendit, doku, prismalink,
# faspay, finpay, nicepay, oy, stripe, paypal, adyen, checkoutcom,
# razorpay, square, payu, braintree, twocheckout
PROVIDER_PG=midtrans

# Kredensial Universal (dipetakan otomatis per provider)
BUAYAR_API_KEY=your-server-key-atau-secret
BUAYAR_MERCHANT_CODE=merchant-id-atau-username
BUAYAR_SANDBOX=true

# Callback & Return URL
BUAYAR_CALLBACK_URL=https://myapp.com/api/payment/webhook
BUAYAR_RETURN_URL=https://myapp.com/payment/finish
```

```typescript
import { buayar } from "@crediblemark/buayar";
// Konfigurasi ter-baca otomatis dari process.env. Selesai.
```

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
PROVIDER_PG=midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx

# Sesudah: Stripe — kode aplikasi TIDAK berubah
PROVIDER_PG=stripe
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 🏦 Fitur Khusus Provider (`<X>Client`)

Refund, saldo, dan payout sudah tersedia secara **unified** di atas. Namun untuk **fitur yang benar-benar eksklusif** tiap PG yang tidak masuk interface umum (subscription, payment link, tokenisasi GoPay, billing invoice, dsb.), pakai getter client per provider:

```typescript
const xendit = buayar.getXenditClient();
const balance = await xendit.checkBalance("CASH");
```

Rangkuman kemampuan ekstra tiap provider:

| Provider | Getter | Kemampuan ekstra |
| :--- | :--- | :--- |
| Midtrans | `getMidtransClient()` | cancel/refund/expire/approve/deny/capture, GoPay tokenization, Subscription, Payment Link, IRIS balance |
| Duitku | `getDuitkuClient()` | balance, listBanks, inquiryBankAccount, disburse, checkDisbursementStatus |
| iPaymu | `getIpaymuClient()` | balance, checkTransaction |
| Xendit | `getXenditClient()` | balance, expireInvoice, createDisbursement |
| DOKU | `getDokuClient()` | checkTransaction |
| PrismaLink | `getPrismalinkClient()` | checkTransaction |
| Faspay | `getFaspayClient()` | cancelTransaction, checkTransaction |
| Finpay | `getFinpayClient()` | checkTransaction |
| Nicepay | `getNicepayClient()` | cancelTransaction, checkTransaction |
| OY! Bisnis | `getOyClient()` | checkTransaction, balance, remit (transfer dana) |
| Stripe | `getStripeClient()` | balance, createRefund, retrieveCheckoutSession, retrievePaymentIntent |
| PayPal | `getPaypalClient()` | captureOrder, getOrder, refundCapture, checkBalance, verifyWebhookSignature |
| Adyen | `getAdyenClient()` | capturePayment, cancelPayment, refundPayment, getPaymentDetails, getAvailablePaymentMethods |
| Checkout.com | `getCheckoutComClient()` | balance, refundPayment, voidPayment, getPaymentDetails, listPaymentLinks |
| Razorpay | `getRazorpayClient()` | capturePayment, createRefund, checkBalance, fetchPayment, listPayments |
| Square | `getSquareClient()` | retrieveBalance, refundPayment, cancelPayment, getPayment, listLocations |
| PayU | `getPayuClient()` | cancelOrder, getOrder, refundOrder |
| Braintree | `getBraintreeClient()` | getClientToken, findTransaction, refundTransaction, voidTransaction |
| 2Checkout | `getTwoCheckoutClient()` | getOrder, listOrders, getSubscription, refundOrder |

---

## 📚 Kamus Variabel `.env` per Provider

Anda hanya perlu mengisi kredensial provider yang **sedang aktif**. Gunakan variabel universal (`BUAYAR_*`) bila ingin kode benar-benar provider-agnostic, atau variabel spesifik di bawah.

| Provider | Variabel `.env` |
| :--- | :--- |
| Midtrans | `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY` |
| Duitku | `DUITKU_API_KEY`, `DUITKU_MERCHANT_CODE` |
| iPaymu | `IPAYMU_API_KEY`, `IPAYMU_VA` |
| Xendit | `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN` |
| DOKU | `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY` |
| PrismaLink | `PRISMALINK_MERCHANT_ID`, `PRISMALINK_SECRET_KEY` |
| Faspay | `FASPAY_MERCHANT_ID`, `FASPAY_USER_ID`, `FASPAY_PASSWORD`, `FASPAY_MERCHANT_NAME` |
| Finpay | `FINPAY_MERCHANT_ID`, `FINPAY_MERCHANT_KEY` |
| Nicepay | `NICEPAY_IMID`, `NICEPAY_KEY` |
| OY! Bisnis | `OY_USERNAME`, `OY_API_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` |
| Adyen | `ADYEN_API_KEY`, `ADYEN_MERCHANT_ACCOUNT`, `ADYEN_CLIENT_KEY`, `ADYEN_HMAC_KEY`, `ADYEN_LIVE_URL_PREFIX` |
| Checkout.com | `CHECKOUTCOM_SECRET_KEY`, `CHECKOUTCOM_PUBLIC_KEY`, `CHECKOUTCOM_WEBHOOK_SECRET` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Square | `SQUARE_ACCESS_TOKEN`, `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY` |
| PayU | `PAYU_POS_ID`, `PAYU_MD5_KEY`, `PAYU_OAUTH_CLIENT_ID`, `PAYU_OAUTH_CLIENT_SECRET` |
| Braintree | `BRAINTREE_MERCHANT_ID`, `BRAINTREE_PUBLIC_KEY`, `BRAINTREE_PRIVATE_KEY` |
| 2Checkout | `TWOCHECKOUT_MERCHANT_CODE`, `TWOCHECKOUT_SECRET_KEY`, `TWOCHECKOUT_SECRET_WORD` |

Sandbox: otomatis terdeteksi dari `BUAYAR_SANDBOX`/`NODE_ENV`, atau set per-provider (mis. `STRIPE_SANDBOX=true`, `MIDTRANS_SANDBOX=true`).

---

## 🏷️ Daftar Canonical Payment Methods

| Kategori | Canonical Code |
| :--- | :--- |
| **Virtual Account** | `bca_va`, `mandiri_va`, `bni_va`, `bri_va`, `permata_va`, `cimb_va`, `danamon_va`, `bsi_va`, `seabank_va` |
| **QRIS** | `qris`, `gopay_qris`, `shopeepay_qris`, `nobu_qris` |
| **E-Wallet** | `gopay`, `shopeepay`, `ovo`, `dana`, `linkaja`, `jenius` |
| **Retail** | `alfamart`, `indomaret`, `pos` |
| **Kartu Kredit** | `credit_card` |
| **Paylater** | `kredivo`, `akulaku`, `indodana` |
| **International** | `apple_pay`, `google_pay`, `paypal`, `klarna`, `sepa` |

> Tidak semua canonical code tersedia di semua provider. Selalu gunakan `getPaymentMethods()` untuk memfilter channel yang benar-benar aktif pada provider Anda.
