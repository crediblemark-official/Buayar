import crypto from "crypto";
import type { ProviderConfig } from "../types";
import type { CreateWebhookEventParams, SimulatedWebhookEvent } from "./types";
import { CONTRACT_FIXTURES } from "./fixtures";
import { buildIpaymuCallbackString } from "../providers/ipaymu/signature";
import { generateDokuHeaders } from "../providers/doku/signature";
import { generatePrismalinkSignature } from "../providers/prismalink/signature";
import { generateNicepayToken, formatNicepayTimestamp } from "../providers/nicepay/signature";
import { generateFinpaySignature } from "../providers/finpay/signature";

export const DEFAULT_SIMULATOR_SECRETS: Record<string, Record<string, string>> = {
  midtrans: { serverKey: "sim_midtrans_server_key" },
  duitku: { merchantCode: "D1234", apiKey: "sim_duitku_api_key" },
  ipaymu: { merchantCode: "0000001234567890", apiKey: "sim_ipaymu_api_key" },
  // Xendit punya "Verification token" yang TERPISAH dari secret key di dashboard.
  // Simulator memakai nilai berbeda untuk keduanya supaya perilaku produksi
  // (token tidak akan pernah cocok dengan secret key) ikut teruji.
  xendit: { secretKey: "sim_xendit_secret_key", webhookToken: "sim_xendit_webhook_token" },
  doku: { merchantCode: "BRN-0268-SIMULATOR", secretKey: "SK-SIMULATOR-DOKU-KEY" },
  prismalink: { merchantCode: "PRISMA_SIM", secretKey: "sim_prismalink_secret" },
  faspay: { merchantCode: "sim_faspay_user", clientKey: "sim_faspay_user", apiKey: "sim_faspay_password" },
  finpay: { merchantCode: "FINPAY_SIM", apiKey: "sim_finpay_key" },
  nicepay: { merchantCode: "NICEPAY_SIM", apiKey: "sim_nicepay_key" },
  oy: { merchantCode: "oy_sim_user", clientKey: "oy_sim_user", apiKey: "sim_oy_api_key" },
  stripe: { secretKey: "whsec_sim_stripe_secret_1234567890" },
  paypal: { projectId: "sim_paypal_webhook_id" },
  adyen: { secretKey: "44782ECE0743D4B6041C62090303A70E853249A50E383F4C2237B642C0A3981F", merchantCode: "AdyenSimAccount" },
  checkoutcom: { secretKey: "sim_cko_whsec_1234567890" },
  razorpay: { secretKey: "sim_razorpay_whsec_123" },
  square: { secretKey: "sim_square_sigkey_123" },
  payu: { apiKey: "sim_payu_md5_key_123", merchantCode: "300747" },
  braintree: { secretKey: "sim_bt_priv", clientKey: "sim_bt_pub" },
  twocheckout: { apiKey: "sim_2co_secret_word" },
  sumopod: { secretKey: "whsec_MfKQ9r8G1N+Z4QJkL8xU2vW5yA=" },
  xenith: { secretKey: "sim_xenith_secret_key_123" },
};

function sha256Hex(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function sha512Hex(str: string): string {
  return crypto.createHash("sha512").update(str).digest("hex");
}

function md5Hex(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

function hmacSha256Hex(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function hmacSha256Base64(data: string, secret: Buffer | string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64");
}

/**
 * Generate simulated webhook payload & headers yang secara matematis valid
 * terhadap algoritma signature verifikasi masing-masing 20 provider.
 */
export function generateSimulatedWebhook(
  providerInput: string,
  params: CreateWebhookEventParams,
  config?: ProviderConfig
): SimulatedWebhookEvent {
  const provider = (providerInput || params.provider || "").toLowerCase().trim();
  const status = params.status || "paid";
  const fixtureMap = CONTRACT_FIXTURES[provider];
  if (!fixtureMap) {
    throw new Error(`Simulator does not have contract fixtures for provider '${provider}'`);
  }
  const fix = fixtureMap[status] || fixtureMap.paid;
  const secrets = {
    ...DEFAULT_SIMULATOR_SECRETS[provider],
    ...(config as any),
    ...(params.config as any),
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  let body: any = {};
  let rawBody = "";

  switch (provider) {
    case "midtrans": {
      const serverKey = secrets.serverKey || secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.midtrans.serverKey;
      const grossAmount = params.amount.toString();
      const statusCode = fix.status_code || "200";
      const signatureKey = params.tampered
        ? "invalid_midtrans_signature"
        : sha512Hex(`${params.orderId}${statusCode}${grossAmount}${serverKey}`);

      body = {
        order_id: params.orderId,
        status_code: statusCode,
        gross_amount: grossAmount,
        transaction_status: fix.transaction_status,
        fraud_status: fix.fraud_status || "accept",
        payment_type: "bank_transfer",
        signature_key: signatureKey,
        transaction_id: "trx-sim-" + params.orderId,
        transaction_time: new Date().toISOString(),
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "duitku": {
      const merchantCode = secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.duitku.merchantCode;
      const apiKey = secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.duitku.apiKey;
      const signature = params.tampered
        ? "invalid_duitku_signature"
        : md5Hex(`${merchantCode}${params.amount}${params.orderId}${apiKey}`);

      body = {
        merchantCode,
        amount: String(params.amount),
        merchantOrderId: params.orderId,
        signature,
        resultCode: fix.resultCode,
        reference: "DUITKU-REF-" + params.orderId,
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "ipaymu": {
      const va = secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.ipaymu.merchantCode;

      body = {
        trx_id: 123456,
        sid: "SID-" + params.orderId,
        reference_id: params.orderId,
        status: fix.status,
        status_code: fix.status_code,
        transaction_status_code: fix.transaction_status_code,
        paid_off: fix.paid_off,
        via: "va",
        channel: "bca",
      };
      rawBody = JSON.stringify(body);
      const signString = buildIpaymuCallbackString(body);
      const signature = params.tampered ? "invalid_ipaymu_sig" : hmacSha256Hex(signString, va);
      headers["x-signature"] = signature;
      break;
    }

    case "xendit": {
      // Hanya `webhookToken` yang boleh jadi token — bukan secret key. Kalau di sini
      // secret key dipakai, kita tak akan pernah menangkap bug "token salah sumber".
      const token = secrets.webhookToken || DEFAULT_SIMULATOR_SECRETS.xendit.webhookToken;
      headers["x-callback-token"] = params.tampered ? "invalid_xendit_token" : token;

      body = {
        id: "inv-sim-" + params.orderId,
        external_id: params.orderId,
        status: fix.status,
        amount: params.amount,
        paid_amount: fix.status === "PAID" ? params.amount : 0,
        payment_method: "VIRTUAL_ACCOUNT",
        payment_channel: "BCA",
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "doku": {
      const clientId = secrets.merchantCode || secrets.clientId || DEFAULT_SIMULATOR_SECRETS.doku.merchantCode;
      const secretKey = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.doku.secretKey;

      body = {
        order: { invoice_number: params.orderId, amount: params.amount },
        transaction: { status: fix.transaction.status, date: new Date().toISOString() },
        service: { id: "ONLINE_PAYMENT" },
        channel: { id: "VIRTUAL_ACCOUNT_BCA" },
      };
      rawBody = JSON.stringify(body);
      const dokuHeaders = generateDokuHeaders(clientId, secretKey, "/api/payment/webhook", rawBody, "REQ-SIM-1");
      Object.assign(headers, dokuHeaders);
      if (params.tampered) {
        headers["Signature"] = "HMACSHA256=invalid_signature";
      }
      break;
    }

    case "prismalink": {
      const merchantId = secrets.merchantCode || secrets.merchantId || DEFAULT_SIMULATOR_SECRETS.prismalink.merchantCode;
      const secretKey = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.prismalink.secretKey;
      const signature = params.tampered
        ? "invalid_prismalink_signature"
        : generatePrismalinkSignature(merchantId, params.orderId, params.amount, secretKey);

      body = {
        merchant_id: merchantId,
        order_id: params.orderId,
        amount: params.amount,
        status: fix.status,
        response_code: fix.response_code,
        signature,
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "faspay": {
      const userId = secrets.clientKey || secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.faspay.clientKey;
      const password = secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.faspay.apiKey;
      const statusCode = fix.payment_status_code;
      const md5Hash = crypto.createHash("md5").update(`${userId}${password}${params.orderId}${statusCode}`).digest("hex");
      const signature = params.tampered
        ? "invalid_faspay_signature"
        : crypto.createHash("sha1").update(md5Hash).digest("hex");

      body = {
        bill_no: params.orderId,
        trx_id: "FAS-" + params.orderId,
        payment_status_code: statusCode,
        payment_status_desc: fix.payment_status_desc,
        signature,
        payment_total: params.amount,
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "finpay": {
      const merchantId = secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.finpay.merchantCode;
      const merchantKey = secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.finpay.apiKey;
      const signature = params.tampered
        ? "invalid_finpay_signature"
        : generateFinpaySignature(merchantId, params.orderId, params.amount, merchantKey);

      body = {
        merchant_id: merchantId,
        order_id: params.orderId,
        amount: params.amount,
        payment_status: fix.payment_status,
        response_code: fix.response_code,
        signature,
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "nicepay": {
      const imid = secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.nicepay.merchantCode;
      const key = secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.nicepay.apiKey;
      const timeStamp = formatNicepayTimestamp();
      const signature = params.tampered
        ? "invalid_nicepay_token"
        : generateNicepayToken(timeStamp, imid, params.orderId, params.amount, key);

      body = {
        tXid: "TXID-" + params.orderId,
        referenceNo: params.orderId,
        amt: String(params.amount),
        status: fix.status,
        merchantToken: signature,
        iMid: imid,
        timeStamp,
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "oy": {
      const username = secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.oy.merchantCode;

      body = {
        partner_tx_id: params.orderId,
        status: fix.status,
        amount: params.amount,
      };
      rawBody = JSON.stringify(body);
      headers["x-oy-username"] = params.tampered ? "wrong_user" : username;
      break;
    }

    case "stripe": {
      const webhookSecret = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.stripe.secretKey;
      const timestamp = Math.floor(Date.now() / 1000).toString();

      body = {
        id: "evt_sim_" + params.orderId,
        object: "event",
        type: fix.type,
        api_version: "2023-10-16",
        data: {
          object: {
            id: "pi_sim_" + params.orderId,
            amount: params.amount,
            currency: (params.currency || "usd").toLowerCase(),
            status: fix.object_status,
            metadata: { order_id: params.orderId },
          },
        },
      };
      rawBody = JSON.stringify(body);
      const signedContent = `${timestamp}.${rawBody}`;
      const sig = params.tampered ? "invalid_stripe_sig" : hmacSha256Hex(signedContent, webhookSecret);
      headers["stripe-signature"] = `t=${timestamp},v1=${sig}`;
      break;
    }

    case "paypal": {
      body = {
        id: "WH-SIM-" + params.orderId,
        event_type: fix.event_type,
        resource: {
          id: "CAP-SIM-" + params.orderId,
          custom_id: params.orderId,
          reference_id: params.orderId,
          invoice_id: params.orderId,
          status: fix.status,
          amount: {
            value: (params.amount / 100).toFixed(2),
            currency_code: (params.currency || "USD").toUpperCase(),
          },
        },
      };
      rawBody = JSON.stringify(body);
      headers["paypal-transmission-id"] = "trans-" + params.orderId;
      headers["paypal-transmission-time"] = new Date().toISOString();
      headers["paypal-cert-url"] = "https://api.sandbox.paypal.com/v1/notifications/certs/cert.pem";
      headers["paypal-auth-algo"] = "SHA256withRSA";
      headers["paypal-transmission-sig"] = params.tampered ? "" : "simulated_paypal_signature";
      headers["paypal-webhook-id"] = secrets.projectId || DEFAULT_SIMULATOR_SECRETS.paypal.projectId;
      break;
    }

    case "adyen": {
      const hmacKey = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.adyen.secretKey;
      const merchantAccount = secrets.merchantCode || DEFAULT_SIMULATOR_SECRETS.adyen.merchantCode;
      const currency = (params.currency || "EUR").toUpperCase();
      const pspReference = "PSP-SIM-" + params.orderId;

      const fields = [
        pspReference,
        "",
        merchantAccount,
        params.orderId,
        String(params.amount),
        currency,
        fix.eventCode,
        fix.success,
      ];
      const signString = fields.join(":");
      const keyBytes = Buffer.from(hmacKey, "hex");
      const hmacSignature = params.tampered
        ? "invalid_adyen_hmac"
        : crypto.createHmac("sha256", keyBytes).update(signString, "utf8").digest("base64");

      body = {
        notificationItems: [
          {
            NotificationRequestItem: {
              merchantAccountCode: merchantAccount,
              pspReference,
              merchantReference: params.orderId,
              eventCode: fix.eventCode,
              success: fix.success,
              amount: { value: params.amount, currency },
              additionalData: { hmacSignature },
            },
          },
        ],
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "checkoutcom": {
      const webhookSecret = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.checkoutcom.secretKey;

      body = {
        id: "evt_cko_" + params.orderId,
        type: fix.type,
        data: {
          reference: params.orderId,
          amount: params.amount,
          currency: (params.currency || "USD").toUpperCase(),
          approved: status === "paid",
        },
      };
      rawBody = JSON.stringify(body);
      headers["cko-signature"] = params.tampered ? "invalid_cko_sig" : hmacSha256Hex(rawBody, webhookSecret);
      break;
    }

    case "razorpay": {
      const webhookSecret = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.razorpay.secretKey;

      body = {
        entity: "event",
        event: fix.event,
        payload: {
          payment: {
            entity: {
              id: "pay_sim_" + params.orderId,
              order_id: "order_sim_" + params.orderId,
              amount: params.amount,
              status: fix.status,
              notes: { order_id: params.orderId },
            },
          },
        },
      };
      rawBody = JSON.stringify(body);
      headers["x-razorpay-signature"] = params.tampered ? "invalid_rzp_sig" : hmacSha256Hex(rawBody, webhookSecret);
      break;
    }

    case "square": {
      const signatureKey = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.square.secretKey;

      body = {
        merchant_id: "SQ_MERCHANT_SIM",
        type: fix.type,
        data: {
          object: {
            payment: {
              id: "sq_pay_" + params.orderId,
              reference_id: params.orderId,
              status: fix.status,
              amount_money: { amount: params.amount, currency: (params.currency || "USD").toUpperCase() },
            },
          },
        },
      };
      rawBody = JSON.stringify(body);
      const notificationUrl = config?.callbackUrl || (config?.extra as any)?.notificationUrl || "";
      const payload = notificationUrl + rawBody;
      headers["x-square-hmacsha256-signature"] = params.tampered
        ? "invalid_sq_sig"
        : hmacSha256Base64(payload, signatureKey);
      break;
    }

    case "payu": {
      const md5Key = secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.payu.apiKey;

      body = {
        order: {
          orderId: "PAYU-SIM-" + params.orderId,
          extOrderId: params.orderId,
          status: fix.status,
          totalAmount: String(params.amount),
          currencyCode: (params.currency || "PLN").toUpperCase(),
        },
      };
      rawBody = JSON.stringify(body);
      const signature = params.tampered ? "invalid_payu_sig" : md5Hex(rawBody + md5Key);
      headers["openpayu-signature"] = `sender=checkout;signature=${signature};algorithm=MD5`;
      break;
    }

    case "braintree": {
      const xml = `<notification><kind>${fix.kind}</kind><subject><transaction><id>bt_sim_${params.orderId}</id><order_id>${params.orderId}</order_id><amount>${(params.amount / 100).toFixed(2)}</amount><status>${fix.status}</status></transaction></subject></notification>`;
      const payloadBase64 = Buffer.from(xml).toString("base64");
      const privateKey = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.braintree.secretKey;
      const secretHash = crypto.createHash("sha1").update(privateKey).digest("hex");
      const payloadDecoded = Buffer.from(payloadBase64, "base64").toString("utf8");
      const hmac = crypto.createHmac("sha1", secretHash).update(payloadDecoded).digest("hex");
      const pub = secrets.clientKey || DEFAULT_SIMULATOR_SECRETS.braintree.clientKey;
      const signature = params.tampered ? "invalid_bt_sig" : `${pub}|${hmac}`;

      body = {
        bt_signature: signature,
        bt_payload: payloadBase64,
        kind: fix.kind,
        subject: {
          transaction: {
            id: "bt_sim_" + params.orderId,
            orderId: params.orderId,
            amount: params.amount / 100,
            status: fix.status,
          },
        },
      };
      rawBody = JSON.stringify(body);
      headers["bt_signature"] = signature;
      headers["bt_payload"] = payloadBase64;
      break;
    }

    case "twocheckout": {
      const secretKey = secrets.apiKey || DEFAULT_SIMULATOR_SECRETS.twocheckout.apiKey;
      const saleId = "SALE-" + params.orderId;
      const productId = "PROD-1";
      const invoiceId = "INV-1";
      const raw = secretKey + saleId + productId + invoiceId;
      const hash = params.tampered ? "invalid_2co_hash" : md5Hex(raw);

      body = {
        SALE_ID: saleId,
        IPN_PID: [productId],
        IPN_PNAME: [invoiceId],
        REFNOEXT: params.orderId,
        ORDERSTATUS: fix.ORDERSTATUS,
        HASH: hash,
      };
      rawBody = JSON.stringify(body);
      break;
    }

    case "sumopod": {
      const secret = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.sumopod.secretKey;
      const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
      const secretBytes = Buffer.from(cleanSecret, "base64");
      const svixId = "msg_sim_" + params.orderId;
      const timestamp = Math.floor(Date.now() / 1000).toString();

      body = {
        id: "evt_sim_" + params.orderId,
        event_type: fix.event_type,
        data: {
          payment_id: "pay_sim_" + params.orderId,
          order_id: params.orderId,
          external_id: params.orderId,
          amount: params.amount,
          status: fix.status,
        },
      };
      rawBody = JSON.stringify(body);
      const signedContent = `${svixId}.${timestamp}.${rawBody}`;
      const sig = params.tampered ? "invalid_svix_sig" : hmacSha256Base64(signedContent, secretBytes);
      headers["svix-id"] = svixId;
      headers["svix-timestamp"] = timestamp;
      headers["svix-signature"] = `v1,${sig}`;
      break;
    }

    case "xenith": {
      const secret = secrets.secretKey || DEFAULT_SIMULATOR_SECRETS.xenith.secretKey;
      const timestamp = new Date().toISOString();
      const urlPath = "/v1/webhook";

      body = {
        schemaVersion: "1.0.1",
        timestamp,
        data: {
          id: "payin-sim-" + params.orderId,
          initiatedAmount: String(params.amount),
          paymentAmount: String(params.amount),
          currency: "IDR",
          paymentMethod: "VIRTUAL_ACCOUNT",
          paymentChannel: "BCA.VA",
          referenceCode: params.orderId,
          customerReference: params.orderId,
          customerName: "John Doe",
          status: fix.status,
          createdTime: timestamp,
          updatedTime: timestamp,
        },
      };
      rawBody = JSON.stringify(body);
      const stringToSign = `POST\\n${urlPath}\\n${rawBody}\\n${timestamp}`;
      const sig = params.tampered
        ? "invalid_xenith_sig"
        : hmacSha256Base64(stringToSign, secret);
      headers["x-xenith-signature"] = sig;
      headers["x-xenith-timestamp"] = timestamp;
      break;
    }

    default:
      throw new Error(`Unsupported simulator provider: ${provider}`);
  }

  return {
    provider,
    headers,
    body,
    rawBody,
  };
}
