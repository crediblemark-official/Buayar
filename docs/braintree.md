# 💳 Integrasi Braintree (`braintree`)

Panduan lengkap integrasi Payment Gateway **Braintree (PayPal Service)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Braintree dapat diperoleh melalui dashboard [sandbox.braintreegateway.com](https://sandbox.braintreegateway.com):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=braintree
BRAINTREE_MERCHANT_ID=...
BRAINTREE_PUBLIC_KEY=...
BRAINTREE_PRIVATE_KEY=...
BRAINTREE_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarBraintree = new Buayar({
  provider: "braintree",
  merchantCode: "...", // Merchant ID
  clientKey: "...",    // Public Key
  apiKey: "...",       // Private Key
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

```typescript
import { buayar } from "@crediblemark/buayar";

// Menghasilkan client token untuk Braintree Drop-in UI
const invoice = await buayar.createInvoice({
  orderId: "ORDER-BT-001",
  amount: 2000, // minor units ($20.00)
  currency: "USD",
  productDetails: "Annual Premium Tier",
  customer: {
    name: "Bruce Wayne",
    email: "bruce@example.com",
  },
});

if (invoice.success) {
  // Client token untuk dioper ke Drop-in UI Braintree di frontend
  console.log("Client Token:", invoice.paymentUrl || invoice.reference);
}
```
