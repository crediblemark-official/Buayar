# 💳 Integrasi Razorpay (`razorpay`)

Panduan lengkap integrasi Payment Gateway **Razorpay** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Razorpay dapat diperoleh melalui [dashboard.razorpay.com/app/keys](https://dashboard.razorpay.com/app/keys):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarRzp = new Buayar({
  provider: "razorpay",
  clientKey: "rzp_test_...", // Key ID
  apiKey: "...",             // Key Secret
  extra: {
    webhookSecret: "...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Razorpay Standard Hosted Payment Links)

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-RZP-001",
  amount: 50000, // minor units (500.00 INR)
  currency: "INR",
  productDetails: "Online Course Access",
  customer: {
    name: "Aarav Sharma",
    email: "aarav@example.com",
    phone: "+919876543210",
  },
  returnUrl: "https://myapp.com/payment/callback",
});

if (invoice.success) {
  console.log("Short Payment Link URL:", invoice.paymentUrl);
  console.log("Razorpay Link ID:", invoice.reference);
}
```

### 2. Full Integrasi (Razorpay Orders API untuk Checkout.js)

```typescript
const order = await buayar.createInvoice({
  orderId: "ORDER-RZP-002",
  amount: 75000,
  currency: "INR",
  paymentMethod: "upi", // atau "credit_card"
  productDetails: "Course Upgrade",
  customer: { name: "Aarav", email: "aarav@example.com" },
});

console.log("Razorpay Order ID:", order.reference);
```
