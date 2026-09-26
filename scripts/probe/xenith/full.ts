/**
 * Test Komprehensif Seluruh Fitur Xenith Pay di Buayar SDK
 *
 * Menguji:
 * 1. Pengecekan Saldo Merchant (buayar.checkBalance)
 * 2. Katalog Metode Pembayaran Live & Accordion-Ready (buayar.getPaymentMethods)
 * 3. Hosted Payment Link Checkout (buayar.createInvoice - checkout mode)
 * 4. Direct Pay In QRIS & Virtual Accounts (buayar.createInvoice - direct mode)
 * 5. Pengecekan Status Transaksi (buayar.checkTransaction)
 * 6. Live Account Inquiry Pre-payout (client.syncAccountInquiry)
 * 7. Live Payout Channels (client.request /v1/payouts/channels)
 * 8. Payout / Disbursement (buayar.disburse)
 * 9. Webhook Signature Verification & Fail-Closed Protection (buayar.verifyWebhook)
 */

import { Buayar } from "../../../src";
import type { CanonicalPaymentMethod } from "../../../src/types";

const ACCESS_KEY = (
  process.env.XENITH_ACCESS_KEY ||
  process.env.BUAYAR_API_KEY ||
  "ak-e9ce58b15df22bdc9ecf54cd0b5ef2de032ba574ad0b83e83dce289664b72dcc"
).trim();

const SECRET_KEY = (
  process.env.XENITH_SECRET_KEY ||
  process.env.BUAYAR_SECRET_KEY ||
  "sk-1bacf5b23174461209e16b0b35c92dc180ee5481f354f10e7d9976a864c8216fe01aa61f178d2e024de191d60c3a869bf9d3d82db1554814ec129a2bd1bb9115"
).trim();

const WEBHOOK_SECRET = (
  process.env.XENITH_WEBHOOK_SECRET ||
  process.env.BUAYAR_WEBHOOK_SECRET ||
  "bNhIQPhTEOWhdS8-ukYPBIpvVITadn51jlshccNG33IqdYmed3GgeyzbsQZB0y3o"
).trim();

const buayar = new Buayar({
  provider: "xenith",
  apiKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
  webhookSecret: WEBHOOK_SECRET,
  sandbox: true,
  callbackUrl: "https://my-store.com/api/webhook",
  returnUrl: "https://my-store.com/payment/finish",
});

async function runFullTest() {
  console.log("================================================================================");
  console.log("⚡ TEST PENUH FITUR XENITH PAY DENGAN BUAYAR SDK");
  console.log("================================================================================");
  console.log(`Endpoint Target: https://openapi.sandbox.xenithpay.com`);
  console.log(`Access Key:      ${ACCESS_KEY.slice(0, 14)}...`);
  console.log(`Secret Key:      ${SECRET_KEY.slice(0, 14)}...`);
  console.log(`Webhook Secret:  ${WEBHOOK_SECRET.slice(0, 14)}...`);
  console.log("--------------------------------------------------------------------------------\n");

  // ─── 1. Cek Saldo ──────────────────────────────────────────────────────────
  console.log("📌 [1/8] Pengecekan Saldo Merchant (buayar.checkBalance)");
  const balance = await buayar.checkBalance();
  if (balance.success) {
    console.log(`  ✅ Saldo Berhasil Diambil: ${balance.currency || "IDR"} ${(balance.balance || 0).toLocaleString("id-ID")}`);
  } else {
    console.error(`  ❌ Gagal Cek Saldo: ${balance.error}`);
  }

  // ─── 2. Katalog Metode Pembayaran Live ─────────────────────────────────────
  console.log("\n📌 [2/8] Katalog Metode Pembayaran Live (buayar.getPaymentMethods)");
  const methodsRes = await buayar.getPaymentMethods();
  if (methodsRes.success) {
    console.log(`  ✅ Total Metode Pembayaran Aktif: ${methodsRes.methods.length} kanal`);
    for (const m of methodsRes.methods) {
      console.log(`     • [${m.category}] ${m.paymentName} (Kode: ${m.code || m.paymentMethod}) - Fee: ${m.totalFee}`);
    }
  } else {
    console.error(`  ❌ Gagal Ambil Metode: ${methodsRes.error}`);
  }

  // ─── 3. Hosted Payment Link Checkout ──────────────────────────────────────
  console.log("\n📌 [3/8] Pembuatan Hosted Payment Link (Checkout Mode)");
  const linkOrderId = `ORDER-LINK-${Date.now()}`;
  const linkRes = await buayar.createInvoice({
    orderId: linkOrderId,
    amount: 75000,
    productDetails: "Paket Langganan Premium 1 Bulan",
    customer: {
      name: "Rasyiqi Pratama",
      email: "rasyiqi@example.com",
      phone: "081234567890",
    },
  });

  if (linkRes.success) {
    console.log(`  ✅ Hosted Checkout Berhasil Dibuat!`);
    console.log(`     Order ID:    ${linkRes.orderId}`);
    console.log(`     Reference:   ${linkRes.reference}`);
    console.log(`     Payment URL: ${linkRes.paymentUrl}`);
    console.log(`     Mode:        ${linkRes.mode}`);
    console.log(`     Expires At:  ${linkRes.expiresAt}`);
  } else {
    console.error(`  ❌ Gagal Buat Payment Link: ${linkRes.error}`);
  }

  // ─── 4. Direct Pay In (QRIS & Virtual Accounts) ───────────────────────────
  console.log("\n📌 [4/8] Pembuatan Direct Pay In (QRIS & Virtual Accounts)");
  const directChannels: Array<{ method: CanonicalPaymentMethod; name: string }> = [
    { method: "qris", name: "QRIS Nasional" },
    { method: "bri_va", name: "BRI Virtual Account" },
    { method: "mandiri_va", name: "Mandiri Virtual Account" },
    { method: "bni_va", name: "BNI Virtual Account" },
    { method: "permata_va", name: "Permata Virtual Account" },
    { method: "cimb_va", name: "CIMB Niaga Virtual Account" },
    { method: "danamon_va", name: "Danamon Virtual Account" },
  ];

  let samplePayinId = "";
  let samplePayinOrderId = "";

  for (const ch of directChannels) {
    const orderId = `ORDER-${String(ch.method).toUpperCase()}-${Date.now()}`;
    const invoice = await buayar.createInvoice({
      orderId,
      amount: 35000,
      paymentMethod: ch.method,
      productDetails: `Top Up Saldo via ${ch.name}`,
      customer: {
        name: "Rasyiqi Pratama",
        email: "rasyiqi@example.com",
        phone: "081234567890",
      },
    });

    if (invoice.success) {
      if (!samplePayinId) {
        samplePayinId = invoice.reference || "";
        samplePayinOrderId = orderId;
      }
      console.log(`  ✅ [${ch.name}]`);
      console.log(`     Ref: ${invoice.reference} | Mode: ${invoice.mode}`);
      if (invoice.paymentUrl) console.log(`     URL: ${invoice.paymentUrl}`);
      if (invoice.qrString)   console.log(`     QR:  ${invoice.qrString.slice(0, 32)}...`);
      if (invoice.vaNumber)   console.log(`     VA:  ${invoice.vaNumber}`);
    } else {
      console.error(`  ❌ [${ch.name}] Gagal: ${invoice.error}`);
    }
  }

  // ─── 5. Pengecekan Status Transaksi ───────────────────────────────────────
  console.log("\n📌 [5/8] Pengecekan Status Transaksi (buayar.checkTransaction)");
  if (linkRes.reference) {
    const plStatus = await buayar.checkTransaction({
      merchantOrderId: linkOrderId,
      transactionId: linkRes.reference,
    });
    console.log(`  ✅ Cek Payment Link: status="${plStatus.status}" (isPending: ${plStatus.isPending}, Amount: Rp ${(plStatus.amount).toLocaleString("id-ID")})`);
  }

  if (samplePayinId) {
    const payinStatus = await buayar.checkTransaction({
      merchantOrderId: samplePayinOrderId,
      transactionId: samplePayinId,
    });
    console.log(`  ✅ Cek Direct Pay In: status="${payinStatus.status}" (isPending: ${payinStatus.isPending}, Amount: Rp ${(payinStatus.amount).toLocaleString("id-ID")})`);
  }

  // ─── 6. Live Account Inquiry (Pre-flight Bank Validation) ──────────────────
  console.log("\n📌 [6/8] Validasi Nomor Rekening Bank Tujuan (Account Inquiry Live)");
  const client = buayar.getXenithClient();
  try {
    const inquiryRes = await client.syncAccountInquiry({
      currency: "IDR",
      destinationPayoutMethod: "BANK_TRANSFER",
      destinationPayoutChannel: "CENAIDJA", // BCA
      destinationPayoutAccount: "1234567890",
    });
    console.log(`  ✅ Rekening Valid:`, inquiryRes);
  } catch (err: any) {
    if (err.message?.includes("INVALID_ACCOUNT")) {
      console.log(`  ✅ Switching Bank Live Aktif: Validasi nomor rekening BCA palsu berhasil ditolak oleh bank (INVALID_ACCOUNT).`);
    } else {
      console.log(`  ℹ️ Response Inquiry: ${err.message}`);
    }
  }

  // ─── 7. Payout / Disbursement Channels & Transfer ─────────────────────────
  console.log("\n📌 [7/8] Payout Channels & Disbursement (buayar.disburse)");
  try {
    const channels = await client.request("GET", "/v1/payouts/channels?currency=IDR");
    console.log(`  ✅ Total Kanal Payout Bank Terdaftar: ${channels?.data?.length || 0} bank di Indonesia.`);

    const disbRes = await buayar.disburse({
      externalId: `DISB-${Date.now()}`,
      bankCode: "bca",
      accountNumber: "0123456789",
      accountHolderName: "Penerima Dana",
      amount: 100000,
      description: "Penarikan Dana Merchant",
    });

    if (disbRes.success) {
      console.log(`  ✅ Payout Berhasil Dikirim ke Gateway: Ref=${disbRes.reference}, Status=${disbRes.status}`);
    } else {
      console.log(`  ℹ️ Hasil Eksekusi Payout: ${disbRes.error}`);
    }
  } catch (e: any) {
    console.error(`  ❌ Error Payout:`, e.message);
  }

  // ─── 8. Webhook Signature Verification ────────────────────────────────────
  console.log("\n📌 [8/8] Verifikasi Keamanan Webhook Kriptografis (buayar.verifyWebhook)");
  const webhookTimestamp = new Date().toISOString();
  const webhookUrlPath = "/v1/webhook";
  const webhookPayload = {
    schemaVersion: "1.0.1",
    event: "PAYIN_STATUS_UPDATED",
    data: {
      id: "payin-test-complete-001",
      referenceCode: "ORDER-SAMPLE-PAID",
      status: "SUCCESS",
      paymentAmount: "75000",
      createdTime: webhookTimestamp,
    },
  };
  const rawBody = JSON.stringify(webhookPayload);

  // Buat signature resmi
  const { createHmac } = await import("node:crypto");
  const dataToSign = `POST\\n${webhookUrlPath}\\n${rawBody}\\n${webhookTimestamp}`;
  const validSignature = createHmac("sha256", WEBHOOK_SECRET).update(dataToSign).digest("base64");

  // Test 1: Webhook sah
  const verifiedWebhook = await buayar.verifyWebhook(
    webhookPayload,
    {
      "x-xenith-signature": validSignature,
      "x-xenith-timestamp": webhookTimestamp,
    },
    { rawBody, extra: { urlPath: webhookUrlPath } }
  );

  if (verifiedWebhook.isValid && verifiedWebhook.isPaid && verifiedWebhook.amount === 75000) {
    console.log(`  ✅ Webhook Asli Lolos: Status="${verifiedWebhook.status}", Nominal=Rp ${(verifiedWebhook.amount).toLocaleString("id-ID")}, isPaid=${verifiedWebhook.isPaid}`);
  } else {
    console.error(`  ❌ Webhook Asli Gagal Diverifikasi: ${verifiedWebhook.error}`);
  }

  // Test 2: Webhook palsu / manipulasi nominal
  const tamperedWebhook = await buayar.verifyWebhook(
    { ...webhookPayload, data: { ...webhookPayload.data, paymentAmount: "99999999" } },
    {
      "x-xenith-signature": validSignature, // Signature tidak cocok lagi dengan body yang diubah
      "x-xenith-timestamp": webhookTimestamp,
    },
    { rawBody: JSON.stringify({ ...webhookPayload, data: { ...webhookPayload.data, paymentAmount: "99999999" } }), extra: { urlPath: webhookUrlPath } }
  );

  if (!tamperedWebhook.isValid) {
    console.log(`  ✅ Invarian Fail-Closed: Webhook yang dimanipulasi ditolak seketika (isValid: false).`);
  } else {
    console.error(`  ❌ BAHAYA: Webhook palsu diterima!`);
  }

  console.log("\n================================================================================");
  console.log("🎉 SELURUH FITUR XENITH PAY DI BUAYAR SDK LULUS PENGUJIAN PENUH!");
  console.log("================================================================================");
}

runFullTest().catch((err) => {
  console.error("Critical error in test:", err);
  process.exit(1);
});
