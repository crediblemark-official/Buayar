# 💳 Integrasi Checkout.com (`checkoutcom`)

Panduan lengkap integrasi Payment Gateway **Checkout.com (Payment Links API)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Checkout.com dapat diperoleh melalui [dashboard.checkout.com](https://dashboard.checkout.com):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=checkoutcom
CHECKOUTCOM_SECRET_KEY=sk_sbox_...
CHECKOUTCOM_PUBLIC_KEY=pk_sbox_...
CHECKOUTCOM_WEBHOOK_SECRET=...
CHECKOUTCOM_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarCko = new Buayar({
  provider: "checkoutcom",
  apiKey: "sk_sbox_...",
  clientKey: "pk_sbox_...",
  extra: {
    webhookSecret: "...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-CKO-001",
  amount: 5000, // minor units (misal $50.00 / GBP 50.00)
  currency: "GBP",
  productDetails: "Design Consultation Fee",
  customer: {
    name: "Oliver Twist",
    email: "oliver@example.com",
  },
  returnUrl: "https://myapp.com/payment/success",
});

if (invoice.success) {
  console.log("Hosted Payment Link:", invoice.paymentUrl);
  console.log("Payment Reference:", invoice.reference);
}
```
