# 💳 Integrasi Nicepay (`nicepay`)

Panduan lengkap integrasi Payment Gateway **Nicepay (IONPAY)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Nicepay dapat diperoleh melalui dashboard [merchant.nicepay.co.id](https://merchant.nicepay.co.id):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=nicepay
NICEPAY_IMID=IONPAYTEST
NICEPAY_KEY=nicepay-merchant-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NICEPAY_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarNicepay = new Buayar({
  provider: "nicepay",
  merchantCode: "IONPAYTEST", // iMid
  apiKey: "nicepay-merchant-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // Merchant Key
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Order Regist / Hosted Checkout)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-NICE-001",
  amount: 250000,
  productDetails: "Sepatu Olahraga Running",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan user ke URL Checkout Nicepay
  console.log("Payment URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / Retail / E-Wallet)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `alfamart`, `indomaret`, `ovo`, `dana`):

```typescript
// Direct Virtual Account (oneStepVa.do)
const va = await buayar.createInvoice({
  orderId: "ORDER-NICE-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Bank Code:", va.vaBank);
console.log("Expired At:", va.expiresAt);

// Direct QRIS (oneStepQris.do)
const qris = await buayar.createInvoice({
  orderId: "ORDER-NICE-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image URL:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `NicepayClient` (Inquiry & Cancel)

```typescript
import { buayar } from "@crediblemark/buayar";

const nicepayClient = buayar.getNicepayClient();

// 1. Cek status transaksi pembayaran
const status = await nicepayClient.checkTransaction("ORDER-NICE-001", 250000);
console.log("Status Transaksi:", status);

// 2. Batalkan transaksi
const cancel = await nicepayClient.cancelTransaction("TX-NICE-123456", "02", "Pembatalan oleh Merchant");
console.log("Hasil Cancel:", cancel);
```
