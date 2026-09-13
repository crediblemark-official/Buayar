# 💳 Panduan Integrasi SumoPod di Buayar

Dokumentasi lengkap mengenai integrasi payment gateway **SumoPod** pada SDK Buayar ([`@crediblemark/buayar`](https://github.com/crediblemark-official/Buayar)), mencakup pembuatan link pembayaran (Payment Links), kanal QRIS, pengecekan status, dan verifikasi webhook ganda (**Svix HMAC-SHA256** dan **X-Webhook-Token**).

---

## 📑 Daftar Isi

1. [Fitur & Kemampuan](#-fitur--kemampuan)
2. [Konfigurasi Lingkungan (.env)](#-konfigurasi-lingkungan-env)
3. [Inisialisasi SDK](#-inisialisasi-sdk)
4. [Membuat Transaksi Pembayaran](#-membuat-transaksi-pembayaran)
5. [Mendapatkan Metode Pembayaran (QRIS)](#-mendapatkan-metode-pembayaran-qris)
6. [Mengecek Status Transaksi](#-mengecek-status-transaksi)
7. [Penanganan Webhook Universal](#-penanganan-webhook-universal)
8. [Menggunakan Direct Client (`SumopodClient`)](#-menggunakan-direct-client-sumopodclient)
9. [Contoh Implementasi Webhook (Express, Hono, Next.js)](#-contoh-implementasi-webhook)

---

## 🚀 Fitur & Kemampuan

- ⚡ **Host API**: `https://api-pay.sumopod.com`
- 📱 **Metode Pembayaran**: **QRIS** (Settlement 2 hari, Biaya Transaksi: `0.7% + Rp 300`)
- 🔗 **Mode Pembayaran**: Hosted Payment Link / QRIS Checkout Page
- 🪝 **Dukungan Webhook Ganda**:
  - **Svix Signature** (`svix-id`, `svix-timestamp`, `svix-signature` HMAC-SHA256) dengan proteksi replay attack (5 menit) dan toleransi rotasi secret.
  - **X-Webhook-Token** (`x-webhook-token`) dengan perbandingan konstan waktu (*timing-safe*).
- 🔄 **Zero-Code PG Switcher**: Ganti provider ke/dari SumoPod cukup dengan mengubah variabel `.env`.

---

## ⚙️ Konfigurasi Lingkungan (.env)

### 1. Variabel Universal (`BUAYAR_*`) — **Direkomendasikan**

```env
# Aktifkan SumoPod sebagai provider
BUAYAR_PROVIDER=sumopod

# API Key SumoPod dari dashboard Anda
BUAYAR_API_KEY=your_sumopod_api_key_here

# Signing secret webhook Svix (dimulai dengan whsec_...)
BUAYAR_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ATAU Token webhook (dimulai dengan whtok_...)
BUAYAR_WEBHOOK_TOKEN=whtok_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# URL callback dan redirect
BUAYAR_CALLBACK_URL=https://domain-anda.com/api/payment/webhook
BUAYAR_RETURN_URL=https://domain-anda.com/payment/success
```

### 2. Variabel Spesifik SumoPod (Opsional)

Jika Anda ingin menggunakan format env khusus SumoPod:

```env
SUMOPOD_API_KEY=your_sumopod_api_key_here
SUMOPOD_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUMOPOD_WEBHOOK_TOKEN=whtok_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 Inisialisasi SDK

### Menggunakan Singleton Global (Membaca `.env` Otomatis)

```typescript
import { buayar } from "@crediblemark/buayar";

// Siap langsung digunakan
```

### Inisialisasi Instance Manual

```typescript
import { Buayar } from "@crediblemark/buayar";

const buayar = new Buayar({
  provider: "sumopod",
  apiKey: "your_sumopod_api_key_here",
  extra: {
    webhookSecret: "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    webhookToken: "whtok_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
});
```

---

## 🛒 Membuat Transaksi Pembayaran

Panggil `createInvoice()` untuk membuat payment link SumoPod:

```typescript
const invoice = await buayar.createInvoice({
  orderId: "INV-2026-001",
  amount: 50000,
  productDetails: "Langganan Premium 1 Bulan",
  customer: {
    name: "Budi Pratama",
    email: "budi@example.com",
    phone: "081234567890",
  },
  // Opsional: override URL per transaksi
  returnUrl: "https://domain-anda.com/payment/success",
  // Opsional: kustomisasi durasi kedaluwarsa (jam, 1-24)
  providerParams: {
    expires_in_hours: 24,
    cancel_return_url: "https://domain-anda.com/payment/cancel",
  },
});

if (invoice.success) {
  console.log("Payment URL:", invoice.paymentUrl);
  // https://pay.sumopod.com/pay/uuid-xxxx
  console.log("Payment ID:", invoice.reference);
  console.log("Kedaluwarsa pada:", invoice.expiresAt);

  // Redirect pelanggan ke invoice.paymentUrl
} else {
  console.error("Gagal membuat invoice:", invoice.error);
}
```

---

## 📱 Mendapatkan Metode Pembayaran (QRIS)

SumoPod menyediakan kanal pembayaran QRIS nasional:

```typescript
const methods = await buayar.getPaymentMethods({ amount: 50000 });

if (methods.success) {
  console.log(methods.methods);
  /* Output:
  [
    {
      paymentMethod: "qris",
      code: "QRIS",
      paymentName: "QRIS",
      paymentImage: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_QRIS.svg",
      totalFee: "0.7% + Rp 300",
      category: "QRIS",
      feeDetail: {
        percent: 0.7,
        flat: 300,
        totalFee: 650
      }
    }
  ]
  */
}
```

---

## 🔍 Mengecek Status Transaksi

Untuk mengecek status transaksi yang sudah dibuat:

```typescript
const status = await buayar.checkTransaction({
  merchantOrderId: "INV-2026-001", // atau payment_id
});

if (status.success) {
  console.log("Status:", status.status); // "paid" | "pending" | "failed" | "expired"
  console.log("Apakah sudah terbayar?", status.isPaid);
  console.log("Nominal:", status.amount);
}
```

---

## 🪝 Penanganan Webhook Universal

SumoPod mengirimkan HTTP `POST` webhook untuk setiap perubahan status pembayaran.

### Struktur Payload Masuk dari SumoPod

```json
{
  "event_type": "payment.completed",
  "data": {
    "payment_id": "uuid-xxxx",
    "order_id": "INV-2026-001",
    "amount": 50000,
    "fee": 750,
    "net_amount": 49250,
    "status": "completed",
    "payment_method": "qris",
    "completed_at": "2026-06-18T12:00:00Z"
  }
}
```

### Event yang Didukung:
| Event | Status Buayar | Deskripsi |
|---|---|---|
| `payment.completed` | `paid` (`isPaid: true`) | Pembayaran berhasil |
| `payment.failed` | `failed` (`isFailed: true`) | Pembayaran gagal |
| `payment.expired` | `expired` (`isExpired: true`) | Tagihan kedaluwarsa |
| `payment.test` | `pending` (`isPending: true`) | Event pengujian dari Dashboard |

---

## 🌐 Contoh Implementasi Webhook

### 1. Express.js

> **PENTING untuk Verifikasi Svix:**  
> Header Svix membutuhkan string raw body asli tanpa modifikasi spasi. Gunakan `express.raw({ type: "application/json" })` atau `express.json({ verify: ... })`.

```typescript
import express from "express";
import { buayar } from "@crediblemark/buayar";

const app = express();

app.post(
  "/api/payment/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const rawBody = req.body.toString("utf8");
    const payload = JSON.parse(rawBody);

    // Kirim payload dan headers (svix-id, svix-timestamp, svix-signature, atau x-webhook-token)
    const result = await buayar.verifyWebhook(payload, req.headers, {
      extra: { rawBody },
    });

    if (!result.isValid) {
      return res.status(401).send("Invalid signature or token");
    }

    if (result.isPaid) {
      console.log(`Order ${result.orderId} senilai Rp ${result.amount} sukses terbayar!`);
      // Update status pesanan di database Anda
    } else if (result.isExpired) {
      console.log(`Order ${result.orderId} kedaluwarsa.`);
    }

    return res.status(200).send("OK");
  }
);
```

### 2. Hono

```typescript
import { Hono } from "hono";
import { buayar } from "@crediblemark/buayar";

const app = new Hono();

app.post("/api/payment/webhook", async (c) => {
  const rawBody = await c.req.text();
  const payload = JSON.parse(rawBody);
  const headers = c.req.header();

  const result = await buayar.verifyWebhook(payload, headers, {
    extra: { rawBody },
  });

  if (!result.isValid) {
    return c.text("Invalid webhook signature", 401);
  }

  if (result.isPaid) {
    // Proses pembayaran sukses
  }

  return c.text("OK", 200);
});
```

### 3. Next.js App Router (`src/app/api/payment/webhook/route.ts`)

```typescript
import { NextResponse } from "next/server";
import { buayar } from "@crediblemark/buayar";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);

  const headers: Record<string, string> = {};
  request.headers.forEach((val, key) => {
    headers[key] = val;
  });

  const result = await buayar.verifyWebhook(payload, headers, {
    extra: { rawBody },
  });

  if (!result.isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (result.isPaid) {
    // Update order status di database
  }

  return NextResponse.json({ status: "OK" });
}
```

---

## 🛠️ Menggunakan Direct Client (`SumopodClient`)

Jika Anda memerlukan akses langsung tanpa melalui abstraksi universal:

```typescript
import { SumopodClient } from "@crediblemark/buayar";

const client = new SumopodClient({
  apiKey: process.env.SUMOPOD_API_KEY,
});

// 1. Buat transaksi
const payment = await client.createPayment({
  order_id: "ORD-999",
  amount: 25000,
  currency: "IDR",
  expires_in_hours: 12,
  payment_method_type_code: "QRIS",
});
console.log("Payment URL:", payment.payment_link_url);

// 2. Ambil detail pembayaran
const detail = await client.getPayment(payment.payment_id);
console.log("Status terkini:", detail.status);
```

---

## 🔒 Catatan Keamanan

1. **Replay Attack Protection**: Verifikasi Svix otomatis menolak webhook jika timestamp berbeda lebih dari 5 menit (300 detik) dari waktu server.
2. **Timing-Safe Comparison**: Perbandingan signature HMAC dan `x-webhook-token` dilakukan menggunakan `safeCompare` berbasis `crypto.timingSafeEqual` untuk mencegah kerentanan timing attack.
3. **Secret Rotation**: Saat Anda melakukan rotasi webhook secret di dashboard SumoPod, header `svix-signature` dapat memuat beberapa signature sekaligus. SDK Buayar secara otomatis memverifikasi seluruh kandidat signature.
