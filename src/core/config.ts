import { BuayarConfig } from "../types";

/**
 * Resolver konfigurasi kredensial otomatis dari Environment Variables.
 * Mendukung variabel universal Buayar / PG serta variabel spesifik masing-masing provider.
 */
export function resolveConfigFromEnv(customConfig?: BuayarConfig): BuayarConfig {
  const env = typeof process !== "undefined" && process?.env ? process.env : {};

  // 1. Resolve Provider
  const provider = (
    customConfig?.provider ||
    env.PROVIDER_PG ||
    env.PG_PROVIDER ||
    env.BUAYAR_PROVIDER ||
    env.PAYMENT_PROVIDER ||
    "midtrans"
  ).toLowerCase().trim();

  // 2. Resolve Sandbox / Environment Mode
  let sandbox: boolean;
  if (customConfig?.sandbox !== undefined) {
    sandbox = customConfig.sandbox;
  } else if (env.BUAYAR_SANDBOX !== undefined) {
    sandbox = env.BUAYAR_SANDBOX === "true" || env.BUAYAR_SANDBOX === "1";
  } else if (env.PG_SANDBOX !== undefined) {
    sandbox = env.PG_SANDBOX === "true" || env.PG_SANDBOX === "1";
  } else if (env.PAYMENT_SANDBOX !== undefined) {
    sandbox = env.PAYMENT_SANDBOX === "true" || env.PAYMENT_SANDBOX === "1";
  } else if (env.MIDTRANS_IS_PRODUCTION !== undefined) {
    sandbox = env.MIDTRANS_IS_PRODUCTION !== "true" && env.MIDTRANS_IS_PRODUCTION !== "1";
  } else if (env.DUITKU_SANDBOX !== undefined) {
    sandbox = env.DUITKU_SANDBOX === "true" || env.DUITKU_SANDBOX === "1";
  } else if (env.IPAYMU_SANDBOX !== undefined) {
    sandbox = env.IPAYMU_SANDBOX === "true" || env.IPAYMU_SANDBOX === "1";
  } else if (env.DOKU_SANDBOX !== undefined) {
    sandbox = env.DOKU_SANDBOX === "true" || env.DOKU_SANDBOX === "1";
  } else if (env.PRISMALINK_SANDBOX !== undefined) {
    sandbox = env.PRISMALINK_SANDBOX === "true" || env.PRISMALINK_SANDBOX === "1";
  } else if (env.FASPAY_SANDBOX !== undefined) {
    sandbox = env.FASPAY_SANDBOX === "true" || env.FASPAY_SANDBOX === "1";
  } else if (env.FINPAY_SANDBOX !== undefined) {
    sandbox = env.FINPAY_SANDBOX === "true" || env.FINPAY_SANDBOX === "1";
  } else if (env.NICEPAY_SANDBOX !== undefined) {
    sandbox = env.NICEPAY_SANDBOX === "true" || env.NICEPAY_SANDBOX === "1";
  } else if (env.OY_SANDBOX !== undefined) {
    sandbox = env.OY_SANDBOX === "true" || env.OY_SANDBOX === "1";
  } else {
    sandbox = env.NODE_ENV !== "production";
  }

  // 3. Resolve API Key / Server Key / Secret Key / Password
  let apiKey = customConfig?.apiKey || customConfig?.serverKey || customConfig?.secretKey;
  if (!apiKey) {
    if (provider === "midtrans") {
      apiKey = env.MIDTRANS_SERVER_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY || env.BUAYAR_SERVER_KEY;
    } else if (provider === "duitku") {
      apiKey = env.DUITKU_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "ipaymu") {
      apiKey = env.IPAYMU_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "xendit") {
      apiKey = env.XENDIT_SECRET_KEY || env.XENDIT_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "doku") {
      apiKey = env.DOKU_SECRET_KEY || env.DOKU_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "prismalink") {
      apiKey = env.PRISMALINK_SECRET_KEY || env.PRISMALINK_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "faspay") {
      apiKey = env.FASPAY_PASSWORD || env.FASPAY_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "finpay") {
      apiKey = env.FINPAY_MERCHANT_KEY || env.FINPAY_SECRET_KEY || env.FINPAY_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "nicepay") {
      apiKey = env.NICEPAY_KEY || env.NICEPAY_MERCHANT_KEY || env.NICEPAY_SECRET_KEY || env.NICEPAY_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else if (provider === "oy" || provider === "oyindonesia") {
      apiKey = env.OY_API_KEY || env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY;
    } else {
      apiKey = env.BUAYAR_API_KEY || env.PG_API_KEY || env.PAYMENT_API_KEY || env.PG_SECRET_KEY || env.BUAYAR_SECRET_KEY;
    }
  }

  // 4. Resolve Merchant Code / Client Key / Client ID / Merchant ID / User ID / iMid / Username
  let merchantCode = customConfig?.merchantCode;
  let clientKey = customConfig?.clientKey;
  let merchantId = customConfig?.merchantId;

  if (provider === "midtrans") {
    clientKey = clientKey || env.MIDTRANS_CLIENT_KEY || env.BUAYAR_CLIENT_KEY || env.PG_CLIENT_KEY;
    merchantId = merchantId || env.MIDTRANS_MERCHANT_ID || env.BUAYAR_MERCHANT_ID || env.PG_MERCHANT_ID;
    merchantCode = merchantCode || clientKey || merchantId || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE;
  } else if (provider === "duitku") {
    merchantCode = merchantCode || env.DUITKU_MERCHANT_CODE || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
  } else if (provider === "ipaymu") {
    merchantCode = merchantCode || env.IPAYMU_VA || env.IPAYMU_MERCHANT_CODE || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
  } else if (provider === "doku") {
    merchantCode = merchantCode || env.DOKU_CLIENT_ID || env.DOKU_MERCHANT_ID || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
    clientKey = clientKey || env.DOKU_CLIENT_ID || env.BUAYAR_CLIENT_KEY;
  } else if (provider === "prismalink") {
    merchantCode = merchantCode || env.PRISMALINK_MERCHANT_ID || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
    merchantId = merchantId || env.PRISMALINK_MERCHANT_ID || env.BUAYAR_MERCHANT_ID;
  } else if (provider === "faspay") {
    merchantCode = merchantCode || env.FASPAY_MERCHANT_ID || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
    merchantId = merchantId || env.FASPAY_MERCHANT_ID || env.BUAYAR_MERCHANT_ID;
    clientKey = clientKey || env.FASPAY_USER_ID || env.BUAYAR_CLIENT_KEY;
  } else if (provider === "finpay") {
    merchantCode = merchantCode || env.FINPAY_MERCHANT_ID || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
    merchantId = merchantId || env.FINPAY_MERCHANT_ID || env.BUAYAR_MERCHANT_ID;
  } else if (provider === "nicepay") {
    merchantCode = merchantCode || env.NICEPAY_IMID || env.NICEPAY_MERCHANT_ID || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
    merchantId = merchantId || env.NICEPAY_IMID || env.BUAYAR_MERCHANT_ID;
  } else if (provider === "oy" || provider === "oyindonesia") {
    merchantCode = merchantCode || env.OY_USERNAME || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
    clientKey = clientKey || env.OY_USERNAME || env.BUAYAR_CLIENT_KEY;
  } else {
    merchantCode = merchantCode || env.BUAYAR_MERCHANT_CODE || env.PG_MERCHANT_CODE || env.PAYMENT_MERCHANT_CODE;
  }

  // 5. Resolve Project ID / Public Key / URLs / Webhook Tokens / Extra
  const projectId = customConfig?.projectId || env.BUAYAR_PROJECT_ID || env.PG_PROJECT_ID || env.PROJECT_ID;
  const publicKey = customConfig?.publicKey || env.BUAYAR_PUBLIC_KEY || env.PG_PUBLIC_KEY || env.PUBLIC_KEY;
  const privateKey = customConfig?.privateKey || env.BUAYAR_PRIVATE_KEY || env.PG_PRIVATE_KEY || env.PRIVATE_KEY;
  const secretKey = customConfig?.secretKey || env.BUAYAR_SECRET_KEY || env.PG_SECRET_KEY || env.SECRET_KEY || env.XENDIT_SECRET_KEY || env.DOKU_SECRET_KEY || env.PRISMALINK_SECRET_KEY || env.FASPAY_PASSWORD || env.FINPAY_MERCHANT_KEY || env.NICEPAY_KEY || env.OY_API_KEY;
  const callbackUrl = customConfig?.callbackUrl || env.BUAYAR_CALLBACK_URL || env.PG_CALLBACK_URL || env.PAYMENT_CALLBACK_URL;
  const returnUrl = customConfig?.returnUrl || env.BUAYAR_RETURN_URL || env.PG_RETURN_URL || env.PAYMENT_RETURN_URL;

  const extra = {
    webhookToken: env.XENDIT_WEBHOOK_TOKEN || env.BUAYAR_WEBHOOK_TOKEN,
    merchantName: env.FASPAY_MERCHANT_NAME || env.BUAYAR_MERCHANT_NAME,
    userId: env.FASPAY_USER_ID,
    iMid: env.NICEPAY_IMID,
    username: env.OY_USERNAME,
    ...customConfig?.extra,
  };

  return {
    provider: provider === "oyindonesia" ? "oy" : provider,
    apiKey: apiKey || "",
    serverKey: apiKey || "",
    secretKey: secretKey || apiKey || "",
    merchantCode: merchantCode || "",
    clientKey: clientKey || "",
    merchantId: merchantId || "",
    projectId,
    publicKey,
    privateKey,
    sandbox,
    callbackUrl,
    returnUrl,
    extra,
  };
}
