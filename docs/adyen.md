# 💳 Integrasi Adyen (`adyen`)

Panduan lengkap integrasi Payment Gateway **Adyen Checkout Sessions API v71** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial Adyen dapat diperoleh melalui [ca-test.adyen.com](https://ca-test.adyen.com):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=adyen
ADYEN_API_KEY=AQE...
ADYEN_MERCHANT_ACCOUNT=YourMerchantAccount
ADYEN_CLIENT_KEY=test_...
ADYEN_HMAC_KEY=4A6...
ADYEN_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayarAdyen = new Buayar({
  provider: "adyen",
  apiKey: "AQE...",
  merchantCode: "YourMerchantAccount",
  extra: {
    hmacKey: "4A6...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-ADYEN-001",
  amount: 150000,
  currency: "IDR",
  productDetails: "Annual Cloud Hosting",
  customer: {
    name: "Alex",
    email: "alex@example.com",
  },
  returnUrl: "https://myapp.com/payment/return",
});

if (invoice.success) {
  console.log("Checkout URL:", invoice.paymentUrl);
  console.log("Session ID:", invoice.reference);
}
```
