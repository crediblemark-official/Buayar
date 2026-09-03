# Panduan Integrasi iPaymu di Buayar

Dokumentasi lengkap mengenai integrasi payment gateway **iPaymu API v2** pada SDK Buayar, mencakup transaksi langsung (Direct API), halaman pembayaran (Redirect Checkout), Split Payment, logistik COD, pengecekan saldo, riwayat mutasi, dan panduan simulasi sandbox.

---

## 1. Konfigurasi Lingkungan (.env)

Buayar menggunakan konfigurasi terpadu berbasis prefix `BUAYAR_*`:

```env
# Provider aktif
BUAYAR_PROVIDER=ipaymu

# Kredensial iPaymu (dapat dilihat di dashboard iPaymu menu Integrasi)
BUAYAR_MERCHANT_CODE=000000xxxxxxxxxx   # Nomor Virtual Account (VA) Utama Merchant
BUAYAR_API_KEY=SANDBOXxxxxxxxxxxxxxxxx  # API Key iPaymu

# Mode Sandbox (true untuk development, false untuk production)
BUAYAR_SANDBOX=true

# URL Notifikasi Webhook (opsional, dapat di-override di setiap invoice)
BUAYAR_CALLBACK_URL=https://domain-anda.com/api/payment/webhook
BUAYAR_RETURN_URL=https://domain-anda.com/payment/success
```

---

## 2. Inisialisasi SDK

```typescript
import { Buayar } from "buayar";

// Otomatis membaca dari process.env:
const buayar = new Buayar();

// Atau inisialisasi eksplisit:
const buayar = new Buayar({
  provider: "ipaymu",
  merchantCode: "000000xxxxxxxxxx",
  apiKey: "SANDBOXxxxxxxxxxxxxxxxx",
  sandbox: true,
});
```

---

## 3. Mengambil Metode Pembayaran Aktif (100% Dinamis)

Buayar menembak endpoint resmi `GET /api/v2/payment-channels` secara dinamis tanpa data statis/dummy:

```typescript
const result = await buayar.getPaymentMethods();

if (result.success) {
  console.log("Total channel aktif:", result.methods.length);

  // methods sudah dikelompokkan per kategori untuk UI Accordion:
  console.log(result.categories);
  // Output kategori: Virtual Account, QRIS, Retail / Gerai, Kartu Kredit, Paylater / Cicilan, COD

  // Contoh struktur channel:
  console.log(result.methods[0]);
  /*
  {
    paymentMethod: "bag_va",
    code: "bag_va",
    paymentName: "VA BAG",
    paymentImage: "https://sandbox.ipaymu.com/asset/images/...",
    totalFee: "IDR 3,500",
    category: "Virtual Account",
    extra: {
      healthStatus: "online",
      featureStatus: "active",
      instructionsDoc: "https://...",
      feeDetail: { ActualFee: 3500, ActualFeeType: "FLAT", AdditionalFee: 0 }
    }
  }
  */
}
```

---

## 4. Pembuatan Tagihan (Invoice)

### A. Direct Payment (Custom Native UI)
Menghasilkan nomor VA, kode bayar, atau QRIS langsung tanpa mengalihkan pembeli keluar dari aplikasi Anda.

```typescript
const invoice = await buayar.createInvoice({
  orderId: `INV-${Date.now()}`,
  amount: 100000,
  paymentMethod: "bca_va", // Canonical code: bca_va, mandiri_va, bri_va, bni_va, cimb_va, qris, alfamart, indomaret, dll.
  productDetails: "Langganan Premium 1 Bulan",
  customer: {
    name: "Budi Santoso",
    email: "budi@mail.com",
    phone: "081234567890",
  },
  // Opsi Tambahan iPaymu:
  feeDirection: "BUYER", // "BUYER" (bebankan fee ke pembeli) atau "MERCHANT" (potong omset)
  escrow: false,         // true untuk rekening bersama iPaymu
});

if (invoice.success) {
  console.log("Transaction ID (Trx ID):", invoice.reference); // Contoh: "229432"
  console.log("Nomor Virtual Account:", invoice.vaNumber);     // Contoh: "3811800034705407"
  console.log("Expired:", invoice.expiresAt);
}
```

### B. Redirect Payment (Hosted Payment Page)
Cukup kosongkan `paymentMethod` untuk menggunakan halaman checkout bawaan iPaymu:

```typescript
const invoice = await buayar.createInvoice({
  orderId: `ORDER-${Date.now()}`,
  amount: 250000,
  productDetails: "Sepatu Olahraga",
  customer: {
    name: "Siti Rahma",
    email: "siti@mail.com",
    phone: "081999888777",
  },
  returnUrl: "https://toko-anda.com/checkout/success",
});

// Arahkan browser pembeli ke URL pembayaran:
console.log("Redirect URL:", invoice.paymentUrl);
```

---

## 5. Split Payment (Bagi Hasil Realtime Otomatis)

Layanan Split Payment iPaymu digunakan untuk mendistribusikan dana transaksi secara realtime ke akun reseller, mitra cabang, atau affiliate (biaya Rp 150/split, minimal split Rp 500).

### Langkah 1: Daftarkan Mitra Baru (*Single Register API*)
```typescript
const client = buayar.getIpaymuClient();

const reg = await client.registerUser({
  name: "Mitra Cabang Surabaya",
  email: "cabang.surabaya@mitra.com",
  phone: "081233445566",
});

console.log("VA Child Account:", reg.Data.Va); 
// Output: "0000001233445566"
```

### Langkah 2: Buat Transaksi Menggunakan Parameter `subAccountId`
```typescript
const invoice = await buayar.createInvoice({
  orderId: `SPLIT-${Date.now()}`,
  amount: 500000,
  paymentMethod: "bca_va",
  productDetails: "Paket Reseller",
  customer: { name: "Pelanggan", email: "pelanggan@mail.com" },
  // Kirim VA Child Account tujuan split:
  subAccountId: "0000001233445566",
});

// Pembayaran otomatis terbagi dan dicatat atas nama rekening mitra
```

---

## 6. Logistik COD (Cash On Delivery)

iPaymu mendukung pembayaran COD terintegrasi dengan ekspedisi pengiriman (SAP, SiCepat, SPX, RPX, dll.).

```typescript
const client = buayar.getIpaymuClient();

// 1. Cari Kode Area Berdasarkan Nama Kota / Kecamatan
const areaResult = await client.getCodArea("denpasar");
const areaList = areaResult.data;
// Contoh: { id: 26027, label: "DAUH PURI, DENPASAR BARAT, DENPASAR, 80113", zip_code: "80113" }

// 2. Hitung Estimasi Ongkir COD
const rates = await client.getCodRate({
  pickup_area_id: areaList[0].id,
  destination_area_id: areaList[1].id,
  weight: 1,      // Dalam kilogram
  amount: 150000, // Nilai barang COD
});
console.log("Opsi Ekspedisi:", rates.data);
// [ { shipping_name: "SICEPAT", service_name: "REG", shipping_fee: 11500 }, ... ]

// 3. Request Penjemputan Paket (Pickup)
const pickup = await client.getCodPickup({
  transaction_id: invoice.reference,
  pickup_date: "2026-09-05",
  pickup_time: "14:00",
  pickup_vehicle: "Motor", // "Motor" | "Mobil"
});

// 4. Unduh Label Resi Pengiriman
const label = await client.getCodAwb(invoice.reference);

// 5. Lacak Status Pengiriman (Tracking)
const tracking = await client.getCodTracking({
  awb: "AWB1234567890",
  transaction_id: invoice.reference,
});
```

---

## 7. Public Area API (Wilayah Administratif Indonesia)

Pencarian wilayah administratif Indonesia (read-only publik tanpa signature):

```typescript
const client = buayar.getIpaymuClient();

const provinces = await client.getAreasProvince();
const cities = await client.getAreasCity(51);        // ID Provinsi Bali
const districts = await client.getAreasDistrict(5171); // ID Kota Denpasar
const villages = await client.getAreasVillage(517101); // ID Kecamatan
```

---

## 8. Cek Saldo & Riwayat Transaksi

```typescript
const client = buayar.getIpaymuClient();

// Cek saldo merchant aktif:
const balance = await client.checkBalance();
console.log("Saldo Merchant: IDR", balance.balance);

// Riwayat mutasi berpaginasi:
const history = await client.getHistory({
  page: 1,
  limit: 10,
  status: 1, // 1 = Berhasil, 0 = Pending, -2 = Expired
});
console.log("Total Transaksi:", history.Data.Total);

// Daftar seluruh kode bank nasional di Indonesia:
const banks = await client.getBankList();
```

---

## 9. Webhook & Verifikasi Notifikasi Callback

Saat pembeli menyelesaikan pembayaran, iPaymu mengirimkan HTTP POST request ke `notifyUrl`:

```typescript
// Di handler Express.js / Next.js API route:
app.post("/api/payment/webhook", (req, res) => {
  const result = buayar.verifyCallback(req.body);

  if (result.isValid && result.isPaid) {
    console.log("Pembayaran Berhasil untuk Order ID:", result.orderId);
    console.log("Nominal Diterima:", result.amount);
    // Jalankan logika bisnis: update database status pesanan menjadi PAID
  }

  // Wajib kirim response status 200 ke iPaymu
  res.status(200).send("OK");
});
```

---

## 10. Panduan Pengujian di Simulator Sandbox

### Cara Mendapatkan Transaction ID
`Transaction ID` resmi dari iPaymu otomatis disimpan di **`invoice.reference`** saat memanggil `buayar.createInvoice()`:
```typescript
console.log(invoice.reference); // Contoh: "229432"
```

### Melakukan Simulasi Pembayaran
1. Buka dan login ke **[https://sandbox.ipaymu.com](https://sandbox.ipaymu.com)**.
2. Klik menu **"Tes Notify"** di bagian atas dashboard.
3. Masukkan **Transaction ID** dari invoice Anda (misal `229432`).
4. Klik tombol **"Kirim" / "Test"**.
5. Server iPaymu Sandbox akan mengubah status transaksi menjadi **Berhasil** dan otomatis mengirimkan webhook notifikasi ke `notifyUrl` Anda.

### Mengecek Status Transaksi via Kode
```typescript
const check = await buayar.checkTransaction({
  merchantOrderId: invoice.reference, // Transaction ID iPaymu
});

console.log("Status:", check.rawResponse.Data.StatusDesc);
// Output: "Berhasil"
```
