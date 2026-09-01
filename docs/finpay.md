# 💳 Integrasi Finpay (`finpay`)

Panduan lengkap integrasi Payment Gateway **Finpay (PT Finnet Indonesia - Telkom Group)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Finpay dapat diperoleh melalui dashboard [dashboard.finpay.id](https://dashboard.finpay.id):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=finpay
FINPAY_MERCHANT_ID=FINPAY-MERCHANT-001
FINPAY_MERCHANT_KEY=finpay-secret-key-xxxxxxxxxxxxxxxx
FINPAY_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarFinpay = new Buayar({
  provider: "finpay",
  merchantCode: "FINPAY-MERCHANT-001", // Merchant ID
  apiKey: "finpay-secret-key-xxxxxxxxxxxxxxxx", // Merchant Key / Signature Key
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Finpay Checkout Link)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-FINPAY-001",
  amount: 250000,
  productDetails: "Tagihan Langganan Internet",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan user ke URL Checkout Finpay
  console.log("Payment URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / Retail / Pos)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `pos`, `alfamart`, `indomaret`):

```typescript
// Direct Virtual Account
const va = await buayar.createInvoice({
  orderId: "ORDER-FINPAY-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Saldo",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Payment URL:", va.paymentUrl);
console.log("Expired At:", va.expiresAt);

// Direct QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-FINPAY-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image URL:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `FinpayClient` (Cek Status Pembayaran)

```typescript
import { buayar } from "@crediblemark/buayar";

const finpayClient = buayar.getFinpayClient();

// Cek status pembayaran
const status = await finpayClient.checkTransaction("ORDER-FINPAY-001");
console.log("Status Pesanan:", status);
```
