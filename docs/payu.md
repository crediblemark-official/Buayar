# 💳 Integrasi PayU (`payu`)

Panduan lengkap integrasi Payment Gateway **PayU (OpenPayU REST API v2.1)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial PayU dapat diperoleh melalui dashboard merchant PayU:

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=payu
PAYU_POS_ID=300746
PAYU_MD5_KEY=...
PAYU_OAUTH_CLIENT_ID=300746
PAYU_OAUTH_CLIENT_SECRET=...
PAYU_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarPayu = new Buayar({
  provider: "payu",
  merchantCode: "300746", // POS ID
  apiKey: "...",          // MD5 Key
  extra: {
    oauthClientId: "300746",
    oauthClientSecret: "...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-PAYU-001",
  amount: 10000, // minor units (100.00 PLN)
  currency: "PLN",
  productDetails: "Online Subscription",
  customer: {
    name: "Jan Kowalski",
    email: "jan@example.pl",
  },
  returnUrl: "https://myapp.com/payment/summary",
});

if (invoice.success) {
  console.log("PayU Redirect URL:", invoice.paymentUrl);
  console.log("PayU Order ID:", invoice.reference);
}
```
