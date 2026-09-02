# 💳 Integrasi Square (`square`)

Panduan lengkap integrasi Payment Gateway **Square (Payment Links API)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Square dapat diperoleh melalui [developer.squareup.com/apps](https://developer.squareup.com/apps):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=square
SQUARE_ACCESS_TOKEN=EAAA...
SQUARE_APPLICATION_ID=sq0idp-...
SQUARE_LOCATION_ID=L...
SQUARE_WEBHOOK_SIGNATURE_KEY=...
SQUARE_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarSquare = new Buayar({
  provider: "square",
  apiKey: "EAAA...",              // Access Token
  clientKey: "sq0idp-...",        // Application ID
  projectId: "L...",              // Location ID
  extra: {
    webhookSignatureKey: "...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-SQ-001",
  amount: 3500, // minor units ($35.00)
  currency: "USD",
  productDetails: "Merchandise Coffee Mug",
  customer: {
    name: "Michael Scott",
    email: "michael@example.com",
  },
  returnUrl: "https://myapp.com/payment/complete",
});

if (invoice.success) {
  console.log("Square Checkout URL:", invoice.paymentUrl);
  console.log("Payment Link ID:", invoice.reference);
}
```
