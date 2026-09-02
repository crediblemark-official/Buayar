# 💳 Integrasi 2Checkout / Verifone (`twocheckout`)

Panduan lengkap integrasi Payment Gateway **2Checkout / Verifone (Orders API v6)** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial

Kredensial 2Checkout dapat diperoleh melalui [secure.2checkout.com/cpanel](https://secure.2checkout.com/cpanel):

```env
# Menggunakan .env (Direkomendasikan)
PROVIDER_PG=twocheckout
TWOCHECKOUT_MERCHANT_CODE=...
TWOCHECKOUT_SECRET_KEY=...
TWOCHECKOUT_SECRET_WORD=...
TWOCHECKOUT_SANDBOX=true
```

Atau inisialisasi manual:

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayar2Co = new Buayar({
  provider: "twocheckout",
  merchantCode: "...", // Merchant Code
  apiKey: "...",       // Secret Key
  extra: {
    secretWord: "...",
  },
  sandbox: true,
});
```

---

## 🛠️ Membuat Transaksi

```typescript
import { buayar } from "@crediblemark/buayar";

const invoice = await buayar.createInvoice({
  orderId: "ORDER-2CO-001",
  amount: 4900, // minor units ($49.00)
  currency: "USD",
  productDetails: "SaaS Monthly License",
  customer: {
    name: "Tony Stark",
    email: "tony@example.com",
  },
  returnUrl: "https://myapp.com/payment/complete",
});

if (invoice.success) {
  console.log("Hosted Checkout Link:", invoice.paymentUrl);
  console.log("2Checkout Reference:", invoice.reference);
}
```
