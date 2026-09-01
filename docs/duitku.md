# 💳 Integrasi Duitku (`duitku`)

Halaman ini berisi panduan lengkap untuk menggunakan provider **Duitku** dengan `@crediblemark/buayar`.

---

## ⚙️ Konfigurasi Kredensial
Untuk menggunakan provider Duitku, Anda perlu menyiapkan objek konfigurasi berikut:

```typescript
const providerConfig = {
  merchantCode: "DXXXX",         // Merchant Code dari dashboard Duitku Anda
  apiKey: "xxxxxxxxxxxxxxxx",    // API Key / Merchant Key Anda
  sandbox: true,                 // Set true untuk development / testing
};
```

---

## 🛠️ Membuat Transaksi (Invoice)

### 1. Mode Redirect Checkout (Duitku Checkout Page)
Jika Anda ingin mengarahkan pelanggan ke halaman pembayaran yang disediakan oleh Duitku (di mana pelanggan dapat memilih sendiri metode pembayaran mereka):

```typescript
import { paymentManager } from "@crediblemark/buayar";

const invoiceParams = {
  orderId: "ORDER-100249",
  amount: 150000,                // Nominal dalam Rupiah (integer)
  productDetails: "Pembelian Template Landing Page Premium",
  customer: {
    name: "Rasyiqi Crediblemark",
    email: "rasyiqi@crediblemark.com",
    phone: "081234567890",
  },
  returnUrl: "https://situsbisnis.com/payment/success",
  callbackUrl: "https://api.situsbisnis.com/v1/payment/callback",
};

async function checkoutRedirect() {
  try {
    const result = await paymentManager.createInvoice(
      "duitku",
      invoiceParams,
      providerConfig
    );

    if (result.success) {
      console.log("Invoice Berhasil Dibuat! 🎉");
      console.log("Halaman Pembayaran:", result.paymentUrl); // Redirect pelanggan ke URL ini
      console.log("Referensi Duitku:", result.reference);
    } else {
      console.error("Gagal membuat invoice:", result.error);
    }
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
  }
}
```

### 2. Mode Direct Inquiry (Dapatkan VA / QRIS Instan)
Jika Anda ingin menampilkan nomor Virtual Account atau kode QRIS langsung di website/aplikasi Anda tanpa mengarahkan pelanggan keluar dari situs Anda, sertakan opsi `paymentMethod`:

```typescript
const directParams = {
  orderId: "ORDER-100249",
  amount: 150000,
  productDetails: "Pembelian Template Landing Page Premium",
  customer: {
    name: "Rasyiqi Crediblemark",
    email: "rasyiqi@crediblemark.com",
    phone: "081234567890",
  },
  returnUrl: "https://situsbisnis.com/payment/success",
  callbackUrl: "https://api.situsbisnis.com/v1/payment/callback",
  paymentMethod: "BCA", // Contoh kode pembayaran Duitku untuk BCA Virtual Account
};

async function checkoutDirect() {
  try {
    const result = await paymentManager.createInvoice(
      "duitku",
      directParams,
      providerConfig
    );

    if (result.success) {
      console.log("Nomor Virtual Account:", result.vaNumber);
      console.log("Referensi Duitku:", result.reference);
    } else {
      console.error("Gagal memproses direct inquiry:", result.error);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}
```

---

## 🔔 Verifikasi Webhook Callback
Gunakan fungsi ini di endpoint API notifikasi Duitku untuk memverifikasi keaslian signature data:

```typescript
import { paymentManager } from "@crediblemark/buayar";

async function handleDuitkuCallback(req: any, res: any) {
  const callbackPayload = req.body; // Payload POST dari Duitku

  try {
    const verification = await paymentManager.verifyCallback(
      "duitku",
      callbackPayload,
      providerConfig
    );

    if (verification.isValid) {
      console.log(`Signature valid untuk Order ID: ${verification.orderId}`);
      
      if (verification.status === "paid") {
        console.log("Status: PEMBAYARAN LUNAS! ✅");
        // Update status order di database Anda menjadi LUNAS/SUCCESS
      } else if (verification.status === "failed") {
        console.log("Status: PEMBAYARAN GAGAL ❌");
        // Update status order di database Anda menjadi GAGAL
      }
      
      // Duitku memerlukan respon plaintext "OK" jika callback berhasil diproses
      res.status(200).send("OK");
    } else {
      console.warn("Peringatan: Signature callback tidak valid!");
      res.status(400).send("Bad Signature");
    }
  } catch (error) {
    console.error("Gagal memproses callback:", error);
    res.status(500).send("Internal Server Error");
  }
}
```

---

## 🔍 Cek Status Transaksi Manual
Anda dapat melakukan polling atau pemeriksaan status transaksi secara manual:

```typescript
async function checkTransactionStatus() {
  const result = await paymentManager.checkTransaction(
    "duitku",
    { merchantOrderId: "ORDER-100249" },
    providerConfig
  );

  if (result.success) {
    console.log("Status Transaksi:", result.status); // "paid" | "pending" | "failed"
    console.log("Detail Status:", result.statusMessage);
  }
}
```

---

## 📋 Mendapatkan Daftar Metode Pembayaran Aktif
Anda dapat mengambil daftar metode pembayaran yang tersedia secara dinamis beserta rincian biaya (fee) transaksi:

```typescript
async function loadDuitkuMethods() {
  const result = await paymentManager.getPaymentMethods(
    "duitku",
    { amount: 150000 },
    providerConfig
  );

  if (result.success) {
    console.log("Metode Pembayaran Aktif:", result.methods);
    // SDK secara otomatis mengelompokkan ke dalam kategori terstandarisasi untuk UI:
    // "Virtual Account", "QRIS", "E-Wallet", "Retail / Gerai", "Lainnya"
```

---

## 🏦 Ekstensi `DuitkuClient` (Disbursement & Saldo)

Selain alur transaksi reguler, SDK menyediakan **`DuitkuClient`** untuk mengelola pengecekan saldo dan transfer dana / payout (*disbursement*):

```typescript
import { buayar, DuitkuClient } from "@crediblemark/buayar";

// Opsi 1: Dari instance buayar
const client = buayar.getDuitkuClient();

// Opsi 2: Inisialisasi mandiri
// const client = new DuitkuClient({ merchantCode: "DXXXX", apiKey: "...", sandbox: true });

// 1. Cek Saldo Merchant
const balanceResult = await client.checkBalance();
console.log("Saldo Merchant:", balanceResult.balance);

// 2. Daftar Bank yang Didukung Payout
const banks = await client.listBanks();
console.log("Daftar Bank:", banks);

// 3. Validasi Pemilik Rekening Bank (Inquiry)
const accountInfo = await client.inquiryBankAccount("BCA", "1234567890");
console.log("Nama Pemilik:", accountInfo.accountName);

// 4. Eksekusi Transfer Dana (Disbursement)
const disburseResult = await client.disburse({
  merchantOrderId: "DISBURSE-001",
  bankCode: "BCA",
  bankAccount: "1234567890",
  amount: 500000,
  purpose: "Penarikan Saldo Mitra",
  senderName: "PT Bisnis Anda",
});
console.log("Status Transfer:", disburseResult);
```

