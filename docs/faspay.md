# 💳 Integrasi Faspay (`faspay`)

Panduan lengkap integrasi Payment Gateway **Faspay** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Faspay dapat diperoleh melalui dashboard [merchant.faspay.co.id](https://merchant.faspay.co.id):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=faspay
FASPAY_MERCHANT_ID=31112
FASPAY_USER_ID=db31112
FASPAY_PASSWORD=faspay-password-xxxxxxxx
FASPAY_MERCHANT_NAME="Toko Saya"
FASPAY_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarFaspay = new Buayar({
  provider: "faspay",
  merchantCode: "31112", // Merchant ID
  clientKey: "db31112", // User ID
  apiKey: "faspay-password-xxxxxxxx", // Password
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Faspay Payment Page)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-FASPAY-001",
  amount: 250000,
  productDetails: "Sepatu Olahraga",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan user ke URL Pembayaran Faspay
  console.log("Payment URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / Retail)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `alfamart`, `indomaret`):

```typescript
// Direct Virtual Account (Post Data Transaction)
const va = await buayar.createInvoice({
  orderId: "ORDER-FASPAY-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Diamond",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Payment URL:", va.paymentUrl);
console.log("Expired At:", va.expiresAt);

// Direct QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-FASPAY-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi Gula Aren",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image URL:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `FaspayClient` (Inquiry & Cancel)

```typescript
import { buayar } from "@crediblemark/buayar";

const faspayClient = buayar.getFaspayClient();

// 1. Cek status pembayaran tagihan
const status = await faspayClient.checkTransaction("ORDER-FASPAY-001");
console.log("Status Pesanan:", status);

// 2. Batalkan tagihan
const cancel = await faspayClient.cancelTransaction("ORDER-FASPAY-001", "402");
console.log("Hasil Pembatalan:", cancel);
```
