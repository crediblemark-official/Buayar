# 💳 Integrasi PrismaLink (`prismalink`)

Panduan lengkap integrasi Payment Gateway **PrismaLink** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial PrismaLink dapat diperoleh melalui dashboard [docs.prismalink.co.id](https://docs.prismalink.co.id):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=prismalink
PRISMALINK_MERCHANT_ID=PRISMA-MERCHANT-001
PRISMALINK_SECRET_KEY=prisma-secret-xxxxxxxxxxxxxxxx
PRISMALINK_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarPrisma = new Buayar({
  provider: "prismalink",
  merchantCode: "PRISMA-MERCHANT-001", // Merchant ID
  apiKey: "prisma-secret-xxxxxxxxxxxxxxxx", // Secret Key
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (PrismaLink Checkout Page)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-PRISMA-001",
  amount: 250000,
  productDetails: "Paket Cloud Server Pro",
  customer: {
    name: "Budi Santoso",
    email: "budi@example.com",
    phone: "081234567890",
  },
  returnUrl: "https://myapp.com/payment/finish",
});

if (invoice.success) {
  // Arahkan user ke URL Checkout PrismaLink
  console.log("Checkout URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Direct VA / QRIS / Retail)
Berikan parameter `paymentMethod` (misal: `bca_va`, `mandiri_va`, `bri_va`, `qris`, `alfamart`, `indomaret`):

```typescript
// Direct Virtual Account
const va = await buayar.createInvoice({
  orderId: "ORDER-PRISMA-002",
  amount: 150000,
  paymentMethod: "bca_va",
  productDetails: "Top Up Game",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Nomor VA BCA:", va.vaNumber);
console.log("Expired At:", va.expiresAt);

// Direct QRIS
const qris = await buayar.createInvoice({
  orderId: "ORDER-PRISMA-003",
  amount: 50000,
  paymentMethod: "qris",
  productDetails: "Kopi",
  customer: { name: "Budi", email: "budi@example.com" },
});

console.log("Raw QRIS (EMVCo):", qris.qrString);
console.log("QR Image URL:", qris.qrCodeUrl);
```

---

## 🏦 Ekstensi `PrismalinkClient` (Cek Status Transaksi)

```typescript
import { buayar } from "@crediblemark/buayar";

const prismaClient = buayar.getPrismalinkClient();

// Cek status transaksi via Order ID
const status = await prismaClient.checkTransaction("ORDER-PRISMA-001");
console.log("Status Pesanan:", status);
```
