# 💳 Panduan Unified `@crediblemark/buayar`

Panduan ini adalah **satu-satunya** panduan yang Anda butuhkan untuk mengintegrasikan **semua** payment gateway yang didukung Buayar (21 provider: 12 Indonesia + 9 Internasional). Anda **tidak perlu** membaca dokumentasi masing-masing PG — kode yang Anda tulis **identik** untuk semua provider.

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
# razorpay, square, payu, braintree, twocheckout, sumopod
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

> **🪄 Autodetect:** Jika `BUAYAR_PROVIDER` dikosongkan, Buayar hanya menebak provider dari env spesifik yang memuat identitas gateway (mis. `STRIPE_SECRET_KEY` → Stripe, `DUITKU_API_KEY` → Duitku). Jika hanya memakai `BUAYAR_*` universal, `BUAYAR_PROVIDER` **wajib** diisi karena nama env tersebut sama untuk semua provider.

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
| `BUAYAR_PROVIDER` | nama provider aktif — **wajib** bila hanya memakai `BUAYAR_*` (lihat catatan di bawah) |
| `BUAYAR_API_KEY` | secret / server key / password provider |
| `BUAYAR_MERCHANT_CODE` | merchant id / va / username / imid / client id |
| `BUAYAR_CLIENT_KEY` | client / public / publishable key |
| `BUAYAR_MERCHANT_ID` | merchant id (bila beda dari code) |
| `BUAYAR_SANDBOX` | mode sandbox (`true`/`false`) |
| `BUAYAR_CALLBACK_URL` / `BUAYAR_RETURN_URL` | URL webhook & redirect |
| `BUAYAR_WEBHOOK_SECRET` / `BUAYAR_WEBHOOK_TOKEN` | secret webhook |
| `BUAYAR_EXTRA_*` | knob/flag provider (`BUAYAR_EXTRA_SNAP=true` → `extra.snap`) |
| `BUAYAR_PRIVATE_KEY` | private key RSA (DOKU SNAP B2B, Adyen library) |

> 🔧 Variabel spesifik per provider (`MIDTRANS_SERVER_KEY`, `DUITKU_API_KEY`, dll.) **tetap didukung** sebagai fallback. Prioritas konfigurasi: `config` eksplisit → `BUAYAR_*` → variabel spesifik → default.

> ⚠️ **Tiga hal soal `BUAYAR_PROVIDER` yang sering mengejutkan:**
>
> 1. **Tidak bisa di-autodetect dari `BUAYAR_*`.** Autodetect hanya membaca env
>    berprefiks provider (`MIDTRANS_SERVER_KEY`, `STRIPE_SECRET_KEY`, …). Kredensial
>    universal namanya identik untuk 21 provider, jadi tidak ada yang bisa ditebak
>    — kalau Anda hanya mengisi `BUAYAR_*` dan tidak mengisi `BUAYAR_PROVIDER`,
>    setiap panggilan unified akan gagal dengan `No payment provider configured`.
> 2. **`PROVIDER_PG` dan `PG_PROVIDER` (legacy) masih menang atas `BUAYAR_PROVIDER`.**
>    Ini dipertahankan demi backward-compatibility. Kalau kedua env itu di-set ke
>    nilai berbeda, SDK mencetak peringatan di startup yang menyebut keduanya.
>    Solusinya: hapus `PROVIDER_PG`/`PG_PROVIDER` dari `.env`.
> 3. **Webhook secret di-scope per provider.** Env milik provider lain tidak lagi
>    menimpa token provider aktif. Tetap disarankan: satu `.env` = satu provider.

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

Sertakan `paymentMethod` dengan **kode canonical**. SDK mengembalikan data mentah
(`vaNumber`, `qrString` EMVCo, `qrCodeUrl`, `deeplink`) untuk dirender di UI Anda
sendiri, plus `mode` yang sudah dinormalisasi di semua 21 provider.

```typescript
// Virtual Account
const va = await buayar.createInvoice({
  orderId: "ORDER-1002",
  amount: 150000,
  paymentMethod: "bca_va",   // canonical — dipetakan otomatis per provider
  productDetails: "Top Up Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});
console.log("Nomor VA:", va.vaNumber);   // "123456789012"
console.log("Bank:", va.vaBank);         // "bca"
console.log("Kanal:", va.mode);           // "va"

// QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-1003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});
// Selalu pakai `??` — tidak semua provider mengembalikan string EMVCo mentah.
console.log("Raw QRIS (EMVCo):", qris.qrString ?? qris.qrCodeUrl);
```

#### Tiga hal yang perlu diketahui soal field response

| Field | Kenapa perlu hati-hati |
| :--- | :--- |
| `mode` | Sudah dinormalisasi untuk **21/21** provider (`"checkout" \| "va" \| "qris" \| "ewallet" \| "retail" \| "other"`). Tidak lagi perlu menebak dari field mana yang terisi. |
| `qrString` | Hanya diisi provider yang benar-benar mengembalikan string EMVCo (Xendit, Duitku, iPaymu, DOKU, Xenith, …). **Midtrans Core API tidak mengembalikannya** — hanya URL PNG. Selalu `qrString ?? qrCodeUrl`. |
| `paymentCode` | Maknanya berbeda per provider: kode bayar di gerai (Duitku, iPaymu), Drop-in client token (Braintree), `sessionData` (Adyen), `client_secret` (Stripe). Jangan dipakai sebagai "kode retail" secara umum. |

> **Canonical ≠ tersedia di semua provider.** Tidak ada kode method yang didukung
> 21/21: `indodana` hanya di Duitku, `gopay` hanya di 4 provider, `apple_pay` hanya
> di provider international. Cek dulu sebelum memanggil:
>
> ```typescript
> buayar.supportsMethod("gopay", "duitku");               // false
> buayar.getCapabilities("duitku").methods;               // daftar lengkap
> buayar.getCapabilities("adyen").serverForwardedMethods;  // method yang benar-benar dikirim ke PG
> ```
>
> Method di luar daftar ditolak **sebelum** request dikirim, dengan pesan yang
> menyebut provider dan daftar method yang didukung.
>
> `paymentMethodApplied` di response memberi tahu apakah method benar-benar
> dikirim ke PG (`"server"`) atau hanya penanda mode direct (`"advisory"`).
> Square, Braintree, PayPal, dan Checkout.com masuk kategori `"advisory"` —
> PSP-nya yang menentukan metode dari token/checkout sisi klien.

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

### Probing Saluran Aktif di Akun Gateway (`probePaymentMethods`)

Untuk mendeteksi secara dinamis saluran yang benar-benar aktif / di-enable pada akun merchant Anda di gateway:

```typescript
const probe = await buayar.probePaymentMethods();
if (probe.success) {
  console.log("Channel aktif di akun merchant:", probe.enabled);
  // Output: ["bca_va", "mandiri_va", "qris", "gopay", ...]
}
```

> ℹ️ **Sumber daftar channel.** `probePaymentMethods()` mengembalikan `source: "live"` bila daftar
> benar-benar dibaca dari gateway, dan `"static"` bila jatuh ke katalog SDK. Live saat ini untuk
> **iPaymu** (`GET /payment-channels`), **Xendit** (`GET /payment_channels`), dan **DOKU**
> (MCP Server `get_merchant_payment_methods`, aktif bila `DOKU_API_KEY`/`extra.mcpApiKey` diisi);
> Midtrans memakai charge-probe per channel.

#### Verifikasi payload per channel (probe CLI terpadu)

Untuk membuktikan payload kita **benar-benar diterima** gateway (bukan hanya daftar kanal), jalankan
probe terpadu — semua provider berurutan, dengan ringkasan tabel + JSON:

```bash
bun run probe                # semua provider (yang kredensialnya tersedia)
bun run probe midtrans doku  # provider tertentu
PROBE_JSON=1 bun run probe   # hanya ringkasan JSON (untuk CI)
```

Provider yang kredensialnya belum diset akan **dilewati**. ⚠️ Setiap probe membuat transaksi
sandbox nyata (Midtrans dibatalkan otomatis; iPaymu/Xendit/DOKU tidak punya pembatalan seragam).

### ⚡ Auto-Generate File `payment-channels.json` (CLI & SDK)

Buayar menyediakan generator otomatis untuk membuat file `payment-channels.json` siap render di UI frontend:

#### 1. Lewat CLI Terminal:
```bash
# Otomatis baca .env dan buat payment-channels.json
npx @crediblemark/buayar channels

# Atau jika terpasang secara global / script npm:
buayar channels --out ./public/payment-channels.json --amount 50000

# Override provider tertentu:
buayar channels --provider sumopod --format canonical
```

#### 2. Lewat Kode TypeScript / Node.js:
```typescript
import { buayar } from "@crediblemark/buayar";
import fs from "node:fs";

// Ambil deskriptor kanonikal siap-render
const { descriptors } = await buayar.getPaymentMethodDescriptors({ amount: 50000 });

// Simpan sebagai JSON
fs.writeFileSync("payment-channels.json", JSON.stringify(descriptors, null, 2));
```

---

## ✅ Provider Mana yang Sudah Terverifikasi?

Tidak semua dari 21 provider pernah ditembakkan ke sandbox sungguhan. SDK
melaporkannya sendiri, bukan bikin Anda menebak:

```bash
npx buayar audit              # tabel di terminal
npx buayar audit --json       # untuk CI
npx buayar audit --only-unverified
```

```typescript
buayar.listVerifiedProviders();     // 8 provider yang sudah live-tested
buayar.listUnverifiedProviders();   // 13 sisanya
buayar.getCapabilities("stripe")?.verified;          // false
buayar.getCapabilities("stripe")?.verificationNote;  // "Butuh API key sandbox Stripe (sk_test_...)"
```

Status per provider juga ada di [`docs/providers/README.md`](providers/README.md).

> ⚠️ **`verified: false` bukan berarti kodenya rusak atau belum jadi.**
> Implementasinya lengkap dan terkunci test contract/simulator: webhook
> fail-closed, signature generator asli, pre-flight rejection. Yang belum ada
> hanya bukti end-to-end ke server sungguhan, karena kredensial sandbox-nya
> belum tersedia. Perlakukan sebagai "belum terbukti", bukan "belum siap".

Layoutnya:

| Status | Jumlah | Arti |
| :--- | :---: | :--- |
| `✅ live` | 8 | Request nyata pernah sampai ke sandbox/production sungguhan; endpoint & shape payload terbukti. |
| `⏳ contract` | 13 | Lengkap & contract-tested, belum pernah menyentuh API asli karena kredensial sandbox belum tersedia. |

Untuk CI — gagal kalau ada provider tak terverifikasi yang ikut dipakai produksi:

```bash
npx buayar audit --json | jq -e '.providers | map(select(.verified)) | length >= 8'
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

> 💡 **Dua field, dan Anda tidak perlu hafal mana yang dipakai provider:**
>
> | Field | Berisi | Dipakai oleh |
> | :--- | :--- | :--- |
> | `merchantOrderId` | Order ID **milik Anda** — sama dengan `orderId` yang Anda kirim ke `createInvoice` | 20 dari 21 provider |
> | `transactionId` | ID yang **diberikan gateway** — ambil dari `createInvoice(...).reference` | **iPaymu** (wajib), opsional di provider lain |
>
> Kode di atas sudah benar untuk keduanya: kalau `transactionId` terisi, SDK
> mengirimkannya ke iPaymu; kalau tidak, `merchantOrderId` yang dipakai.
>
> Untuk iPaymu, isi lewat `transactionId` (bukan `merchantOrderId`) karena itu
> yang diminta dokumentasi resmi iPaymu v2 — dan nama field-nya tidak menyesatkan:
>
> ```typescript
> const invoice = await buayar.createInvoice({ /* … */ paymentMethod: "bca_va" });
> const result = await buayar.checkTransaction({ transactionId: invoice.reference! });
> ```
>
> Kalau keduanya kosong, SDK menolak **sebelum** memanggil PG dengan pesan yang
> menyebut kedua nama field tersebut.

---

## 🪝 Webhook Universal

Satu endpoint untuk semua provider — **provider diambil dari konfigurasi aktif**
(`BUAYAR_PROVIDER`), bukan dari isi payload. Verifikasi signature selalu
fail-closed: tanpa bukti signature yang valid, `isValid` dan `isPaid` bernilai
`false`.

Deteksi dari payload **hanya** berjalan bila tidak ada provider yang
dikonfigurasi. Kalau aplikasi menerima webhook dari lebih dari satu PG, tentukan
provider-nya sendiri lalu teruskan sebagai `configOverride.provider`:

```typescript
const detected = buayar.detectProviderFromPayload(req.body, req.headers);
const result = await buayar.verifyWebhook(req.body, req.headers, {
  provider: detected,
});
```

> **`rawBody` wajib diteruskan** untuk provider yang menandatangani byte mentah
> (Stripe, Checkout.com, Razorpay, Square, PayU, Braintree, DOKU SNAP, SumoPod,
> Xenith). Tanpa itu verifikasi selalu `false`. Template `buayar init` sudah
> menanganinya dengan benar.

```typescript
import { buayar } from "@crediblemark/buayar";

// Bekerja dengan Express, Elysia, Hono, Next.js App Router, dll.
app.post("/api/payment/webhook", async (req, res) => {
  const result = await buayar.verifyWebhook(req.body, req.headers);
  // Header signature otomatis diekstrak sesuai provider (Stripe-Signature,
  // X-Signature, x-callback-token, Signature DOKU, dll.)

  // Keamanan Ketat: jika signature/token tidak ada atau tidak cocok, isValid bernilai false
  if (!result.isValid) return res.status(400).json({ error: "Invalid signature" });

  if (result.isPaid) {
    console.log(`✅ Order ${result.orderId} senilai ${result.amount} LUNAS!`);
    // Aktifkan langganan / kirim produk
  }

  return res.status(200).json({ status: "OK" });
});
```

> 🔒 **Keamanan Signature Ketat:**
> - **DOKU:** Otomatis memvalidasi signature header (`Signature`, `Request-Id`, `Request-Timestamp`) via HMAC-SHA256. Webhook tanpa signature ditolak (`isValid: false`).
> - **Xendit:** Memvalidasi header `x-callback-token` terhadap secret token yang dikonfigurasi (`BUAYAR_WEBHOOK_SECRET` / `webhookToken`). Webhook tanpa token ditolak (`isValid: false`).
> - **iPaymu:** Memvalidasi header `X-Signature` dengan HMAC-SHA256 atas body menggunakan VA merchant. Field `result.orderId` otomatis diisi dari `reference_id` order merchant.
>
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

Secara teknis Anda **boleh** mengosongkan `BUAYAR_PROVIDER` — **asalkan** Anda memakai
env yang berprefiks provider (bukan `BUAYAR_*`):

```env
# Auto: terdeteksi dari env berprefiks provider
STRIPE_SECRET_KEY=sk_test_51...    # terdeteksi: stripe
MIDTRANS_SERVER_KEY=SB-Mid-...     # terdeteksi: midtrans
```

> ⚠️ Yang **tidak** bisa adalah hanya mengisi kredensial universal:
> `BUAYAR_API_KEY=sk_test_51...` saja tidak akan terdeteksi. Nama env itu sama
> untuk 21 provider sehingga tidak ada yang bisa ditebak, dan hasilnya
> `No payment provider configured`.
>
> Autodetect juga mengembalikan `undefined` bila ambigu (dua provider dengan
> jumlah kredensial sama) atau bila ada provider lain yang kredensialnya
> parsial. Untuk produksi, selalu tulis `BUAYAR_PROVIDER` secara eksplisit.

> Knob khusus provider juga cukup lewat env, tanpa edit kode — misalnya
> `BUAYAR_EXTRA_SNAP=true` untuk mengaktifkan jalur DOKU SNAP (wajib untuk
> QRIS / DANA / ShopeePay di DOKU), `BUAYAR_EXTRA_COUNTRY_CODE=ID` untuk Adyen.

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
| Finpay | Tested live | `getFinpayClient()` | checkTransaction, cancelOrder, voidTransaction |
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
| [SumoPod](sumopod.md) | Tested | `getSumopodClient()` | createPayment, getPayment. *Lihat [panduan lengkap SumoPod](sumopod.md)* |

> ℹ️ **Catatan Status:** Hanya provider yang memiliki file dokumentasi panduan khusus di folder `docs/` yang berstatus **Tested** ([iPaymu](ipaymu.md) dan [SumoPod](sumopod.md)). Provider lain bertanda `-` berstatus siap pakai sesuai spesifikasi API resmi.

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
| **SumoPod** | `sumopod` | API Key (`X-Api-Key`) | *(tidak perlu)* | Webhook Secret (`BUAYAR_WEBHOOK_SECRET`) / Token (`BUAYAR_WEBHOOK_TOKEN`) |

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
