# 💳 Integrasi Stripe (`stripe`)

Panduan lengkap integrasi Payment Gateway **Stripe** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Stripe dapat diperoleh melalui [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=stripe
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLIC_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarStripe = new Buayar({
  provider: "stripe",
  apiKey: "sk_test_51...", // Secret Key
  clientKey: "pk_test_51...", // Publishable Key
  extra: {
    webhookSecret: "whsec_...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

### 1. Semi Integrasi (Stripe Checkout Session)
Kosongkan parameter `paymentMethod`:

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-STRIPE-001",
  amount: 250000,
  currency: "IDR", // Default 'IDR', atau 'USD', 'SGD', dll
  productDetails: "Pro Subscription",
  customer: {
    name: "John Doe",
    email: "john@example.com",
  },
  returnUrl: "https://myapp.com/payment/success",
});

if (invoice.success) {
  // Arahkan user ke URL Checkout Stripe
  console.log("Checkout URL:", invoice.paymentUrl);
}
```

### 2. Full Integrasi (Stripe Payment Intent)
Berikan parameter `paymentMethod` (misal: `credit_card`):

```typescript
const direct = await buayar.createInvoice({
  orderId: "ORDER-STRIPE-002",
  amount: 150000,
  paymentMethod: "credit_card",
  productDetails: "Top Up Wallet",
  customer: { name: "John Doe", email: "john@example.com" },
});

console.log("Client Secret / Reference:", direct.reference);
```

---

## 🔔 Verifikasi Webhook

```typescript
import { buayar } from "@crediblemark/buayar";

// Endpoint: POST /api/payment/webhook
app.post("/api/payment/webhook", async (req, res) => {
  const payload = req.body;
  const headers = req.headers;

  const result = await buayar.verifyWebhook(payload, headers);

  if (!result.isValid) {
    return res.status(400).send("Invalid signature");
  }

  if (result.isPaid) {
    console.log(`Pesanan ${result.orderId} terbayar sejumlah ${result.amount}!`);
  }

  return res.json({ received: true });
});
```
