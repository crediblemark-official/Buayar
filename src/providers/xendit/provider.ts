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

export class XenditProvider extends BasePaymentProvider {
  readonly name = "xendit";

  private getBaseUrl() {
    return "https://api.xendit.co";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    const integerAmount = Math.round(amount);

    const xenditMethod = toXenditPaymentMethod(params.paymentMethod);
    const isDirect = !!xenditMethod;

    const authHeader = getXenditAuthHeader(apiKey);

    try {
      if (isDirect) {
        // Direct API (Payment Requests API v3)
        const url = `${this.getBaseUrl()}/payment_requests`;
        const paymentMethodPayload: any = {
          type: xenditMethod.type,
          reusability: "ONE_TIME_USE",
        };

        if (xenditMethod.type === "VIRTUAL_ACCOUNT") {
          paymentMethodPayload.virtual_account = {
            channel_code: xenditMethod.channel_code,
            channel_properties: {
              customer_name: customer.name,
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
          };
        } else if (xenditMethod.type === "QR_CODE") {
          paymentMethodPayload.qr_code = {
            channel_code: "QRIS",
          };
        } else if (xenditMethod.type === "EWALLET") {
          paymentMethodPayload.ewallet = {
            channel_code: xenditMethod.channel_code,
            channel_properties: {
              success_return_url: returnUrl || config.returnUrl || "",
            },
          };
        } else if (xenditMethod.type === "OVER_THE_COUNTER") {
          paymentMethodPayload.over_the_counter = {
            channel_code: xenditMethod.channel_code,
            channel_properties: {
              customer_name: customer.name,
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
          };
        }

        const payload = {
          currency: "IDR",
          amount: integerAmount,
          reference_id: orderId,
          description: productDetails,
          customer: {
            given_names: customer.name,
            email: customer.email,
            mobile_number: customer.phone || "",
          },
          payment_method: paymentMethodPayload,
          ...params.providerParams,
        };

        const response = await fetch(url, {
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

        const res: InvoiceResponse = {
          success: true,
          provider: "xendit",
          orderId: data.reference_id || orderId,
          amount: data.amount || integerAmount,
          reference: data.id,
          rawResponse: data,
        };

        // Extract direct properties from payment_method or actions
        const pm = data.payment_method || {};
        const actions = data.actions || [];

        if (pm.virtual_account || pm.type === "VIRTUAL_ACCOUNT") {
          res.vaNumber =
            pm.virtual_account?.channel_properties?.virtual_account_number ||
            pm.channel_properties?.virtual_account_number ||
            actions.find((a: any) => a.action === "AUTH")?.value;
          res.vaBank = (pm.virtual_account?.channel_code || pm.channel_code || xenditMethod?.channel_code || "").toLowerCase();
          const exp = pm.virtual_account?.channel_properties?.expires_at || pm.channel_properties?.expires_at;
          if (exp) {
            res.expiresAt = new Date(exp);
          }
        } else if (pm.qr_code || pm.type === "QR_CODE") {
          res.qrString =
            pm.qr_code?.channel_properties?.qr_string ||
            pm.channel_properties?.qr_string ||
            actions.find((a: any) => a.qr_string)?.qr_string;
          res.qrCodeUrl = actions.find((a: any) => a.url)?.url;
        } else if (pm.over_the_counter || pm.type === "OVER_THE_COUNTER") {
          res.paymentCode =
            pm.over_the_counter?.channel_properties?.payment_code ||
            pm.channel_properties?.payment_code;
        } else if (pm.ewallet || pm.type === "EWALLET") {
          res.deeplink = actions.find((a: any) => a.url_type === "DEEPLINK")?.url || actions[0]?.url;
          res.paymentUrl = actions.find((a: any) => a.url_type === "WEB")?.url || res.deeplink;
        }

        return res;
      } else {
        // Semi Integrasi (Invoice API v2)
        const url = `${this.getBaseUrl()}/v2/invoices`;
        const payload = {
          external_id: orderId,
          amount: integerAmount,
          description: productDetails,
          payer_email: customer.email,
          customer: {
            given_names: customer.name,
            email: customer.email,
            mobile_number: customer.phone || "",
          },
          success_redirect_url: returnUrl || config.returnUrl || "",
          failure_redirect_url: returnUrl || config.returnUrl || "",
          ...params.providerParams,
        };

        const response = await fetch(url, {
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

    const isPaid = rawStatus === "PAID" || rawStatus === "SETTLED" || rawStatus === "SUCCEEDED" || event === "payment.succeeded";
    const isPending = rawStatus === "PENDING";
    const isExpired = rawStatus === "EXPIRED";
    const isFailed = rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const orderId = body.external_id || body.reference_id || body.data?.reference_id || body.id || "";
    const amount = body.paid_amount || body.amount || body.data?.amount || 0;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";
    const webhookToken = config.extra?.webhookToken;
    const headerToken =
      config.extra?.callbackToken ||
      config.extra?.headers?.["x-callback-token"] ||
      config.extra?.headers?.["X-Callback-Token"];

    let isValid = true;
    if (webhookToken || headerToken) {
      isValid = verifyXenditWebhookToken(headerToken, webhookToken);
    }

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

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    const authHeader = getXenditAuthHeader(apiKey);

    try {
      // Coba query via external_id terlebih dahulu
      let url = `${this.getBaseUrl()}/v2/invoices?external_id=${merchantOrderId}`;
      let response = await fetch(url, {
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
        response = await fetch(url, {
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
