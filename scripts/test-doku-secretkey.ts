import { Buayar } from "../src";

const CLIENT_ID = "BRN-0268-1789326133127";
const SECRET_KEY = "SK-HjhGYlaRK3bFBNtWK7ij";

async function main() {
  console.log("==================================================================");
  console.log("🚀 PENGUJIAN REAL API DOKU SANDBOX DENGAN SECRET KEY RESMI");
  console.log("Client-Id  :", CLIENT_ID);
  console.log("Secret-Key :", SECRET_KEY);
  console.log("==================================================================\n");

  const buayar = new Buayar({
    provider: "doku",
    merchantCode: CLIENT_ID,
    secretKey: SECRET_KEY,
    sandbox: true,
  });

  const testChannels = [
    { name: "BCA Virtual Account", method: "BCA_VA" },
    { name: "Mandiri Virtual Account", method: "MANDIRI_VA" },
    { name: "BNI Virtual Account", method: "BNI_VA" },
    { name: "BRI Virtual Account", method: "BRI_VA" },
    { name: "CIMB Niaga Virtual Account", method: "CIMB_VA" },
  ];

  for (const ch of testChannels) {
    const orderId = `INV-${ch.method.replace("_VA", "")}-${Date.now()}`;
    process.stdout.write(`• Menguji ${ch.name} (${orderId})... `);
    try {
      const res = await buayar.createInvoice({
        orderId,
        amount: 50000,
        paymentMethod: ch.method as any,
        productDetails: `Test ${ch.name}`,
        customer: {
          name: "Rasyiqi Buayar User",
          email: "user@crediblemark.com",
        },
      });

      if (res.success && res.vaNumber) {
        console.log(`✅ BERHASIL!`);
        console.log(`  └─ VA Number   : ${res.vaNumber}`);
        console.log(`  └─ Payment URL : ${res.paymentUrl}`);
      } else {
        console.log(`❌ Gagal:`, res.error || JSON.stringify(res.rawResponse));
      }
    } catch (err: any) {
      console.log(`❌ Error:`, err.message);
    }
  }

  // Uji Jokul Hosted Checkout Link (Dengan Phone)
  const checkoutId1 = `INV-CHK-PHONE-${Date.now()}`;
  process.stdout.write(`\n• Menguji Jokul Hosted Checkout (dengan no telepon)... `);
  try {
    const res1 = await buayar.createInvoice({
      orderId: checkoutId1,
      amount: 75000,
      productDetails: "Produk Langganan Bisnis",
      customer: {
        name: "Rasyiqi Buayar User",
        email: "user@crediblemark.com",
        phone: "081234567890",
      },
      returnUrl: "https://mybusiness.com/payment/finish",
    });
    if (res1.success && res1.paymentUrl) {
      console.log(`✅ BERHASIL!`);
      console.log(`  └─ Checkout URL: ${res1.paymentUrl}`);
    } else {
      console.log(`❌ Gagal:`, res1.error);
    }
  } catch (err: any) {
    console.log(`❌ Error:`, err.message);
  }

  // Uji Jokul Hosted Checkout Link (Tanpa Phone - harus tetap jalan)
  const checkoutId2 = `INV-CHK-NOPHONE-${Date.now()}`;
  process.stdout.write(`• Menguji Jokul Hosted Checkout (tanpa no telepon)... `);
  try {
    const res2 = await buayar.createInvoice({
      orderId: checkoutId2,
      amount: 100000,
      productDetails: "Produk Tanpa No Telepon",
      customer: {
        name: "Rasyiqi Buayar User",
        email: "user@crediblemark.com",
      },
      returnUrl: "https://mybusiness.com/payment/finish",
    });
    if (res2.success && res2.paymentUrl) {
      console.log(`✅ BERHASIL!`);
      console.log(`  └─ Checkout URL: ${res2.paymentUrl}`);
    } else {
      console.log(`❌ Gagal:`, res2.error);
    }
  } catch (err: any) {
    console.log(`❌ Error:`, err.message);
  }

  console.log("\n==================================================================");
  console.log("🏁 PENGUJIAN SELESAI");
  console.log("==================================================================");
}

main().catch(console.error);
