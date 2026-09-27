import { BuayarConfig } from "../types";
import { providerRegistry } from "./providerRegistry";

/**
 * Skema pemetaan env → field konfigurasi, deklaratif per provider.
 * Field: apiKey | clientKey | merchantCode | merchantId | secretKey | serverKey
 * Untuk setiap provider kita daftarkan urutan prioritas env var.
 * `BUAYAR_*` (universal) selalu didukung untuk SEMUA provider — itulah inti "simple".
 */
interface FieldMap {
  apiKey?: string[];
  clientKey?: string[];
  merchantCode?: string[];
  merchantId?: string[];
  secretKey?: string[];
  serverKey?: string[];
  projectId?: string[];
}

// Variabel universal yang berlaku untuk semua provider.
// BUAYAR_* adalah standar baru; PG_* dan PAYMENT_* dipertahankan sebagai legacy.
const UNIVERSAL = {
  apiKey: ["BUAYAR_API_KEY", "BUAYAR_SERVER_KEY", "PG_API_KEY", "PAYMENT_API_KEY"],
  clientKey: ["BUAYAR_CLIENT_KEY", "PG_CLIENT_KEY"],
  merchantCode: ["BUAYAR_MERCHANT_CODE", "PG_MERCHANT_CODE", "PAYMENT_MERCHANT_CODE"],
  merchantId: ["BUAYAR_MERCHANT_ID", "PG_MERCHANT_ID"],
  secretKey: ["BUAYAR_SECRET_KEY", "PG_SECRET_KEY", "SECRET_KEY"],
  serverKey: ["BUAYAR_SERVER_KEY", "PG_SECRET_KEY"],
  projectId: ["BUAYAR_PROJECT_ID", "PG_PROJECT_ID", "PROJECT_ID"],
};

// Pemetaan env spesifik per provider (legacy / disarankan kalau mau eksplisit).
// Prioritas: universal didahulukan, lalu spesifik sebagai fallback.
const SPECIFIC: Record<string, FieldMap> = {
  midtrans: {
    apiKey: ["MIDTRANS_SERVER_KEY"],
    clientKey: ["MIDTRANS_CLIENT_KEY"],
    merchantId: ["MIDTRANS_MERCHANT_ID"],
  },
  duitku: {
    apiKey: ["DUITKU_API_KEY"],
    merchantCode: ["DUITKU_MERCHANT_CODE"],
  },
  ipaymu: {
    apiKey: ["IPAYMU_API_KEY"],
    merchantCode: ["IPAYMU_VA", "IPAYMU_MERCHANT_CODE"],
  },
  xendit: {
    apiKey: ["XENDIT_SECRET_KEY", "XENDIT_API_KEY"],
  },
  doku: {
    apiKey: ["DOKU_SECRET_KEY", "DOKU_API_KEY"],
    clientKey: ["DOKU_CLIENT_ID"],
    merchantCode: ["DOKU_CLIENT_ID", "DOKU_MERCHANT_ID"],
    merchantId: ["DOKU_MERCHANT_ID"],
  },
  prismalink: {
    apiKey: ["PRISMALINK_SECRET_KEY", "PRISMALINK_API_KEY"],
    merchantCode: ["PRISMALINK_MERCHANT_ID"],
    merchantId: ["PRISMALINK_MERCHANT_ID"],
  },
  faspay: {
    apiKey: ["FASPAY_PASSWORD", "FASPAY_API_KEY"],
    clientKey: ["FASPAY_USER_ID"],
    merchantCode: ["FASPAY_MERCHANT_ID"],
    merchantId: ["FASPAY_MERCHANT_ID"],
  },
  finpay: {
    apiKey: ["FINPAY_MERCHANT_KEY", "FINPAY_SECRET_KEY", "FINPAY_API_KEY"],
    merchantCode: ["FINPAY_MERCHANT_ID"],
    merchantId: ["FINPAY_MERCHANT_ID"],
  },
  nicepay: {
    apiKey: ["NICEPAY_KEY", "NICEPAY_SECRET_KEY", "NICEPAY_API_KEY"],
    merchantCode: ["NICEPAY_IMID", "NICEPAY_MERCHANT_ID"],
    merchantId: ["NICEPAY_IMID"],
  },
  oy: {
    apiKey: ["OY_API_KEY"],
    clientKey: ["OY_USERNAME"],
    merchantCode: ["OY_USERNAME"],
  },
  stripe: {
    apiKey: ["STRIPE_SECRET_KEY", "STRIPE_KEY"],
    clientKey: ["STRIPE_PUBLIC_KEY", "STRIPE_PUBLISHABLE_KEY"],
  },
  paypal: {
    apiKey: ["PAYPAL_CLIENT_SECRET"],
    clientKey: ["PAYPAL_CLIENT_ID"],
    merchantCode: ["PAYPAL_CLIENT_ID"],
  },
  adyen: {
    apiKey: ["ADYEN_API_KEY"],
    clientKey: ["ADYEN_CLIENT_KEY"],
    merchantCode: ["ADYEN_MERCHANT_ACCOUNT"],
    merchantId: ["ADYEN_MERCHANT_ACCOUNT"],
  },
  checkoutcom: {
    apiKey: ["CHECKOUTCOM_SECRET_KEY"],
    clientKey: ["CHECKOUTCOM_PUBLIC_KEY"],
  },
  razorpay: {
    apiKey: ["RAZORPAY_KEY_SECRET"],
    clientKey: ["RAZORPAY_KEY_ID"],
    merchantCode: ["RAZORPAY_KEY_ID"],
  },
  square: {
    apiKey: ["SQUARE_ACCESS_TOKEN"],
    clientKey: ["SQUARE_APPLICATION_ID"],
    merchantCode: ["SQUARE_APPLICATION_ID"],
    projectId: ["SQUARE_LOCATION_ID"],
  },
  payu: {
    apiKey: ["PAYU_MD5_KEY"],
    clientKey: ["PAYU_POS_ID"],
    merchantCode: ["PAYU_POS_ID"],
    merchantId: ["PAYU_POS_ID"],
  },
  braintree: {
    apiKey: ["BRAINTREE_PRIVATE_KEY"],
    clientKey: ["BRAINTREE_PUBLIC_KEY"],
    merchantCode: ["BRAINTREE_MERCHANT_ID"],
    merchantId: ["BRAINTREE_MERCHANT_ID"],
  },
  twocheckout: {
    apiKey: ["TWOCHECKOUT_SECRET_KEY"],
    merchantCode: ["TWOCHECKOUT_MERCHANT_CODE"],
    merchantId: ["TWOCHECKOUT_MERCHANT_CODE"],
  },
  sumopod: {
    apiKey: ["SUMOPOD_API_KEY", "SUMOPOD_PRODUCTION_API_KEY", "SUMOPOD_SANDBOX_API_KEY"],
  },
  xenith: {
    apiKey: ["XENITH_ACCESS_KEY", "XENITH_API_KEY"],
    clientKey: ["XENITH_ACCESS_KEY"],
    secretKey: ["XENITH_SECRET_KEY"],
    serverKey: ["XENITH_SECRET_KEY"],
  },
};

type FieldName = keyof FieldMap;

/**
 * Env key untuk "webhook token" (shared secret yang dikirim PG di header),
 * DI-SCOPE PER PROVIDER.
 *
 * PENTING (bug fix): rantai fallback sebelumnya tidak melihat provider aktif,
 * sehingga `SUMOPOD_WEBHOOK_TOKEN` yang tertinggal di `.env` akan menimpa
 * `webhookToken` milik Xendit/Stripe. Akibatnya signature tidak pernah cocok
 * dan pesan error "tidak cocok" menutupi penyebab sebenarnya. Sekarang hanya
 * env provider yang SEDANG AKTIF yang dibaca, lalu `BUAYAR_WEBHOOK_*` universal.
 */
const WEBHOOK_TOKEN_BY_PROVIDER: Record<string, string[]> = {
  xendit: ["XENDIT_WEBHOOK_TOKEN", "XENDIT_WEBHOOK_VERIFICATION_TOKEN"],
  sumopod: ["SUMOPOD_WEBHOOK_TOKEN", "SUMOPOD_PRODUCTION_WEBHOOK_TOKEN", "SUMOPOD_SANDBOX_WEBHOOK_TOKEN"],
};

/** Sama seperti {@link WEBHOOK_TOKEN_BY_PROVIDER}, untuk shared signing secret. */
const WEBHOOK_SECRET_BY_PROVIDER: Record<string, string[]> = {
  sumopod: ["SUMOPOD_WEBHOOK_SECRET", "SUMOPOD_PRODUCTION_WEBHOOK_SECRET", "SUMOPOD_SANDBOX_WEBHOOK_SECRET"],
  xenith: ["XENITH_WEBHOOK_SECRET"],
  stripe: ["STRIPE_WEBHOOK_SECRET"],
  checkoutcom: ["CHECKOUTCOM_WEBHOOK_SECRET"],
  razorpay: ["RAZORPAY_WEBHOOK_SECRET"],
  square: ["SQUARE_WEBHOOK_SIGNATURE_KEY"],
  adyen: ["ADYEN_HMAC_KEY"],
};

function firstDefined(env: Record<string, string | undefined>, keys?: string[]): string | undefined {
  if (!keys) return undefined;
  for (const k of keys) {
    const v = env[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function resolveSandbox(env: Record<string, string | undefined>, provider: string): boolean {
  const universal = firstDefined(env, ["BUAYAR_SANDBOX", "PG_SANDBOX", "PAYMENT_SANDBOX"]);
  if (universal !== undefined) return universal === "true" || universal === "1";

  // Midtrans: dukung MIDTRANS_SANDBOX langsung, atau MIDTRANS_IS_PRODUCTION (inversi legacy)
  if (provider === "midtrans") {
    if (env.MIDTRANS_SANDBOX !== undefined) return env.MIDTRANS_SANDBOX === "true" || env.MIDTRANS_SANDBOX === "1";
    if (env.MIDTRANS_IS_PRODUCTION !== undefined) return env.MIDTRANS_IS_PRODUCTION !== "true" && env.MIDTRANS_IS_PRODUCTION !== "1";
  }

  const specificMap: Record<string, string[]> = {
    midtrans: ["MIDTRANS_SANDBOX"],
    duitku: ["DUITKU_SANDBOX"],
    ipaymu: ["IPAYMU_SANDBOX"],
    doku: ["DOKU_SANDBOX"],
    prismalink: ["PRISMALINK_SANDBOX"],
    faspay: ["FASPAY_SANDBOX"],
    finpay: ["FINPAY_SANDBOX"],
    nicepay: ["NICEPAY_SANDBOX"],
    oy: ["OY_SANDBOX"],
    stripe: ["STRIPE_SANDBOX"],
    paypal: ["PAYPAL_SANDBOX"],
    adyen: ["ADYEN_SANDBOX"],
    checkoutcom: ["CHECKOUTCOM_SANDBOX"],
    razorpay: ["RAZORPAY_SANDBOX"],
    square: ["SQUARE_SANDBOX"],
    payu: ["PAYU_SANDBOX"],
    braintree: ["BRAINTREE_SANDBOX"],
    twocheckout: ["TWOCHECKOUT_SANDBOX"],
    xendit: ["XENDIT_SANDBOX"],
    sumopod: ["SUMOPOD_SANDBOX"],
    xenith: ["XENITH_SANDBOX"],
  };
  const specific = firstDefined(env, specificMap[provider]);
  if (specific !== undefined) {
    return specific === "true" || specific === "1";
  }
  return env.NODE_ENV !== "production";
}

export function resolveConfigFromEnv(customConfig?: BuayarConfig): BuayarConfig {
  const env = typeof process !== "undefined" && process?.env ? process.env : {};

  // 1. Provider — config > PROVIDER_PG > autodetect dari kredensial.
  //
  // CATATAN KOMPATIBILITAS: urutan ini sengaja TIDAK diubah. `PROVIDER_PG` dan
  // `PG_PROVIDER` (legacy) tetap menang atas `BUAYAR_PROVIDER` (dokumentasi)
  // supaya tidak ada breaking change. Konsekuensinya ada jebakan: aplikasi
  // dengan sisa env legacy diam-diam mengabaikan `BUAYAR_PROVIDER`. Karena
  // tidak boleh diubah, kita deteksi konfliknya dan berteriak di startup.
  const explicit = (
    customConfig?.provider ||
    env.PROVIDER_PG ||
    env.PG_PROVIDER ||
    env.BUAYAR_PROVIDER ||
    env.PAYMENT_PROVIDER ||
    ""
  ).toLowerCase().trim().replace("oyindonesia", "oy").replace("2checkout", "twocheckout");

  // Alias yang umum diketik tapi belum dinormalkan. Tanpa ini `checkout.com`
  // berakhir sebagai `Payment provider 'X' is not registered`.
  const PROVIDER_ALIASES: Record<string, string> = {
    "checkout.com": "checkoutcom",
    "checkout-com": "checkoutcom",
    checkout_com: "checkoutcom",
    co: "checkoutcom",
    "2co": "twocheckout",
    "2-checkout": "twocheckout",
    twoco: "twocheckout",
    snap: "midtrans",
    snapbni: "midtrans",
    xenditpay: "xendit",
  };
  const aliased = PROVIDER_ALIASES[explicit];

  const detected = !explicit ? providerRegistry.detectFromEnv(env as any) : undefined;
  if (!explicit && detected) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        `[Buayar] Warning: Active payment provider was not explicitly configured; autodetected '${detected}' from environment credentials. Set BUAYAR_PROVIDER='${detected}' in production to avoid ambiguity.`
      );
    }
  }

  // Konflik env legacy vs universal: beri peringatan, jangan diam-diam.
  if (typeof console !== "undefined" && console.warn) {
    const legacy = (env.PROVIDER_PG || env.PG_PROVIDER || "").toLowerCase().trim();
    const universal = (env.BUAYAR_PROVIDER || "").toLowerCase().trim();
    if (legacy && universal && legacy !== universal) {
      console.warn(
        `[Buayar] PERINGATAN: PROVIDER_PG='${legacy}' dan BUAYAR_PROVIDER='${universal}' sama-sama di-set ` +
          `dan BERBEDA. Karena backward-compatibility, PROVIDER_PG yang dipakai, yaitu '${legacy}'. ` +
          `Hapus PROVIDER_PG/PG_PROVIDER dari .env agar ganti provider cukup ganti BUAYAR_PROVIDER.`
      );
    }
  }
  if (aliased && typeof console !== "undefined" && console.warn) {
    console.warn(`[Buayar] Warning: provider '${explicit}' is an alias; normalized to '${aliased}'.`);
  }

  const provider = aliased || explicit || detected || "";

  // 2. Sandbox
  const sandbox = customConfig?.sandbox ?? resolveSandbox(env, provider);

  // 3. Kredensial — universal didahulukan (intinya simple), lalu spesifik legacy.
  const spec = SPECIFIC[provider] || {};
  const cfg: any = {};

  const fields: FieldName[] = ["apiKey", "clientKey", "merchantCode", "merchantId", "secretKey", "serverKey", "projectId"];
  for (const f of fields) {
    const universalKeys = UNIVERSAL[f] || [];
    const specificKeys = spec[f] || [];
    const universal = firstDefined(env, universalKeys);
    const specific = firstDefined(env, specificKeys);
    const value = universal || specific;
    // Prioritas: config.explicit > env (universal/specific)
    const explicitValue = (customConfig as any)?.[f] || (customConfig && (f === "apiKey" ? (customConfig as any).secretKey || (customConfig as any).serverKey : undefined));
    cfg[f] = explicitValue || value || "";
  }

  // 4. Field lain (URL, webhook, project, dll)
  const callbackUrl = customConfig?.callbackUrl || env.BUAYAR_CALLBACK_URL || env.PG_CALLBACK_URL || env.PAYMENT_CALLBACK_URL;
  const returnUrl = customConfig?.returnUrl || env.BUAYAR_RETURN_URL || env.PG_RETURN_URL || env.PAYMENT_RETURN_URL;
  const publicKey = customConfig?.publicKey || firstDefined(env, ["BUAYAR_PUBLIC_KEY", "PG_PUBLIC_KEY", "PUBLIC_KEY"]) || cfg.clientKey;
  const privateKey = customConfig?.privateKey || firstDefined(env, ["BUAYAR_PRIVATE_KEY", "PG_PRIVATE_KEY", "PRIVATE_KEY"]) || cfg.apiKey;

  // 4b. Kredensial disbursement (TERPISAH dari kredensial pembayaran).
  //
  // Disbursement memakai identitas dan secret sendiri, jadi TIDAK ada fallback
  // ke `apiKey`/`secretKey` pembayaran. Tanpa tiga nilai ini, operasi
  // disbursement menolak dengan pesan yang menyebut field yang kurang — bukan
  // mengirim signature yang pasti ditolak provider.
  const disbursementUserId =
    customConfig?.disbursementUserId ??
    firstDefined(env, ["BUAYAR_DISBURSEMENT_USER_ID", "DUITKU_DISBURSEMENT_USER_ID"]);
  const disbursementEmail =
    customConfig?.disbursementEmail ??
    firstDefined(env, ["BUAYAR_DISBURSEMENT_EMAIL", "DUITKU_DISBURSEMENT_EMAIL"]);
  const disbursementSecretKey =
    customConfig?.disbursementSecretKey ??
    firstDefined(env, ["BUAYAR_DISBURSEMENT_SECRET_KEY", "DUITKU_DISBURSEMENT_SECRET_KEY"]);

  // Nama env yang berisi "webhook token" (shared secret yang dikirim PG di header).
  // Xendit menamai variabelnya `*_WEBHOOK_VERIFICATION_TOKEN`; `BUAYAR_WEBHOOK_SECRET`
  // adalah nama universal yang dipakai README untuk Xendit, jadi keduanya diterima.
  //
  // PENTING 1: jangan pernah memakai API key/secret key sebagai fallback webhook token.
  // Keduanya memang nilai berbeda secara kriptografis, sehingga hasilnya selalu
  // "tidak cocok" — bukan hanya tidak berguna, tapi juga menutupi penyebab sebenarnya
  // ("token belum dikonfigurasi") di balik pesan error "tidak cocok".
  //
  // PENTING 2: hanya env provider yang SEDANG AKTIF yang boleh jadi kandidat. Dulu
  // rantai ini global, sehingga sisa kredensial provider lain di `.env` (mis.
  // `SUMOPOD_WEBHOOK_TOKEN` setelah pindah ke Xendit) menimpa token yang benar dan
  // menggagalkan 100% webhook dengan pesan yang menyesatkan.
  const sumopodSandbox = env.SUMOPOD_SANDBOX === "true" || env.SUMOPOD_SANDBOX === "1";

  const webhookTokenEnv =
    (provider === "sumopod" && sumopodSandbox ? env.SUMOPOD_SANDBOX_WEBHOOK_TOKEN : undefined) ||
    firstDefined(env, WEBHOOK_TOKEN_BY_PROVIDER[provider]) ||
    firstDefined(env, ["BUAYAR_WEBHOOK_TOKEN", "BUAYAR_WEBHOOK_SECRET"]);

  const webhookSecretEnv =
    (provider === "sumopod" && sumopodSandbox ? env.SUMOPOD_SANDBOX_WEBHOOK_SECRET : undefined) ||
    firstDefined(env, WEBHOOK_SECRET_BY_PROVIDER[provider]) ||
    firstDefined(env, ["BUAYAR_WEBHOOK_SECRET", "BUAYAR_WEBHOOK_SIGNATURE_KEY"]);

  // 4c. Feature flag & knob provider via env.
  //
  // SDK ini punya beberapa capability yang hanya bisa diaktifkan lewat kode
  // (`new Buayar({ extra: { snap: true } })`) — misalnya DOKU QRIS/DANA/ShopeePay
  // yang HANYA tersedia lewat jalur SNAP. Akibatnya "ganti provider cukup ganti
  // env" jadi tidak berlaku: pindah ke DOKU QRIS memaksa buka file dan edit kode.
  //
  // `BUAYAR_EXTRA_<KEY>` menutup celah itu secara generik:
  //   BUAYAR_EXTRA_SNAP=true        -> extra.snap === true
  //   BUAYAR_EXTRA_COUNTRY_CODE=ID  -> extra.countryCode === "ID"
  //
  // Nilainya dikonversi ke boolean bila itu yang terjadi, karena kode internal
  // memakai `if (extra.snap)` — string "false" yang truthy akan menyalakan SNAP
  // saat yang diinginkan justru OFF.
  const envExtra: Record<string, any> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("BUAYAR_EXTRA_") || key.length <= "BUAYAR_EXTRA_".length) continue;
    // SNAKE_CASE -> camelCase: BUAYAR_EXTRA_COUNTRY_CODE -> extra.countryCode
    const name = key
      .slice("BUAYAR_EXTRA_".length)
      .toLowerCase()
      .replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    const trimmed = String(value).trim();
    if (trimmed === "" || trimmed === "false" || trimmed === "0") envExtra[name] = false;
    else if (trimmed === "true" || trimmed === "1") envExtra[name] = true;
    else envExtra[name] = trimmed;
  }

  const extra = {
    ...envExtra,
    webhookToken: customConfig?.webhookToken || webhookTokenEnv,
    webhookSecret: customConfig?.webhookSecret || customConfig?.secretKey || webhookSecretEnv,
    merchantName: (customConfig as any)?.merchantName || env.FASPAY_MERCHANT_NAME || env.BUAYAR_MERCHANT_NAME,
    userId: (customConfig as any)?.userId || env.FASPAY_USER_ID,
    iMid: (customConfig as any)?.iMid || (customConfig as any)?.imid || env.NICEPAY_IMID,
    username: (customConfig as any)?.username || env.OY_USERNAME,
    hmacKey: (customConfig as any)?.hmacKey || (provider === "adyen" ? customConfig?.secretKey : undefined) || firstDefined(env, WEBHOOK_SECRET_BY_PROVIDER.adyen) || env.ADYEN_HMAC_KEY,
    liveUrlPrefix: env.ADYEN_LIVE_URL_PREFIX,
    webhookId: (customConfig as any)?.webhookId || (provider === "paypal" ? customConfig?.projectId : undefined) || env.PAYPAL_WEBHOOK_ID || env.BUAYAR_WEBHOOK_ID || env.BUAYAR_PROJECT_ID,
    merchantAccount: (customConfig as any)?.merchantAccount || (provider === "adyen" ? customConfig?.merchantCode : undefined) || env.ADYEN_MERCHANT_ACCOUNT,
    md5Key: (customConfig as any)?.md5Key || customConfig?.apiKey || env.PAYU_MD5_KEY,
    oauthClientId: (customConfig as any)?.oauthClientId || env.PAYU_OAUTH_CLIENT_ID,
    oauthClientSecret: (customConfig as any)?.oauthClientSecret || env.PAYU_OAUTH_CLIENT_SECRET,
    locationId: (customConfig as any)?.locationId || env.SQUARE_LOCATION_ID,
    webhookSignatureKey: (customConfig as any)?.webhookSignatureKey || (provider === "square" ? customConfig?.secretKey : undefined) || firstDefined(env, WEBHOOK_SECRET_BY_PROVIDER.square) || env.SQUARE_WEBHOOK_SIGNATURE_KEY || env.BUAYAR_WEBHOOK_SIGNATURE_KEY || env.BUAYAR_WEBHOOK_SECRET,
    publicKey: (customConfig as any)?.publicKey || customConfig?.clientKey || env.BRAINTREE_PUBLIC_KEY || env.ADYEN_CLIENT_KEY,
    secretWord: (customConfig as any)?.secretWord || customConfig?.apiKey || env.TWOCHECKOUT_SECRET_WORD,
    // DOKU MCP Server (sumber daftar channel LIVE). API Key "General" DOKU berbeda
    // dari Secret Key `SK-...`, jadi disimpan terpisah di `extra.mcpApiKey`.
    mcpApiKey:
      (customConfig as any)?.mcpApiKey ||
      (provider === "doku" ? env.DOKU_MCP_API_KEY || env.DOKU_API_KEY : undefined) ||
      env.BUAYAR_MCP_API_KEY,
    mcpUrl: (customConfig as any)?.mcpUrl || env.DOKU_MCP_URL,
    ...customConfig?.extra,
  };

  const apiKey = cfg.apiKey || cfg.secretKey || cfg.serverKey;
  const simulate =
    customConfig?.simulate !== undefined
      ? customConfig.simulate
      : env.BUAYAR_SIMULATE === "1" || env.BUAYAR_SIMULATE === "true";

  return {
    provider,
    apiKey,
    serverKey: cfg.serverKey || apiKey || "",
    secretKey: cfg.secretKey || cfg.serverKey || apiKey || "",
    merchantCode: cfg.merchantCode || "",
    clientKey: cfg.clientKey || "",
    merchantId: cfg.merchantId || "",
    projectId: cfg.projectId || "",
    publicKey,
    privateKey,
    disbursementUserId,
    disbursementEmail,
    disbursementSecretKey,
    sandbox,
    simulate,
    callbackUrl,
    returnUrl,
    webhookToken: extra.webhookToken,
    webhookSecret: extra.webhookSecret,
    extra,
  };
}