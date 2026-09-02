# 💳 Integrasi PayPal (`paypal`)

Panduan lengkap integrasi Payment Gateway **PayPal REST API v2** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial PayPal dapat diperoleh melalui [developer.paypal.com/dashboard/applications](https://developer.paypal.com/dashboard/applications):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=paypal
PAYPAL_CLIENT_ID=Ae...
PAYPAL_CLIENT_SECRET=EL...
PAYPAL_WEBHOOK_ID=...
PAYPAL_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarPaypal = new Buayar({
  provider: "paypal",
  clientKey: "Ae...", // Client ID
  apiKey: "EL...",    // Client Secret
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### Semi Integrasi (PayPal Hosted Checkout / Orders API)

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-PP-001",
  amount: 2500, // Misal $25.00 (atau dalam satuan mata uang terpilih)
  currency: "USD",
  productDetails: "Digital eBook License",
  customer: {
    name: "Jane Smith",
    email: "jane@example.com",
  },
  returnUrl: "https://myapp.com/payment/success",
});

if (invoice.success) {
  // Arahkan pembeli ke URL pembayaran PayPal
  console.log("PayPal Approval URL:", invoice.paymentUrl);
  console.log("PayPal Order ID:", invoice.reference);
}
```

---

## 🏦 Ekstensi `PaypalClient`

```typescript
import { buayar } from "@crediblemark/buayar";

const paypalClient = buayar.getPaypalClient();

// Capture pesanan yang telah disetujui pembeli
const captureResult = await paypalClient.captureOrder("PAYPAL-ORDER-ID");
console.log("Capture Result:", captureResult);
```
