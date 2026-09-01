# 💳 Integrasi iPaymu (`ipaymu`)

Panduan lengkap integrasi Payment Gateway **iPaymu** v2 dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial iPaymu dapat diperoleh melalui menu **Integrasi** pada dashboard [my.ipaymu.com](https://my.ipaymu.com):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=ipaymu
IPAYMU_VA=0000001411234567
IPAYMU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
IPAYMU_SANDBOX=true
```

Atau passing konfigurasi manual:

```typescript
import { buayar } from "@crediblemark/buayar";

const buayarIpaymu = new Buayar({
  provider: "ipaymu",
  merchantCode: "0000001411234567", // Nomor VA iPaymu
  apiKey: "xxxxxxxxxxxxxxxx",
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Redirect Checkout)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-IPAYMU-001",
  amount: 150000,
  productDetails: "Pembelian Domain & Hosting",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan pelanggan ke URL Checkout iPaymu
  console.log("Redirect URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / Retail)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `qris`, `alfamart`, `indomaret`):

```typescript
// Direct Virtual Account
const vaInvoice = await buayar.createInvoice({
  orderId: "ORDER-IPAYMU-002",
  amount: 100000,
  paymentMethod: "bca_va", // Canonical ID
  productDetails: "Top Up Game",
  customer: { name: "Budi", email: "budi@example.com", phone: "081234567890" },
});

console.log("Nomor VA:", vaInvoice.vaNumber);
console.log("Bank:", vaInvoice.vaBank);
console.log("Expired At:", vaInvoice.expiresAt);

// Direct QRIS
const qrisInvoice = await buayar.createInvoice({
  orderId: "ORDER-IPAYMU-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi Kenangan",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS String (EMVCo):", qrisInvoice.qrString);
console.log("QR Image URL:", qrisInvoice.qrCodeUrl);
```

---

## 🏦 Ekstensi `IpaymuClient` (Cek Saldo & Detail Transaksi)

```typescript
import { buayar } from "@crediblemark/buayar";

const ipaymuClient = buayar.getIpaymuClient();

// Cek Saldo Merchant
const balance = await ipaymuClient.checkBalance();
console.log("Saldo iPaymu:", balance.balance);

// Cek Detail Transaksi
const tx = await ipaymuClient.checkTransaction("123456");
console.log("Detail Transaksi:", tx);
```
