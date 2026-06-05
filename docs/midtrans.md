# 💳 Integrasi Midtrans (`midtrans`)

Halaman ini berisi panduan lengkap untuk menggunakan provider **Midtrans** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial
Untuk menggunakan provider Midtrans, Anda perlu menyiapkan objek konfigurasi berikut:

```typescript
const providerConfig = {
  merchantCode: "",              // Boleh kosong / diisi string kosong untuk Midtrans
  apiKey: "SB-Mid-server-xxxx",  // Server Key Midtrans Anda
  sandbox: true,                 // Set true untuk Sandbox, false untuk Production
};
```

---

## 🛠️ Membuat Transaksi (Invoice)

### 1. Mode Snap API (Halaman Pembayaran Midtrans / Redirect)
Jika Anda ingin menggunakan halaman Snap Midtrans yang telah disediakan untuk menyelesaikan transaksi pelanggan:

```typescript
import { paymentManager } from "@crediblemark/buayar";

const invoiceParams = {
  orderId: "ORDER-200350",
  amount: 250000,                // Nominal dalam Rupiah (integer)
  productDetails: "Pembelian Lisensi Software Premium",
  customer: {
    name: "Rasyiqi Crediblemark",
    email: "rasyiqi@crediblemark.com",
    phone: "081234567890",
  },
  returnUrl: "https://situsbisnis.com/payment/success",
  callbackUrl: "https://api.situsbisnis.com/v1/payment/callback",
};

async function checkoutSnap() {
  try {
    const result = await paymentManager.createInvoice(
      "midtrans",
      invoiceParams,
      providerConfig
    );

    if (result.success) {
      console.log("Invoice Snap Berhasil Dibuat! 🎉");
      console.log("Redirect URL:", result.paymentUrl); // Redirect pelanggan ke URL ini
      console.log("Snap Token:", result.reference);
    } else {
      console.error("Gagal membuat invoice Snap:", result.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}
```

### 2. Mode Core API / Direct Charge (Dapatkan VA / QRIS Instan)
Jika Anda ingin mengambil detail pembayaran secara langsung tanpa memunculkan UI Snap Midtrans, sertakan parameter `paymentMethod`:

```typescript
const coreParams = {
  ...invoiceParams,
  paymentMethod: "bca_va", // Pilihan: bca_va, bni_va, bri_va, mandiri_va, qris, gopay, dll.
};

async function checkoutDirect() {
  try {
    const result = await paymentManager.createInvoice(
      "midtrans",
      coreParams,
      providerConfig
    );

    if (result.success) {
      console.log("Nomor VA BCA:", result.vaNumber);
      console.log("Transaksi Reference ID:", result.reference);
    } else {
      console.error("Gagal memproses Direct Charge:", result.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}
```

#### Kode `paymentMethod` Core API yang Didukung:
- **Virtual Account (VA)**: `bca_va`, `bni_va`, `bri_va`, `permata_va`, `cimb_va`, `danamon_va`, `bsi_va`, `seabank_va`, `mandiri_va` (menggunakan echannel).
- **QRIS & E-Wallet**: `qris`, `gopay`, `shopeepay`, `ovo` (membutuhkan nomor telepon yang terdaftar pada `customer.phone`), `dana`, `linkaja`.
- **Retail Outlet**: `alfamart`, `indomaret`.
- **Kartu Kredit & Google Pay**: `credit_card` (memerlukan `token_id` dari browser client pada `providerParams.credit_card.token_id`), `googlepay`.
- **Paylater / Cicilan**: `kredivo`, `akulaku`.

---

## 🔔 Verifikasi Webhook Callback
Gunakan fungsi ini di endpoint API notifikasi Midtrans untuk memverifikasi keaslian signature SHA-512:

```typescript
import { paymentManager } from "@crediblemark/buayar";

async function handleMidtransCallback(req: any, res: any) {
  const callbackPayload = req.body; // Payload POST dari Midtrans

  try {
    const verification = await paymentManager.verifyCallback(
      "midtrans",
      callbackPayload,
      providerConfig
    );

    if (verification.isValid) {
      console.log(`Signature valid untuk Order ID: ${verification.orderId}`);
      
      if (verification.status === "paid") {
        console.log("Status: PEMBAYARAN LUNAS! ✅");
        // Update database: Tandai transaksi selesai
      } else if (verification.status === "failed") {
        console.log("Status: PEMBAYARAN GAGAL ❌");
      }
      
      res.status(200).json({ status: "OK" });
    } else {
      console.warn("Peringatan: Signature callback tidak valid!");
      res.status(400).send("Invalid Signature");
    }
  } catch (error) {
    console.error("Gagal memproses callback:", error);
    res.status(500).send("Internal Server Error");
  }
}
```

---

## 🔍 Cek Status Transaksi Manual
```typescript
async function checkMidtransStatus() {
  const result = await paymentManager.checkTransaction(
    "midtrans",
    { merchantOrderId: "ORDER-200350" },
    providerConfig
  );

  if (result.success) {
    console.log("Status Transaksi:", result.status); // "paid" | "pending" | "failed"
    console.log("Pesan Status:", result.statusMessage);
  }
}
```

---

## ⚡ Fitur Khusus: Midtrans Client (`MidtransClient`)

Jika Anda memerlukan manipulasi transaksi pasca-pembayaran atau fitur-fitur spesifik Midtrans yang tidak masuk ke dalam interface umum SDK, Anda dapat membuat instance `MidtransClient`:

```typescript
const midtransClient = paymentManager.getMidtransClient(providerConfig);
```

### 1. Transaksi & Refund
* **Membatalkan Transaksi**
  ```typescript
  await midtransClient.cancelTransaction("ORDER-200350");
  ```
* **Melakukan Refund**
  ```typescript
  await midtransClient.refundTransaction("ORDER-200350", {
    amount: 50000,
    reason: "Pengembalian dana produk cacat",
  });
  ```
* **Mengubah Transaksi Menjadi Kadaluarsa (Force Expire)**
  ```typescript
  await midtransClient.expireTransaction("ORDER-200350");
  ```
* **Aksi Lainnya**: `approveTransaction(orderId)`, `denyTransaction(orderId)`, `captureTransaction(transactionId, amount)`.

### 2. GoPay Tokenization API
Digunakan untuk menautkan dan mengelola akun GoPay pengguna di platform Anda:
- `linkPayAccount(payload)`: Mendaftarkan akun GoPay pengguna.
- `getPayAccount(accountId)`: Mengambil status tokenisasi akun GoPay.
- `unbindPayAccount(accountId)`: Memutuskan tautan akun GoPay.
- `getGoPayPromo(accountId, grossAmount)`: Mengambil promo GoPay yang tersedia untuk akun tersebut.

### 3. Subscription (Recurring) API
Digunakan untuk layanan berlangganan berkala:
- `createSubscription(payload)`: Membuat paket langganan baru.
- `getSubscription(subscriptionId)`: Mengambil status langganan.
- `updateSubscription(subscriptionId, payload)`: Memperbarui paket langganan.
- `disableSubscription(subscriptionId)`: Menonaktifkan langganan.
- `enableSubscription(subscriptionId)`: Mengaktifkan kembali langganan.

### 4. Payment Link API
- `createPaymentLink(payload)`: Membuat tautan pembayaran instan Midtrans.
- `getPaymentLink(paymentLinkId)`: Mengambil detail tautan pembayaran.
- `deletePaymentLink(paymentLinkId)`: Menghapus tautan pembayaran.

### 5. Invoicing & Balance API
- `createBillingInvoice(payload)`: Membuat e-invoice.
- `voidBillingInvoice(invoiceId)`: Membatalkan e-invoice.
- `getBalance()`: Mengambil sisa saldo merchant (Mendukung integrasi IRIS API).
