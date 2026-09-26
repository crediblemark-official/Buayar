import { BasePaymentProvider } from "../base";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
  PaymentMethod,
} from "../../types";
import { toXenditPaymentMethod } from "../../core/canonical";
import { getXenditAuthHeader, verifyXenditWebhookToken } from "./signature";
import { httpFetch } from "../../utils/http";
import { assertKeyMatchesEnvironment, XENDIT_KEY_RULE } from "../../utils/environment";

/**
 * Normalisasi nomor telepon ke E.164 (Xendit mewajibkan format ini).
 * Nomor lokal Indonesia (`0812...`) → `+62812...`. Nomor yang tidak dikenali
 * dikembalikan sebagai `undefined` agar tidak mengirim nilai tidak valid.
 */
function toE164(phone?: string): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.replace(/[\s()-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("0")) return `+62${trimmed.slice(1)}`;
  if (trimmed.startsWith("62")) return `+${trimmed}`;
  return trimmed.length >= 8 ? `+${trimmed}` : undefined;
}

export class XenditProvider extends BasePaymentProvider {
  readonly name = "xendit";

  private getBaseUrl() {
    return "https://api.xendit.co";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    // Xendit memakai satu host (`api.xendit.co`) untuk test & live; yang
    // membedakan hanya kunci `xnd_development_` vs `xnd_production_`.
    assertKeyMatchesEnvironment("Xendit", apiKey, config.sandbox, XENDIT_KEY_RULE);
    const integerAmount = Math.round(amount);

    const xenditMethod = toXenditPaymentMethod(params.paymentMethod);
    const isDirect = !!xenditMethod;

    const authHeader = getXenditAuthHeader(apiKey);

    try {
      if (isDirect) {
        // Direct API — Payments API v3 (`POST /v3/payment_requests`).
        // Set `config.extra.xenditApiVersion = "v2"` untuk kembali ke skema generik v2.
        const useV2 = String(config.extra?.xenditApiVersion || "").toLowerCase() === "v2";
        const apiVersion = String(config.extra?.apiVersion || "2024-11-11");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const redirectUrl = returnUrl || config.returnUrl || "";
        const isVa = xenditMethod.type === "VIRTUAL_ACCOUNT";
        const isOtc = xenditMethod.type === "OVER_THE_COUNTER";
        const isEwallet = xenditMethod.type === "EWALLET";
        const isOvo = String(xenditMethod.channel_code || "").toUpperCase() === "OVO";
        const mobile = toE164(customer.phone);
        // Kode kanal v2 memakai kode polos (mis. "BCA"); v3 memakai sufiks khusus
        // untuk VA (mis. "BCA_VIRTUAL_ACCOUNT") dan "CARDS" untuk kartu.
        const channelCode = xenditMethod.type === "CARD" ? "CARDS" : xenditMethod.channel_code;

        // ── channel_properties v2 (penamaan legacy) ───────────────────────────
        const channelProperties: Record<string, any> = {};
        if (isVa || isOtc) {
          channelProperties.customer_name = customer.name;
          channelProperties.expires_at = expiresAt;
        } else if (isEwallet) {
          // OVO (v2) mewajibkan `mobile_number`; tanpa itu gateway menolak.
          if (isOvo && mobile) channelProperties.mobile_number = mobile;
          // Xendit mewajibkan success_return_url; failure_return_url disarankan.
          // Jangan kirim string kosong (ditolak validasi URL).
          if (redirectUrl) {
            channelProperties.success_return_url = redirectUrl;
            channelProperties.failure_return_url = redirectUrl;
          }
        }

        // ── channel_code/type/channel_properties v3 ──────────────────────────
        // Diverifikasi live (2026-09-26) terhadap sandbox Xendit:
        //   • VA  : channel_code `<BANK>_VIRTUAL_ACCOUNT` + channel_properties.display_name
        //           (mengirim "BCA"/`customer_name` → API_VALIDATION_ERROR)
        //   • OTC : type `REUSABLE_PAYMENT_CODE` + channel_properties.payer_name
        //   • OVO : channel_properties.account_mobile_number wajib
        const v3ChannelCode = isVa ? `${xenditMethod.channel_code}_VIRTUAL_ACCOUNT` : channelCode;
        const v3Type = isOtc ? "REUSABLE_PAYMENT_CODE" : "PAY";
        const v3ChannelProperties: Record<string, any> = {};
        if (isVa) {
          v3ChannelProperties.display_name = customer.name;
          v3ChannelProperties.expires_at = expiresAt;
        } else if (isOtc) {
          v3ChannelProperties.payer_name = customer.name;
        } else if (isEwallet) {
          if (isOvo && mobile) v3ChannelProperties.account_mobile_number = mobile;
          if (redirectUrl) {
            v3ChannelProperties.success_return_url = redirectUrl;
            v3ChannelProperties.failure_return_url = redirectUrl;
          }
        }

        const url = useV2
          ? `${this.getBaseUrl()}/payment_requests`
          : `${this.getBaseUrl()}/v3/payment_requests`;

        const customerId = params.providerParams?.customer_id;
        const payload: any = useV2
          ? {
              currency: params.currency || "IDR",
              amount: integerAmount,
              reference_id: orderId,
              description: productDetails,
              ...(customerId ? { customer_id: customerId } : {}),
              payment_method: {
                type: xenditMethod.type,
                reusability: "ONE_TIME_USE",
                ...(xenditMethod.type === "VIRTUAL_ACCOUNT"
                  ? { virtual_account: { channel_code: channelCode, channel_properties: channelProperties } }
                  : xenditMethod.type === "QR_CODE"
                    ? { qr_code: { channel_code: "QRIS" } }
                    : xenditMethod.type === "EWALLET"
                      ? { ewallet: { channel_code: channelCode, channel_properties: channelProperties } }
                      : xenditMethod.type === "OVER_THE_COUNTER"
                        ? { over_the_counter: { channel_code: channelCode, channel_properties: channelProperties } }
                        : {}),
              },
              ...params.providerParams,
            }
          : {
              reference_id: orderId,
              type: v3Type,
              country: config.extra?.country || "ID",
              currency: params.currency || "IDR",
              request_amount: integerAmount,
              description: productDetails,
              channel_code: v3ChannelCode,
              ...(Object.keys(v3ChannelProperties).length ? { channel_properties: v3ChannelProperties } : {}),
              // CATATAN: v3 MEMANG mendukung objek `customer` terstruktur (type INDIVIDUAL
              // + reference_id + individual_detail). Kami sengaja tidak mengisinya karena
              // `customer.reference_id` WAJIB alfanumerik (orderId umumnya mengandung `-`),
              // sehingga berisiko INVALID_CUSTOMER. Atribusi opsional lewat `customer_id`.
              ...(customerId ? { customer_id: customerId } : {}),
              ...params.providerParams,
            };

        const response = await httpFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
            ...(useV2 ? {} : { "api-version": apiVersion }),
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok || !data) {
          return {
            success: false,
            provider: "xendit",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.message || data?.error_code || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        const res: InvoiceResponse = {
          success: true,
          provider: "xendit",
          orderId: data.reference_id || orderId,
          // v3: request_amount; v2: amount
          amount: data.request_amount ?? data.amount ?? integerAmount,
          reference: data.id,
          rawResponse: data,
        };

        // Parser respons kompatibel dua versi:
        // - v2: properti kanal ada di `payment_method.{type}.channel_properties`
        // - v3: properti kanal ada di `channel_properties` / `actions[]`
        //       (type: REDIRECT_CUSTOMER | PRESENT_TO_CUSTOMER)
        const pm = data.payment_method || {};
        const topProps = data.channel_properties || {};
        const actions: any[] = Array.isArray(data.actions) ? data.actions : [];
        const presentAction = actions.find((a: any) => a.type === "PRESENT_TO_CUSTOMER");
        const redirectAction = actions.find((a: any) => a.type === "REDIRECT_CUSTOMER");
        const legacyAction = (name: string) => actions.find((a: any) => a.action === name)?.value;

        const resolvedType = pm.type || (data.channel_code ? xenditMethod.type : undefined);

        if (resolvedType === "VIRTUAL_ACCOUNT" || xenditMethod.type === "VIRTUAL_ACCOUNT") {
          res.vaNumber =
            pm.virtual_account?.channel_properties?.virtual_account_number ||
            pm.channel_properties?.virtual_account_number ||
            topProps.virtual_account_number ||
            presentAction?.value ||
            legacyAction("AUTH");
          res.vaBank = String(
            pm.virtual_account?.channel_code ||
              pm.channel_code ||
              data.channel_code ||
              xenditMethod.channel_code ||
              ""
          )
            .toLowerCase()
            // v3 mengembalikan `bca_virtual_account`; normalisasi ke `bca` agar seragam v2.
            .replace(/_virtual_account$/, "");
          const exp = pm.virtual_account?.channel_properties?.expires_at || pm.channel_properties?.expires_at || topProps.expires_at;
          if (exp) {
            res.expiresAt = new Date(exp);
          }
        } else if (resolvedType === "QR_CODE" || xenditMethod.type === "QR_CODE") {
          res.qrString =
            pm.qr_code?.channel_properties?.qr_string ||
            pm.channel_properties?.qr_string ||
            topProps.qr_string ||
            actions.find((a: any) => a.qr_string)?.qr_string ||
            presentAction?.value;
          res.qrCodeUrl = actions.find((a: any) => a.url)?.url || redirectAction?.value;
        } else if (resolvedType === "OVER_THE_COUNTER" || xenditMethod.type === "OVER_THE_COUNTER") {
          res.paymentCode =
            pm.over_the_counter?.channel_properties?.payment_code ||
            pm.channel_properties?.payment_code ||
            topProps.payment_code ||
            presentAction?.value;
        } else if (resolvedType === "EWALLET" || xenditMethod.type === "EWALLET") {
          res.deeplink =
            actions.find((a: any) => a.url_type === "DEEPLINK")?.url ||
            actions.find((a: any) => a.descriptor === "DEEPLINK")?.value ||
            redirectAction?.value ||
            actions[0]?.url;
          res.paymentUrl = actions.find((a: any) => a.url_type === "WEB")?.url || res.deeplink;
        }

        return res;
      } else {
        // Semi Integrasi. Default: **Payment Sessions** (`POST /sessions`, mode PAYMENT_LINK) —
        // ini pengganti resmi Invoice v2 yang kini berstatus legacy. Set
        // `config.extra.xenditRedirect = "invoice"` untuk fallback ke `/v2/invoices`.
        const redirectTarget = String(config.extra?.xenditRedirect || "sessions").toLowerCase();
        const returnUrlResolved = returnUrl || config.returnUrl || "";

        if (redirectTarget === "invoice") {
          const url = `${this.getBaseUrl()}/v2/invoices`;
          const payload = {
            external_id: orderId,
            amount: integerAmount,
            description: productDetails,
            payer_email: customer.email,
            customer: {
              given_names: customer.name,
              email: customer.email,
              mobile_number: toE164(customer.phone) || "",
            },
            success_redirect_url: returnUrlResolved,
            failure_redirect_url: returnUrlResolved,
            ...params.providerParams,
          };

          const response = await httpFetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
            },
            body: JSON.stringify(payload),
          });

          const text = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(text);
          } catch (e) {}

          if (!response.ok || !data) {
            return {
              success: false,
              provider: "xendit",
              orderId,
              amount: integerAmount,
              rawResponse: data,
              error: data?.message || data?.error_code || `HTTP error! Status: ${response.status} - ${text}`,
            };
          }

          return {
            success: true,
            provider: "xendit",
            orderId: data.external_id || orderId,
            amount: data.amount || integerAmount,
            reference: data.id,
            paymentUrl: data.invoice_url,
            expiresAt: data.expiry_date ? new Date(data.expiry_date) : undefined,
            rawResponse: data,
          };
        }

        // Payment Sessions — hosted checkout.
        const url = `${this.getBaseUrl()}/sessions`;
        const mobile = toE164(customer.phone);
        const customerRef = orderId.replace(/[^a-zA-Z0-9]/g, "") || `cust${Date.now()}`;
        const payload: any = {
          reference_id: orderId,
          session_type: "PAY",
          mode: "PAYMENT_LINK",
          amount: integerAmount,
          currency: params.currency || "IDR",
          country: config.extra?.country || "ID",
          description: productDetails,
          ...(returnUrlResolved
            ? { success_return_url: returnUrlResolved, cancel_return_url: returnUrlResolved }
            : {}),
          customer: {
            reference_id: customerRef,
            type: "INDIVIDUAL",
            email: customer.email,
            ...(mobile ? { mobile_number: mobile } : {}),
            individual_detail: {
              // Xendit: alfanumerik, tanpa karakter khusus.
              given_names:
                (customer.name.split(" ")[0] || customer.name).replace(/[^a-zA-Z0-9]/g, "") || "Customer",
            },
          },
          ...params.providerParams,
        };

        const response = await httpFetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (e) {}

        if (!response.ok || !data) {
          return {
            success: false,
            provider: "xendit",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.message || data?.error_code || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          provider: "xendit",
          orderId: data.reference_id || orderId,
          amount: data.amount || integerAmount,
          reference: data.payment_session_id || data.id,
          paymentUrl: data.payment_link_url || data.checkout_url,
          expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "xendit",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Xendit API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const rawStatus = (body.status || body.data?.status || "").toUpperCase();
    const event = body.event || "";

    const webhookToken = config.extra?.webhookToken;
    const headerToken =
      config.extra?.callbackToken ||
      config.extra?.headers?.["x-callback-token"] ||
      config.extra?.headers?.["X-Callback-Token"];

    // SECURITY: default false — tanpa token, webhook ditolak.
    let isValid = false;
    let error: string | undefined;
    if (!webhookToken) {
      error =
        "Xendit webhook token not configured. Set BUAYAR_WEBHOOK_TOKEN (or config.extra.webhookToken) so the x-callback-token header can be verified.";
    } else if (!headerToken) {
      error = "Missing x-callback-token header; Xendit webhook cannot be authenticated.";
    } else {
      isValid = verifyXenditWebhookToken(headerToken, webhookToken);
      if (!isValid) error = "x-callback-token header does not match configured Xendit webhook token.";
    }

    const orderId = body.external_id || body.reference_id || body.data?.reference_id || body.id || "";
    const amount = body.paid_amount || body.amount || body.data?.amount || 0;

    // Status hanya dipercaya bila token cocok (cegah `isPaid: true` + `isValid: false`).
    const isPaid =
      isValid && (rawStatus === "PAID" || rawStatus === "SETTLED" || rawStatus === "SUCCEEDED" || event === "payment.succeeded");
    const isPending = isValid && rawStatus === "PENDING";
    const isExpired = isValid && rawStatus === "EXPIRED";
    const isFailed = !isValid || rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const status: "paid" | "pending" | "failed" | "expired" = !isValid
      ? "failed"
      : isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

    return {
      isValid,
      provider: "xendit",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: rawStatus,
      rawPayload: body,
      error,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account",
        paymentImage: "https://xendit.co/icons/bca.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account",
        paymentImage: "https://xendit.co/icons/mandiri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://xendit.co/icons/bni.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://xendit.co/icons/bri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://xendit.co/icons/permata.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: "https://xendit.co/icons/cimb.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://xendit.co/icons/bsi.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (GoPay, ShopeePay, DANA, OVO)",
        paymentImage: "https://xendit.co/icons/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "gopay",
        code: "gopay",
        paymentName: "GoPay",
        paymentImage: "https://xendit.co/icons/gopay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO",
        paymentImage: "https://xendit.co/icons/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA",
        paymentImage: "https://xendit.co/icons/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay",
        paymentImage: "https://xendit.co/icons/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart",
        paymentImage: "https://xendit.co/icons/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://xendit.co/icons/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (Visa, Mastercard)",
        paymentImage: "https://xendit.co/icons/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "kredivo",
        code: "kredivo",
        paymentName: "Kredivo Paylater",
        paymentImage: "https://xendit.co/icons/kredivo.png",
        totalFee: "2.3%",
        category: "Paylater / Cicilan",
      },
    ];

    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    // Xendit memakai satu host (`api.xendit.co`) untuk test & live; yang
    // membedakan hanya kunci `xnd_development_` vs `xnd_production_`.
    assertKeyMatchesEnvironment("Xendit", apiKey, config.sandbox, XENDIT_KEY_RULE);
    if (apiKey) {
      try {
        const authHeader = getXenditAuthHeader(apiKey);
        const response = await httpFetch(`${this.getBaseUrl()}/payment_channels`, {
          method: "GET",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const channels = await response.json();
          if (Array.isArray(channels) && channels.length > 0) {
            const dynamicMethods: PaymentMethod[] = [];
            for (const ch of channels) {
              if (ch.status && ch.status !== "ACTIVE") continue;

              const codeLower = (ch.channel_code || "").toLowerCase();
              let canonicalCode = codeLower;
              let category: "Virtual Account" | "QRIS" | "E-Wallet" | "Retail / Gerai" | "Kartu Kredit" | "Paylater / Cicilan" | "Lainnya" = "Virtual Account";

              if (ch.type === "BANK_TRANSFER" || codeLower.endsWith("_va") || ["bca", "bni", "bri", "mandiri", "permata", "cimb", "bsi"].includes(codeLower)) {
                canonicalCode = codeLower.endsWith("_va") ? codeLower : `${codeLower}_va`;
                category = "Virtual Account";
              } else if (ch.type === "EWALLET" || ["ovo", "dana", "linkaja", "shopeepay", "gopay"].includes(codeLower)) {
                canonicalCode = codeLower;
                category = "E-Wallet";
              } else if (ch.type === "QR_CODE" || codeLower === "qris") {
                canonicalCode = "qris";
                category = "QRIS";
              } else if (ch.type === "RETAIL_OUTLET" || ["alfamart", "indomaret"].includes(codeLower)) {
                canonicalCode = codeLower;
                category = "Retail / Gerai";
              } else if (ch.type === "CARD") {
                canonicalCode = "credit_card";
                category = "Kartu Kredit";
              } else if (ch.type === "PAYLATER" || ["kredivo", "akulaku", "indodana"].includes(codeLower)) {
                canonicalCode = codeLower;
                category = "Paylater / Cicilan";
              }

              dynamicMethods.push({
                paymentMethod: canonicalCode,
                code: ch.channel_code || canonicalCode,
                paymentName: ch.display_name || ch.name || ch.channel_code,
                paymentImage: `https://xendit.co/icons/${codeLower}.png`,
                totalFee: ch.fee ? `${ch.fee}` : "",
                category,
                coming_soon: false,
                extra: ch,
              });
            }

            if (dynamicMethods.length > 0) {
              const categories: Record<string, PaymentMethod[]> = {};
              for (const item of dynamicMethods) {
                if (!categories[item.category]) categories[item.category] = [];
                categories[item.category].push(item);
              }
              return {
                success: true,
                provider: "xendit",
                methods: dynamicMethods,
                categories,
                rawResponse: channels,
              };
            }
          }
        }
      } catch (e) {
        // Fallback ke staticMethods jika request gagal atau offline
      }
    }

    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of staticMethods) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    return {
      success: true,
      provider: "xendit",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{
    success: boolean;
    enabled: string[];
    source?: "live" | "static";
    error?: string;
  }> {
    try {
      // Xendit mengekspos `GET /payment_channels` — daftar channel yang terdaftar/
      // aktif untuk akun merchant. Bila endpoint ini berhasil, hasilnya **LIVE**;
      // bila gagal (mis. tanpa izin/offline) kita jatuh ke katalog statis SDK dan
      // WAJIB menandainya `source: "static"` agar tidak disalahartikan sebagai
      // "channel yang benar-benar aktif di akun ini".
      const res = await this.getPaymentMethods({ amount: 10000 }, config);
      const raw = res.rawResponse;
      const isLive =
        Array.isArray(raw) &&
        raw.length > 0 &&
        typeof raw[0] === "object" &&
        raw[0] !== null &&
        "channel_code" in raw[0];
      const source: "live" | "static" = isLive ? "live" : "static";
      if (res.success && res.methods) {
        return {
          success: true,
          enabled: res.methods.map((m) => m.paymentMethod),
          source,
        };
      }
      return {
        success: false,
        enabled: [],
        source,
        error: res.error || "Failed to probe Xendit payment methods",
      };
    } catch (e: any) {
      return {
        success: false,
        enabled: [],
        source: "static",
        error: e.message || "Failed to probe Xendit payment methods",
      };
    }
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId, transactionId } = params;
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    // Xendit memakai satu host (`api.xendit.co`) untuk test & live; yang
    // membedakan hanya kunci `xnd_development_` vs `xnd_production_`.
    assertKeyMatchesEnvironment("Xendit", apiKey, config.sandbox, XENDIT_KEY_RULE);
    const authHeader = getXenditAuthHeader(apiKey);

    try {
      // Payment Sessions (`ps-...`) adalah jalur semi-integrasi saat ini.
      const sessionId =
        (transactionId && transactionId.startsWith("ps-") ? transactionId : "") ||
        (merchantOrderId && merchantOrderId.startsWith("ps-") ? merchantOrderId : "");
      if (sessionId) {
        const sessionRes = await httpFetch(`${this.getBaseUrl()}/sessions/${sessionId}`, {
          method: "GET",
          headers: { "Authorization": authHeader },
        });
        const session: any = await sessionRes.json().catch(() => null);
        if (sessionRes.ok && session) {
          const sessionStatus = String(session.status || "").toUpperCase();
          const paid = sessionStatus === "COMPLETED";
          const expired = sessionStatus === "EXPIRED";
          return {
            success: true,
            provider: "xendit",
            orderId: session.reference_id || merchantOrderId,
            reference: session.payment_session_id || sessionId,
            amount: Number(session.amount || 0),
            statusCode: sessionStatus,
            status: paid ? "paid" : expired ? "expired" : "pending",
            isPaid: paid,
            isPending: !paid && !expired,
            isFailed: false,
            isExpired: expired,
            statusMessage: sessionStatus,
            paymentType: session.payment_request_id,
            rawResponse: session,
          };
        }
      }

      // Fallback legacy: query Invoice v2 via external_id.
      let url = `${this.getBaseUrl()}/v2/invoices?external_id=${merchantOrderId}`;
      let response = await httpFetch(url, {
        method: "GET",
        headers: { "Authorization": authHeader },
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch (e) {}

      let invoice = Array.isArray(data) && data.length > 0 ? data[0] : null;

      // Jika tidak ditemukan via external_id list, coba query langsung via invoice ID
      if (!invoice && merchantOrderId.startsWith("inv_")) {
        url = `${this.getBaseUrl()}/v2/invoices/${merchantOrderId}`;
        response = await httpFetch(url, {
          method: "GET",
          headers: { "Authorization": authHeader },
        });
        invoice = await response.json();
      }

      if (!invoice) {
        return {
          success: false,
          provider: "xendit",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: "404",
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: "Transaction not found",
          rawResponse: data,
        };
      }

      const rawStatus = (invoice.status || "").toUpperCase();
      const isPaid = rawStatus === "PAID" || rawStatus === "SETTLED";
      const isPending = rawStatus === "PENDING";
      const isExpired = rawStatus === "EXPIRED";
      const isFailed = rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "xendit",
        orderId: invoice.external_id || merchantOrderId,
        reference: invoice.id || "",
        amount: invoice.amount ? Number(invoice.amount) : 0,
        statusCode: rawStatus,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: invoice.status || "",
        paymentType: invoice.payment_method,
        transactionTime: invoice.paid_at ? new Date(invoice.paid_at) : undefined,
        rawResponse: invoice,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "xendit",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Xendit",
        error: e.message || "Failed to check transaction status in Xendit",
        rawResponse: null,
      };
    }
  }
}
