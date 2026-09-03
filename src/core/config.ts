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
};

type FieldName = keyof FieldMap;

function firstDefined(env: Record<string, string | undefined>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function resolveSandbox(env: Record<string, string | undefined>, provider: string): boolean {
  const universal = firstDefined(env, ["BUAYAR_SANDBOX", "PG_SANDBOX", "PAYMENT_SANDBOX"]);
  if (universal !== undefined) return universal === "true" || universal === "1";
  const specificMap: Record<string, string[]> = {
    midtrans: ["MIDTRANS_IS_PRODUCTION"],
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
  };
  const specific = firstDefined(env, specificMap[provider]);
  if (specific !== undefined) {
    if (provider === "midtrans") return specific !== "true" && specific !== "1";
    return specific === "true" || specific === "1";
  }
  return env.NODE_ENV !== "production";
}

export function resolveConfigFromEnv(customConfig?: BuayarConfig): BuayarConfig {
  const env = typeof process !== "undefined" && process?.env ? process.env : {};

  // 1. Provider — config > PROVIDER_PG > autodetect dari kredensial.
  const explicit = (
    customConfig?.provider ||
    env.PROVIDER_PG ||
    env.PG_PROVIDER ||
    env.BUAYAR_PROVIDER ||
    env.PAYMENT_PROVIDER ||
    ""
  ).toLowerCase().trim();
  let provider = explicit || providerRegistry.detectFromEnv(env as any) || "midtrans";
  provider = provider.replace("oyindonesia", "oy").replace("2checkout", "twocheckout");

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
  const privateKey = customConfig?.privateKey || firstDefined(env, ["BUAYAR_PRIVATE_KEY", "PG_PRIVATE_KEY", "PRIVATE_KEY"]) || (provider === "braintree" ? cfg.apiKey : undefined);

  const extra = {
    webhookToken: env.XENDIT_WEBHOOK_TOKEN || env.BUAYAR_WEBHOOK_TOKEN,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || env.CHECKOUTCOM_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET || env.BUAYAR_WEBHOOK_SECRET,
    merchantName: env.FASPAY_MERCHANT_NAME || env.BUAYAR_MERCHANT_NAME,
    userId: env.FASPAY_USER_ID,
    iMid: env.NICEPAY_IMID,
    username: env.OY_USERNAME,
    hmacKey: env.ADYEN_HMAC_KEY,
    liveUrlPrefix: env.ADYEN_LIVE_URL_PREFIX,
    webhookId: env.PAYPAL_WEBHOOK_ID,
    merchantAccount: env.ADYEN_MERCHANT_ACCOUNT,
    md5Key: env.PAYU_MD5_KEY,
    oauthClientId: env.PAYU_OAUTH_CLIENT_ID,
    oauthClientSecret: env.PAYU_OAUTH_CLIENT_SECRET,
    locationId: env.SQUARE_LOCATION_ID,
    webhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    publicKey: env.BRAINTREE_PUBLIC_KEY || env.ADYEN_CLIENT_KEY,
    secretWord: env.TWOCHECKOUT_SECRET_WORD,
    ...customConfig?.extra,
  };

  const apiKey = cfg.apiKey || cfg.secretKey || cfg.serverKey;

  return {
    provider,
    apiKey,
    serverKey: apiKey || "",
    secretKey: apiKey || "",
    merchantCode: cfg.merchantCode || "",
    clientKey: cfg.clientKey || "",
    merchantId: cfg.merchantId || "",
    projectId: cfg.projectId || "",
    publicKey,
    privateKey,
    sandbox,
    callbackUrl,
    returnUrl,
    extra,
  };
}