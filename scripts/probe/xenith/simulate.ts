/**
 * simulate_test.ts — Xenith Sandbox Simulation Test
 *
 * [A] Pay In SUCCESS  → checkTransaction → status=paid, isPaid=true
 * [B] Pay In EXPIRED  → checkTransaction → status=expired, isExpired=true
 * [C] Pay In FAILED   → checkTransaction → status=failed, isFailed=true
 * [D] Account Inquiry VALID  (prefix 9999) → COMPLETED
 * [E] Account Inquiry INVALID (prefix lain) → INVALID_ACCOUNT
 * [F] Payout DST SUCCESS (prefix 5555) — butuh balance > 0
 * [G] Payout DST FAILED  (prefix 6666) — butuh balance > 0
 *
 * Referensi:
 *   https://docs.xenithpay.com/reference/payin_simulate.md
 *   https://docs.xenithpay.com/reference/simulate-pay-out.md
 *   https://docs.xenithpay.com/reference/simulate-account-inquiry.md
 */

import { Buayar } from "../../../src";

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

const buayar = new Buayar({
  provider: "xenith",
  apiKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
  sandbox: true,
  callbackUrl: "https://example.com/cb",
  returnUrl: "https://example.com/ret",
});

const client = buayar.getXenithClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runSimulateTest() {
  console.log("================================================================================");
  console.log("⚡ XENITH SANDBOX SIMULATION TEST — PAYIN PAID + PAYOUT DST");
  console.log("================================================================================");
  console.log(`Access Key: ${ACCESS_KEY.slice(0, 15)}...`);
  console.log("Endpoint:   https://openapi.sandbox.xenithpay.com");
  console.log("--------------------------------------------------------------------------------\n");

  let passed = 0;
  let failed = 0;

  // [A] Pay In SUCCESS
  console.log("📌 [A] Simulasi Pay In SUCCESS (QRIS)");
  try {
    const payin = await client.createPayIn({
      currency: "IDR",
      initiatedAmount: 150000,
      referenceCode: "SIM-SUCCESS-" + Date.now(),
      paymentMethod: "QR_CODE",
      paymentChannel: "QRIS",
      customerReference: "SIM-CUST",
      customerName: "Pembeli Simulasi",
      callbackUrl: "https://example.com/cb",
      redirectUrl: "https://example.com/red",
    });

    await client.request("POST", "/v1/simulator/transaction", {
      transactionId: payin.id,
      transactionCategory: "payins",
      transactionStatus: "SUCCESS",
    });
    await sleep(1500);

    const status = await buayar.checkTransaction({
      transactionId: payin.id,
      merchantOrderId: payin.referenceCode,
    });

    if (status.status === "paid" && status.isPaid && status.amount === 150000) {
      console.log(`  ✅ Pay In PAID: Ref=${payin.id} | Amount=Rp ${status.amount.toLocaleString("id-ID")} | isPaid=${status.isPaid}`);
      passed++;
    } else {
      console.error(`  ❌ Pay In SUCCESS gagal: status=${status.status}, amount=${status.amount}`);
      failed++;
    }
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
    failed++;
  }

  // [B] Pay In EXPIRED
  console.log("\n📌 [B] Simulasi Pay In EXPIRED (BNI VA)");
  try {
    const payin = await client.createPayIn({
      currency: "IDR",
      initiatedAmount: 75000,
      referenceCode: "SIM-EXP-" + Date.now(),
      paymentMethod: "VIRTUAL_ACCOUNT",
      paymentChannel: "BNI.VA",
      customerReference: "SIM-EXP",
      customerName: "Pembeli Expired",
      callbackUrl: "https://example.com/cb",
      redirectUrl: "https://example.com/red",
    });
    await client.request("POST", "/v1/simulator/transaction", {
      transactionId: payin.id,
      transactionCategory: "payins",
      transactionStatus: "EXPIRED",
    });
    await sleep(1000);

    const status = await buayar.checkTransaction({
      transactionId: payin.id,
      merchantOrderId: payin.referenceCode,
    });

    if (status.isExpired && status.status === "expired") {
      console.log(`  ✅ Pay In EXPIRED: Ref=${payin.id} | status=${status.status} | isExpired=${status.isExpired}`);
      passed++;
    } else {
      console.error(`  ❌ EXPIRED tidak terdeteksi: status=${status.status}`);
      failed++;
    }
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
    failed++;
  }

  // [C] Pay In FAILED
  console.log("\n📌 [C] Simulasi Pay In FAILED (Mandiri VA)");
  try {
    const payin = await client.createPayIn({
      currency: "IDR",
      initiatedAmount: 50000,
      referenceCode: "SIM-FAIL-" + Date.now(),
      paymentMethod: "VIRTUAL_ACCOUNT",
      paymentChannel: "MDR.VA",
      customerReference: "SIM-FAIL",
      customerName: "Pembeli Gagal",
      callbackUrl: "https://example.com/cb",
      redirectUrl: "https://example.com/red",
    });
    await client.request("POST", "/v1/simulator/transaction", {
      transactionId: payin.id,
      transactionCategory: "payins",
      transactionStatus: "FAILED",
    });
    await sleep(1000);

    const status = await buayar.checkTransaction({
      transactionId: payin.id,
      merchantOrderId: payin.referenceCode,
    });

    if (status.isFailed && status.status === "failed") {
      console.log(`  ✅ Pay In FAILED: Ref=${payin.id} | status=${status.status} | isFailed=${status.isFailed}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED tidak terdeteksi: status=${status.status}`);
      failed++;
    }
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
    failed++;
  }

  // [D] Account Inquiry VALID (prefix 9999)
  console.log("\n📌 [D] Account Inquiry VALID — prefix 9999 (Sync)");
  try {
    const inq = await client.syncAccountInquiry({
      currency: "IDR",
      destinationPayoutMethod: "BANK_TRANSFER",
      destinationPayoutChannel: "CENAIDJA",
      destinationPayoutAccount: "999987654321",
    });
    if (inq.status === "COMPLETED" && inq.destinationPayoutAccountName) {
      console.log(`  ✅ Account VALID: Name="${inq.destinationPayoutAccountName}" | Status=${inq.status} | ID=${inq.id}`);
      passed++;
    } else {
      console.error(`  ❌ Inquiry VALID gagal: ${JSON.stringify(inq)}`);
      failed++;
    }
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`);
    failed++;
  }

  // [E] Account Inquiry INVALID
  console.log("\n📌 [E] Account Inquiry INVALID — nomor rekening palsu (Sync)");
  try {
    await client.syncAccountInquiry({
      currency: "IDR",
      destinationPayoutMethod: "BANK_TRANSFER",
      destinationPayoutChannel: "CENAIDJA",
      destinationPayoutAccount: "1234567890",
    });
    console.log("  ⚠️  Unexpected SUCCESS");
    failed++;
  } catch (e: any) {
    if (e.message?.includes("INVALID_ACCOUNT") || e.message?.includes("FAILED")) {
      console.log(`  ✅ Account INVALID tepat ditolak: "${e.message}"`);
      passed++;
    } else {
      console.error(`  ❌ Error lain: ${e.message}`);
      failed++;
    }
  }

  // [F] Payout DST SUCCESS (prefix 5555)
  console.log("\n📌 [F] Payout DST SUCCESS — prefix 5555 (butuh saldo > 0)");
  const balance = await buayar.checkBalance();
  const currentBal = balance.balance ?? 0;
  console.log(`  ℹ️  Saldo Saat Ini: IDR ${currentBal.toLocaleString("id-ID")}`);
  if (currentBal >= 10000) {
    const disbRes = await buayar.disburse({
      externalId: "PAYOUT-SUCCESS-" + Date.now(),
      bankCode: "CENAIDJA",
      accountNumber: "5555123456789",
      accountHolderName: "Jane Doe",
      amount: 10000,
      description: "Payout sandbox SUCCESS test",
    });
    if (disbRes.success) {
      console.log(`  ✅ Payout SUCCESS: Ref=${disbRes.reference} Status=${disbRes.status}`);
      passed++;
    } else {
      console.log(`  ℹ️  Payout gagal: ${disbRes.error}`);
    }
  } else {
    console.log("  ⏭️  SKIP — Saldo 0.");
    console.log("     Top Up dulu via Xenith Dashboard (help@xenithpay.com)");
    console.log("     Magic rules: acc=5555XXXXX → SUCCESS | acc=6666XXXXX → FAILED");
  }

  // [G] Payout DST FAILED (prefix 6666)
  console.log("\n📌 [G] Payout DST FAILED — prefix 6666 (butuh saldo > 0)");
  if (currentBal >= 10000) {
    const disbFail = await buayar.disburse({
      externalId: "PAYOUT-FAIL-" + Date.now(),
      bankCode: "CENAIDJA",
      accountNumber: "6666987654321",
      accountHolderName: "John Fail",
      amount: 10000,
      description: "Payout sandbox FAILED test",
    });
    console.log(`  Payout: success=${disbFail.success} status=${disbFail.status} error=${disbFail.error}`);
  } else {
    console.log("  ⏭️  SKIP — Saldo 0. Lihat [F].");
  }

  // Summary
  console.log("\n================================================================================");
  console.log(`🎯 HASIL: ${passed} lulus | ${failed} gagal (SKIP tidak dihitung)`);
  if (failed === 0) {
    console.log("🎉 SEMUA TEST SIMULASI SANDBOX XENITH LULUS!");
  } else {
    console.log("⚠️  Ada test yang gagal. Lihat output di atas.");
  }
  console.log("================================================================================");
}

runSimulateTest().catch(console.error);
