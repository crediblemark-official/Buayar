# 💳 Integrasi OY! Bisnis (`oy`)

Panduan lengkap integrasi Payment Gateway **OY! Indonesia (OY! Bisnis)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial OY! Bisnis dapat diperoleh melalui dashboard [business.oyindonesia.com](https://business.oyindonesia.com):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=oy
OY_USERNAME=myusername
OY_API_KEY=oy-secret-key-xxxxxxxxxxxxxxxxxxxxxxxx
OY_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarOy = new Buayar({
  provider: "oy",
  merchantCode: "myusername", // OY Username
  apiKey: "oy-secret-key-xxxxxxxxxxxxxxxxxxxxxxxx", // API Key
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Payment Checkout Link v2)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-OY-001",
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
  // Arahkan user ke URL Checkout OY! Bisnis
  console.log("Payment URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `alfamart`, `indomaret`):

```typescript
// Direct Virtual Account (generate-static-va)
const va = await buayar.createInvoice({
  orderId: "ORDER-OY-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Game",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Reference:", va.reference);

// Direct QRIS (qris/create-transaction)
const qris = await buayar.createInvoice({
  orderId: "ORDER-OY-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image URL:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `OyClient` (Cek Status, Saldo & Kirim Uang)

```typescript
import { buayar } from "@crediblemark/buayar";

const oyClient = buayar.getOyClient();

// 1. Cek status pembayaran transaksi
const status = await oyClient.checkTransaction("ORDER-OY-001");
console.log("Status Pesanan:", status);

// 2. Cek saldo akun OY! Bisnis
const balance = await oyClient.checkBalance();
console.log("Saldo Merchant:", balance);

// 3. Kirim Uang / Transfer Dana (Disbursement / Remittance)
const remit = await oyClient.remit({
  recipientBank: "014", // BCA
  recipientAccount: "1234567890",
  amount: 500000,
  note: "Penarikan Dana Mitra",
  partnerTrxId: "DISB-001",
});
console.log("Hasil Transfer:", remit);
```
