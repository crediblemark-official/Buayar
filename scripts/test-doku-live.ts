/**
 * Real API Test terhadap DOKU Sandbox menggunakan kredensial aktif:
 * Client-Id: BRN-0268-1789326133127
 * API Key: doku_key_sandbox_8d5a11d98a0a468b83a58df9dd93ccc8
 */

const CLIENT_ID = process.env.DOKU_CLIENT_ID || "BRN-0268-1789326133127";
const API_KEY = process.env.DOKU_API_KEY || "doku_key_sandbox_8d5a11d98a0a468b83a58df9dd93ccc8";
const MCP_URL = process.env.DOKU_MCP_URL || "https://api-sandbox.doku.com/doku-mcp-server/mcp";

async function callDoku(method: string, params: any = {}) {
  const authHeader = "Basic " + Buffer.from(API_KEY + ":").toString("base64");
  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Client-Id": CLIENT_ID,
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const json: any = await res.json();
  if (json.error) {
    throw new Error(`RPC Error: ${JSON.stringify(json.error)}`);
  }

  if (json.result?.content?.[0]?.text) {
    try {
      return JSON.parse(json.result.content[0].text);
    } catch {
      return json.result.content[0].text;
    }
  }

  return json.result;
}

async function run() {
  console.log("================================================================================");
  console.log("🚀 PENGUJIAN REAL API DOKU SANDBOX");
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`API Key  : ${API_KEY.slice(0, 15)}...${API_KEY.slice(-8)}`);
  console.log("================================================================================\n");

  // 1. Handshake / Initialize
  console.log("1️⃣  Menguji Handshake MCP Server...");
  const init = await callDoku("initialize", {});
  console.log(`   ✅ Terhubung: ${init.serverInfo?.name} v${init.serverInfo?.version}`);
  console.log(`   Protocol: ${init.protocolVersion}\n`);

  // 2. Query Payment Methods
  console.log("2️⃣  Mengambil Metode Pembayaran Aktif...");
  const methods = await callDoku("tools/call", {
    name: "get_merchant_payment_methods",
    arguments: {},
  });
  console.log(`   ✅ Total Channel Aktif : ${methods.totalChannels}`);
  console.log(`   ✅ Total Kategori       : ${methods.totalCategories}`);
  console.log(`   Kategori: ${Object.keys(methods.categories || {}).join(", ")}\n`);

  // 3. Generate Virtual Account (BCA)
  const invoiceVa = `INV-VA-${Date.now()}`;
  console.log(`3️⃣  Membuat Virtual Account BCA (${invoiceVa})...`);
  const va = await callDoku("tools/call", {
    name: "create_virtual_account_payment",
    arguments: {
      toolRequest: {
        channel: "VIRTUAL_ACCOUNT_BCA",
        virtualAccountName: "Rasyiqi Buayar Test",
        amount: "50000.00",
        trxId: invoiceVa,
      },
    },
  });
  const vaNo = va.virtualAccountData?.virtualAccountNo?.trim();
  console.log(`   ✅ VA Berhasil Dibuat!`);
  console.log(`   Nomor VA   : ${vaNo}`);
  console.log(`   Nominal    : Rp ${va.virtualAccountData?.totalAmount?.value}`);
  console.log(`   Expired At : ${va.virtualAccountData?.expiredDate}`);
  console.log(`   Panduan    : ${va.virtualAccountData?.additionalInfo?.howToPayPage}\n`);

  // 4. Update Virtual Account (Ubah Nominal)
  console.log(`4️⃣  Mengupdate Virtual Account (${invoiceVa})...`);
  const updateVa = await callDoku("tools/call", {
    name: "update_virtual_account_payment",
    arguments: {
      toolRequest: {
        channel: "VIRTUAL_ACCOUNT_BCA",
        virtualAccountNo: vaNo,
        virtualAccountName: "Rasyiqi Buayar Test Updated",
        totalAmount: "85000",
        trxId: invoiceVa,
      },
    },
  });
  console.log(`   ✅ VA Berhasil Diupdate!`);
  console.log(`   Nominal Baru : Rp ${updateVa.virtualAccountData?.totalAmount?.value}\n`);

  // 5. Cek Status Transaksi
  console.log(`5️⃣  Mengecek Status Transaksi (${invoiceVa})...`);
  const txStatus = await callDoku("tools/call", {
    name: "get_transaction_by_invoice_number",
    arguments: {
      toolRequest: { invoiceNumber: invoiceVa },
    },
  });
  const tx = txStatus.message?.[0];
  console.log(`   ✅ Status Ditemukan : ${tx?.status} (${tx?.state})`);
  console.log(`   Channel          : ${tx?.channel}`);
  console.log(`   Merchant / Client: ${tx?.client_name}\n`);

  // 6. Delete Virtual Account
  console.log(`6️⃣  Menghapus / Membatalkan Virtual Account (${invoiceVa})...`);
  const delVa = await callDoku("tools/call", {
    name: "delete_virtual_account_payment",
    arguments: {
      toolRequest: {
        channel: "VIRTUAL_ACCOUNT_BCA",
        virtualAccountNo: vaNo,
        trxId: invoiceVa,
      },
    },
  });
  console.log(`   ✅ VA Berhasil Dihapus: responseCode ${delVa.responseCode} (${delVa.responseMessage})\n`);

  // 7. Hosted Checkout Link
  const invoiceChk = `INV-CHK-${Date.now()}`;
  console.log(`7️⃣  Membuat DOKU Hosted Checkout Link (${invoiceChk})...`);
  const chk = await callDoku("tools/call", {
    name: "create_doku_direct_checkout",
    arguments: {
      toolRequest: {
        amount: "125000",
        invoiceNumber: invoiceChk,
        customerName: "Rasyiqi",
        customerEmail: "rasyiqi@example.com",
      },
    },
  });
  console.log(`   ✅ Checkout Link Berhasil Dibuat!`);
  console.log(`   URL Pembayaran : ${chk.response?.payment?.url}`);
  console.log(`   Metode Tersedia: ${chk.response?.payment?.payment_method_types?.length} metode aktif\n`);

  // 8. E-Wallet DANA Payment
  const invoiceDana = `INV-DANA-${Date.now()}`;
  console.log(`8️⃣  Membuat Transaksi E-Wallet DANA (${invoiceDana})...`);
  const dana = await callDoku("tools/call", {
    name: "create_dana_payment",
    arguments: {
      toolRequest: {
        amount: 35000,
        invoiceNumber: invoiceDana,
      },
    },
  });
  console.log(`   ✅ DANA Payment Berhasil Dibuat!`);
  console.log(`   Redirect URL   : ${dana.webRedirectUrl?.slice(0, 60)}...\n`);

  console.log("================================================================================");
  console.log("🎉 SEMUA PENGUJIAN REAL API DOKU SUKSES 100%!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("❌ Test Gagal:", err);
  process.exit(1);
});
