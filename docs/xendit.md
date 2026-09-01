# 💳 Integrasi Xendit (`xendit`)

Panduan lengkap integrasi Payment Gateway **Xendit** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Xendit berupa **Secret API Key** yang dapat diambil melalui menu **Settings > API Keys** pada dashboard [dashboard.xendit.co](https://dashboard.xendit.co):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=xendit
XENDIT_SECRET_KEY=xnd_development_xxxxxxxxxxxxxxxxxxxxxxxx
XENDIT_WEBHOOK_TOKEN=your_webhook_verification_token
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarXendit = new Buayar({
  provider: "xendit",
  apiKey: "xnd_development_xxxxxxxxxxxxxxxxxxxxxxxx",
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Invoice Checkout / Redirect)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-XND-001",
  amount: 250000,
  productDetails: "Langganan Premium Pro 1 Bulan",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan user ke halaman checkout Xendit
  console.log("Invoice URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / E-Wallet / Retail)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `gopay`, `shopeepay`, `alfamart`):

```typescript
// Direct Virtual Account (Payment Requests API v3)
const va = await buayar.createInvoice({
  orderId: "ORDER-XND-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Wallet",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Expired At:", va.expiresAt);

// Direct QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-XND-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Menu Makan Siang",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `XenditClient` (Cek Saldo, Expire Invoice, Payout)

```typescript
import { buayar } from "@crediblemark/buayar";

const xenditClient = buayar.getXenditClient();

// 1. Cek Saldo Merchant
const balance = await xenditClient.checkBalance("CASH");
console.log("Saldo Merchant:", balance.balance);

// 2. Memaksa Invoice Expired
await xenditClient.expireInvoice("inv_67890");

// 3. Eksekusi Transfer Dana / Payout (Disbursement)
const disbursement = await xenditClient.createDisbursement({
  externalId: "DISB-001",
  bankCode: "BCA",
  accountHolderName: "BUDI SANTOSO",
  accountNumber: "1234567890",
  description: "Penarikan Dana Affiliate",
  amount: 500000,
});
console.log("Status Transfer:", disbursement);
```
