// Template files scaffolded by `buayar init`.
// Defined as string constants so they bundle into the published CLI
// without needing runtime asset resolution.

export interface TemplateFiles {
  [path: string]: string;
}

export const DOT_ENV_TEMPLATE = `# ── @crediblemark/buayar · Konfigurasi ─────────────────────────────
# Provider aktif (salah satu dari 19): midtrans, duitku, ipaymu, xendit, doku,
# prismalink, faspay, finpay, nicepay, oy, stripe, paypal, adyen, checkoutcom,
# razorpay, square, payu, braintree, twocheckout
PROVIDER_PG=midtrans

# Kredensial Universal (dipetakan otomatis per provider)
BUAYAR_API_KEY=your-server-key-atau-secret
BUAYAR_MERCHANT_CODE=merchant-id-atau-username
BUAYAR_SANDBOX=true

# Callback & Return URL
BUAYAR_CALLBACK_URL=http://localhost:3000/api/payment/webhook
BUAYAR_RETURN_URL=http://localhost:3000/payment/success

# ── Kredensial Spesifik Provider (isi sesuai yang aktif saja) ───────────────
# MIDTRANS_SERVER_KEY=
# MIDTRANS_CLIENT_KEY=
# DUITKU_API_KEY=
# DUITKU_MERCHANT_CODE=
# IPAYMU_API_KEY=
# IPAYMU_VA=
# XENDIT_SECRET_KEY=
# XENDIT_WEBHOOK_TOKEN=
# DOKU_CLIENT_ID=
# DOKU_SECRET_KEY=
# PRISMALINK_MERCHANT_ID=
# PRISMALINK_SECRET_KEY=
# FASPAY_MERCHANT_ID=
# FASPAY_USER_ID=
# FASPAY_PASSWORD=
# FINPAY_MERCHANT_ID=
# FINPAY_MERCHANT_KEY=
# NICEPAY_IMID=
# NICEPAY_KEY=
# OY_USERNAME=
# OY_API_KEY=
# STRIPE_SECRET_KEY=
# STRIPE_PUBLIC_KEY=
# STRIPE_WEBHOOK_SECRET=
# PAYPAL_CLIENT_ID=
# PAYPAL_CLIENT_SECRET=
# PAYPAL_WEBHOOK_ID=
# ADYEN_API_KEY=
# ADYEN_MERCHANT_ACCOUNT=
# ADYEN_HMAC_KEY=
# CHECKOUTCOM_SECRET_KEY=
# CHECKOUTCOM_WEBHOOK_SECRET=
# RAZORPAY_KEY_ID=
# RAZORPAY_KEY_SECRET=
# RAZORPAY_WEBHOOK_SECRET=
# SQUARE_ACCESS_TOKEN=
# SQUARE_LOCATION_ID=
# PAYU_POS_ID=
# PAYU_MD5_KEY=
# BRAINTREE_MERCHANT_ID=
# BRAINTREE_PUBLIC_KEY=
# BRAINTREE_PRIVATE_KEY=
# TWOCHECKOUT_MERCHANT_CODE=
# TWOCHECKOUT_SECRET_KEY=
# TWOCHECKOUT_SECRET_WORD=
`;

export const CONFIG_TEMPLATE = `// src/payment/buayar.ts
// Inisialisasi Buayar — baca otomatis dari process.env (.env)
import { buayar } from "@crediblemark/buayar";

export { buayar };

// Bila perlu inisialisasi programatik (menggantikan .env):
// export const buayar = new Buayar({
//   provider: "midtrans",
//   apiKey: "SB-Mid-server-xxxx",
//   sandbox: true,
// });
`;

export const SERVICE_TEMPLATE = `// src/payment/service.ts
// Service layer — satu-satunya tempat aplikasi berinteraksi dengan Buayar.
// Ganti provider cukup dengan ubah .env; kode ini tidak berubah.
import { buayar } from "./buayar";

export interface PaymentService {
  createCheckout(input: {
    orderId: string;
    amount: number;
    productDetails: string;
    customer: { name: string; email: string; phone?: string };
    paymentMethod?: string;
    currency?: string;
  }): Promise<any>;
  getMethods(amount?: number): Promise<any>;
  checkStatus(orderId: string): Promise<any>;
  handleWebhook(payload: any, headers: Record<string, string | string[] | undefined>): Promise<any>;
  refund(transactionId: string, amount?: number, reason?: string): Promise<any>;
  checkBalance(): Promise<any>;
  disburse(payload: {
    externalId: string;
    bankCode: string;
    accountNumber: string;
    amount: number;
    accountHolderName?: string;
    description?: string;
  }): Promise<any>;
}

export const paymentService: PaymentService = {
  async createCheckout({ orderId, amount, productDetails, customer, paymentMethod, currency }) {
    return buayar.createInvoice({
      orderId,
      amount,
      productDetails,
      customer,
      paymentMethod,
      currency,
    });
  },

  async getMethods(amount = 10000) {
    return buayar.getPaymentMethods({ amount });
  },

  async checkStatus(orderId) {
    return buayar.checkTransaction({ merchantOrderId: orderId });
  },

  async handleWebhook(payload, headers) {
    return buayar.verifyWebhook(payload, headers);
  },

  async refund(transactionId, amount, reason) {
    return buayar.refund({ transactionId, amount, reason });
  },

  async checkBalance() {
    return buayar.checkBalance();
  },

  async disburse({ externalId, bankCode, accountNumber, amount, accountHolderName, description }) {
    return buayar.disburse({
      externalId,
      bankCode,
      accountNumber,
      amount,
      accountHolderName,
      description,
    });
  },
};
`;

export const ROUTES_EXPRESS_TEMPLATE = `// src/payment/routes/express.ts
// Controller + route untuk Express. Mount via:
//   import { paymentRoutes } from "./payment/routes/express";
//   app.use("/api/payment", paymentRoutes);
import { Router } from "express";
import { paymentService } from "../service";

export const paymentRoutes = Router();

// POST /api/payment/checkout — buat transaksi (redirect / direct)
paymentRoutes.post("/checkout", async (req, res) => {
  const result = await paymentService.createCheckout(req.body);
  res.status(result.success ? 200 : 400).json(result);
});

// GET /api/payment/methods — daftar channel pembayaran
paymentRoutes.get("/methods", async (req, res) => {
  const amount = Number(req.query.amount) || 10000;
  const result = await paymentService.getMethods(amount);
  res.json(result);
});

// GET /api/payment/status/:orderId — cek status transaksi
paymentRoutes.get("/status/:orderId", async (req, res) => {
  const result = await paymentService.checkStatus(req.params.orderId);
  res.json(result);
});

// POST /api/payment/webhook — notifikasi dari payment gateway
paymentRoutes.post("/webhook", async (req, res) => {
  const verification = await paymentService.handleWebhook(req.body, req.headers as any);
  return verification.isValid
    ? res.status(200).json({ status: "OK" })
    : res.status(400).json({ error: "Invalid signature" });
});

// POST /api/payment/refund — refund transaksi
paymentRoutes.post("/refund", async (req, res) => {
  const { transactionId, amount, reason } = req.body;
  const result = await paymentService.refund(transactionId, amount, reason);
  res.json(result);
});

// GET /api/payment/balance — cek saldo merchant
paymentRoutes.get("/balance", async (_req, res) => {
  res.json(await paymentService.checkBalance());
});
`;

export const ROUTES_HONO_TEMPLATE = `// src/payment/routes/hono.ts
// Controller + route untuk Hono. Mount via:
//   app.route("/api/payment", paymentRoutes);
import { Hono } from "hono";
import { paymentService } from "../service";

export const paymentRoutes = new Hono();

paymentRoutes.post("/checkout", async (c) => {
  const body = await c.req.json();
  const result = await paymentService.createCheckout(body);
  return c.json(result, result.success ? 200 : 400);
});

paymentRoutes.get("/methods", async (c) => {
  const amount = Number(c.req.query("amount")) || 10000;
  return c.json(await paymentService.getMethods(amount));
});

paymentRoutes.get("/status/:orderId", async (c) => {
  return c.json(await paymentService.checkStatus(c.req.param("orderId")));
});

paymentRoutes.post("/webhook", async (c) => {
  const payload = await c.req.json();
  const headers = c.req.raw.headers;
  const verification = await paymentService.handleWebhook(payload, Object.fromEntries(headers) as any);
  return verification.isValid
    ? c.json({ status: "OK" }, 200)
    : c.json({ error: "Invalid signature" }, 400);
});

paymentRoutes.post("/refund", async (c) => {
  const { transactionId, amount, reason } = await c.req.json();
  return c.json(await paymentService.refund(transactionId, amount, reason));
});

paymentRoutes.get("/balance", async (c) => {
  return c.json(await paymentService.checkBalance());
});
`;

export const ROUTES_NEXTJS_TEMPLATE = `// src/app/api/payment/webhook/route.ts
// Route handler untuk Next.js App Router.
// Jalankan: npm run build && npm run start
import { NextResponse } from "next/server";
import { paymentService } from "@/payment/service";

export async function POST(request: Request) {
  const payload = await request.json();
  const headers: Record<string, string | string[] | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const verification = await paymentService.handleWebhook(payload, headers);

  return verification.isValid
    ? NextResponse.json({ status: "OK" })
    : NextResponse.json({ error: "Invalid signature" }, { status: 400 });
}
`;

export const README_PAYMENT_TEMPLATE = (framework: string, provider: string) => `# 💳 Payment — @crediblemark/buayar

Scaffold dibuat otomatis oleh \`buayar init\`.

- **Provider aktif:** \`${provider}\` (ganti di \`.env\` → \`PROVIDER_PG\`)
- **Framework route:** \`${framework}\`

## Struktur
\`\`\`
src/payment/
├── buayar.ts          # Inisialisasi Buayar (baca .env)
├── service.ts         # Service layer wrapper — semua interaksi lewat sini
└── routes/            # Controller/route per framework
\`\`\`

## Alur
1. Salin \`.env.example\` ke \`.env\` dan isi kredensial.
2. Mount route (lihat template framework di folder \`routes/\`).
3. Frontend: panggil \`POST /api/payment/checkout\` → terima \`paymentUrl\` (redirect) atau \`vaNumber\`/\`qrString\` (direct).
4. Notifikasi masuk ke \`POST /api/payment/webhook\` → diverifikasi otomatis.

## Ganti Provider
Ubah \`PROVIDER_PG\` + kredensial di \`.env\`. Kode \`service.ts\`/route **tidak berubah**.

> Dokumentasi lengkap: https://github.com/crediblemark-official/Buayar#readme
`;

export const TYPE_DECL_TEMPLATE = `// src/payment/types.ts
// Tipe-tipe hasil dari Buayar (dapat disesuaikan)
export interface CheckoutResult {
  success: boolean;
  provider?: string;
  orderId?: string;
  paymentUrl?: string;
  reference?: string;
  vaNumber?: string;
  qrString?: string;
  paymentCode?: string;
  deeplink?: string;
  error?: string;
}

export interface WebhookVerification {
  isValid: boolean;
  provider?: string;
  orderId: string;
  amount: number;
  isPaid: boolean;
  status: "paid" | "pending" | "failed" | "expired";
}
`;

export const PROVIDERS = [
  "midtrans", "duitku", "ipaymu", "xendit", "doku", "prismalink", "faspay",
  "finpay", "nicepay", "oy", "stripe", "paypal", "adyen", "checkoutcom",
  "razorpay", "square", "payu", "braintree", "twocheckout",
] as const;

export const FRAMEWORKS = ["express", "hono", "nextjs"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export function getRouteTemplate(framework: string): string {
  switch (framework) {
    case "hono":
      return ROUTES_HONO_TEMPLATE;
    case "nextjs":
      return ROUTES_NEXTJS_TEMPLATE;
    case "express":
    default:
      return ROUTES_EXPRESS_TEMPLATE;
  }
}

export function buildScaffold(
  provider: string,
  framework: Framework
): TemplateFiles {
  const routeRel = framework === "nextjs"
    ? "src/app/api/payment/webhook/route.ts"
    : "src/payment/routes/index.ts";

  return {
    ".env.example": DOT_ENV_TEMPLATE,
    "src/payment/buayar.ts": CONFIG_TEMPLATE,
    "src/payment/service.ts": SERVICE_TEMPLATE,
    "src/payment/types.ts": TYPE_DECL_TEMPLATE,
    [routeRel]: getRouteTemplate(framework),
    "README-PAYMENT.md": README_PAYMENT_TEMPLATE(framework, provider),
  };
}
