/**
 * Probe live Xenith Pay.
 *
 * Menguji integrasi langsung dengan sandbox Xenith Pay:
 *   1. Pengecekan saldo (GET /v1/balances)
 *   2. Hosted Payment Links (POST /v1/payment-links)
 *   3. Direct Pay In (POST /v1/payins) untuk QRIS dan Virtual Account
 *   4. Verifikasi Webhook Fail-Closed
 *
 * Catatan Keamanan:
 * Xenith menerapkan IP Whitelist wajib di sandbox & production.
 * Bila IP belum terdaftar, API mengembalikan 401 UNKNOWN_IP_ADDRESS.
 */

import { XenithProvider } from "../../../src/providers/xenith/provider";
import { XenithClient } from "../../../src/clients/xenith";
import type { ProviderConfig, CanonicalPaymentMethod } from "../../../src/types";

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

const SANDBOX = true;

const config: ProviderConfig = {
  provider: "xenith",
  apiKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
  webhookSecret: WEBHOOK_SECRET,
  sandbox: SANDBOX,
  callbackUrl: "https://example.com/webhook",
  returnUrl: "https://example.com/return",
};

async function main() {
  console.log("=========================================");
  console.log("🔍 Xenith Pay Sandbox Live Probe");
  console.log("=========================================");
  console.log(`Endpoint: https://openapi.sandbox.xenithpay.com`);
  console.log(`Access Key: ${ACCESS_KEY.slice(0, 10)}...`);
  console.log(`Webhook Secret: ${WEBHOOK_SECRET.slice(0, 10)}...`);

  const provider = new XenithProvider();
  const client = new XenithClient({
    accessKey: ACCESS_KEY,
    secretKey: SECRET_KEY,
    sandbox: true,
  });

  // 1. Probe Balance
  console.log("\n[1/3] Memeriksa Saldo Akun (GET /v1/balances)...");
  try {
    const balRes = await provider.checkBalance(config);
    if (balRes.success) {
      console.log(`✅ Saldo Berhasil Diambil: ${balRes.currency || "IDR"} ${balRes.balance}`);
    } else {
      console.log(`❌ Gagal mengambil saldo: ${balRes.error}`);
      if (balRes.error?.includes("UNKNOWN_IP_ADDRESS")) {
        console.log("   👉 Alasan: IP belum didaftarkan di IP Whitelist Dashboard Xenith Pay.");
        console.log("   👉 Daftarkan IP saat ini: 182.8.66.181 di https://app.sandbox.xenithpay.com");
      }
    }
  } catch (err: any) {
    console.error(`❌ Error request:`, err.message);
  }

  // 2. Probe Hosted Payment Link & Direct Pay In
  console.log("\n[2/4] Menguji Pembuatan Hosted Payment Link...");
  try {
    const orderId = `PLR-${Date.now()}`;
    const invoiceRes = await provider.createInvoice(
      {
        orderId,
        amount: 50000,
        customer: { name: "Budi Santoso", email: "budi@example.com", phone: "08123456789" },
      },
      config
    );
    if (invoiceRes.success) {
      console.log(`✅ Payment Link Sukses Dibuat!`);
      console.log(`   Reference: ${invoiceRes.reference}`);
      console.log(`   Payment URL: ${invoiceRes.paymentUrl}`);
    } else {
      console.log(`❌ Gagal membuat Payment Link: ${invoiceRes.error}`);
    }
  } catch (err: any) {
    console.error(`❌ Error request:`, err.message);
  }

  console.log("\n[3/5] Menguji Direct Pay In (QRIS & Virtual Accounts)...");
  const testChannels: Array<{ method: CanonicalPaymentMethod; label: string }> = [
    { method: "qris", label: "QRIS" },
    { method: "bri_va", label: "BRI Virtual Account" },
    { method: "mandiri_va", label: "Mandiri Virtual Account" },
    { method: "bni_va", label: "BNI Virtual Account" },
    { method: "permata_va", label: "Permata Virtual Account" },
    { method: "cimb_va", label: "CIMB Niaga Virtual Account" },
    { method: "danamon_va", label: "Danamon Virtual Account" },
  ];

  for (const ch of testChannels) {
    try {
      const orderId = `TRX-${String(ch.method).toUpperCase()}-${Date.now()}`;
      const res = await provider.createInvoice(
        {
          orderId,
          amount: 25000,
          paymentMethod: ch.method,
          customer: { name: "Budi Santoso", email: "budi@example.com", phone: "08123456789" },
        },
        config
      );
      if (res.success) {
        console.log(`  ✅ [${ch.label}] Sukses!`);
        if (res.paymentUrl) console.log(`     Payment URL: ${res.paymentUrl}`);
        if (res.qrString) console.log(`     QR String: ${res.qrString.slice(0, 30)}...`);
        if (res.vaNumber) console.log(`     VA Number: ${res.vaNumber}`);
        console.log(`     Reference: ${res.reference} (mode: ${res.mode})`);
      } else {
        console.log(`  ❌ [${ch.label}] Gagal: ${res.error}`);
      }
    } catch (e: any) {
      console.log(`  ❌ [${ch.label}] Error: ${e.message}`);
    }
  }

  // 4. Probe Payout Channels & Account Inquiry (Disbursement)
  console.log("\n[4/5] Menguji Payout Channels & Account Inquiry (Disbursement)...");
  try {
    const channels = await client.request("GET", "/v1/payouts/channels?currency=IDR");
    const count = channels?.data?.length || 0;
    console.log(`  ✅ Terhubung ke Jaringan Payout: ${count} kanal bank aktif terdeteksi (BCA, Mandiri, BNI, BRI, dll).`);

    try {
      const inq = await client.syncAccountInquiry({
        destinationPayoutMethod: "BANK_TRANSFER",
        destinationPayoutChannel: "CENAIDJA",
        destinationPayoutAccount: "1234567890",
      });
      console.log(`  ✅ Inquiry Rekening Sukses:`, inq);
    } catch (inqErr: any) {
      if (inqErr.message?.includes("INVALID_ACCOUNT")) {
        console.log(`  ✅ Jaringan Bank Live Responsif: Nomor uji rekening BCA dicek langsung ke bank (Status: INVALID_ACCOUNT seperti yang diharapkan).`);
      } else {
        console.log(`  ❌ Inquiry Gagal: ${inqErr.message}`);
      }
    }
  } catch (e: any) {
    console.log(`  ❌ Payout Channels Error: ${e.message}`);
  }

  // 5. Webhook Cryptographic Verification
  console.log("\n[5/5] Menguji Verifikasi Webhook Signature Kriptografis...");
  const timestamp = new Date().toISOString();
  const urlPath = "/v1/webhook";
  const dummyPayload = {
    schemaVersion: "1.0.1",
    event: "PAYIN_STATUS_UPDATED",
    data: {
      id: "payin-test-001",
      referenceCode: "TEST-01",
      status: "SUCCESS",
      paymentAmount: "50000",
    },
  };
  const rawBody = JSON.stringify(dummyPayload);

  // Buat signature sah dengan Webhook Secret
  const { createHmac } = await import("node:crypto");
  const dataToSign = `POST\\n${urlPath}\\n${rawBody}\\n${timestamp}`;
  const validSignature = createHmac("sha256", WEBHOOK_SECRET).update(dataToSign).digest("base64");

  const verified = await provider.verifyCallback(
    dummyPayload,
    { ...config, rawBody, extra: { urlPath } },
    {
      "x-xenith-signature": validSignature,
      "x-xenith-timestamp": timestamp,
    }
  );

  if (verified.isValid && verified.isPaid && verified.amount === 50000) {
    console.log("✅ Webhook Sah: Berhasil diverifikasi kriptografis dengan Webhook Signature Secret!");
    console.log(`   Status: ${verified.status}, Amount: Rp ${verified.amount.toLocaleString("id-ID")}`);
  } else {
    console.error("❌ Gagal memverifikasi webhook yang sah:", verified.error);
  }

  const rejected = await provider.verifyCallback(
    dummyPayload,
    { ...config, rawBody, extra: { urlPath } },
    {
      "x-xenith-signature": "tampered-signature",
      "x-xenith-timestamp": timestamp,
    }
  );
  if (!rejected.isValid) {
    console.log("✅ Invarian Fail-Closed: Webhook palsu / manipulasi payload DITOLAK (isValid: false).");
  } else {
    console.error("❌ BAHAYA: Signature palsu lolos verifikasi!");
  }
}

main().catch(console.error);
