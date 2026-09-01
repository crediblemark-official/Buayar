# 💳 Integrasi DOKU Jokul (`doku`)

Panduan lengkap integrasi Payment Gateway **DOKU (Jokul v2)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial DOKU dapat diperoleh melalui dashboard [jokul.doku.com](https://jokul.doku.com):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=doku
DOKU_CLIENT_ID=MALL-ID-xxxxxxxx
DOKU_SECRET_KEY=SK-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
DOKU_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarDoku = new Buayar({
  provider: "doku",
  merchantCode: "MALL-ID-xxxxxxxx", // Client ID
  apiKey: "SK-xxxxxxxxxxxxxxxxxxxxxxxxxxxx", // Secret Key
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Jokul Checkout Page)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-DOKU-001",
  amount: 250000,
  productDetails: "Sepatu Olahraga Pria",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan user ke URL Checkout Jokul DOKU
  console.log("Checkout URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / Retail / E-Wallet)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `alfamart`, `indomaret`, `ovo`, `dana`):

```typescript
// Direct Virtual Account (Jokul v2)
const va = await buayar.createInvoice({
  orderId: "ORDER-DOKU-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Game",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Panduan Bayar:", va.paymentUrl);
console.log("Expired At:", va.expiresAt);

// Direct QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-DOKU-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image URL:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `DokuClient` (Cek Status Pesanan)

```typescript
import { buayar } from "@crediblemark/buayar";

const dokuClient = buayar.getDokuClient();

// Cek status pesanan via Invoice Number
const orderStatus = await dokuClient.checkTransaction("ORDER-DOKU-001");
console.log("Status Pesanan:", orderStatus);
```
