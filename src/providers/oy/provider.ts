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
import { toOyPaymentMethod } from "../../core/canonical";
import { generateOyHeaders, verifyOyWebhook } from "./signature";

export class OyProvider extends BasePaymentProvider {
  readonly name = "oy";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api-stg.oyindonesia.com/api"
      : "https://api.oyindonesia.com/api";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const username = config.clientKey || config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const oyMethod = toOyPaymentMethod(params.paymentMethod);
    const isDirect = !!oyMethod;

    const baseUrl = this.getBaseUrl(sandbox);
    const headers = generateOyHeaders(username, apiKey);

    try {
      if (isDirect && oyMethod.type === "va") {
        const url = `${baseUrl}/generate-static-va`;
        const payload = {
          partner_user_id: customer.email || orderId,
          bank_code: oyMethod.bank_code || "014",
          amount: integerAmount,
          is_open: false,
          username: customer.name,
          trx_id: orderId,
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
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
            provider: "oy",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.status?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          provider: "oy",
          orderId: data.trx_id || orderId,
          amount: integerAmount,
          reference: data.va_number || orderId,
          vaNumber: data.va_number,
          vaBank: params.paymentMethod?.replace("_va", "").toLowerCase(),
          rawResponse: data,
        };
      } else if (isDirect && oyMethod.type === "qris") {
        const url = `${baseUrl}/qris/create-transaction`;
        const payload = {
          partner_tx_id: orderId,
          amount: integerAmount,
          customer_name: customer.name,
          customer_email: customer.email,
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
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
            provider: "oy",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.status?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          provider: "oy",
          orderId: data.partner_tx_id || orderId,
          amount: integerAmount,
          reference: data.tx_id || orderId,
          qrString: data.qr_string,
          qrCodeUrl: data.qr_url,
          rawResponse: data,
        };
      } else {
        // Semi Integrasi (Payment Checkout Link v2)
        const url = `${baseUrl}/payment-checkout/create-v2`;
        const payload = {
          description: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
          partner_tx_id: orderId,
          notes: productDetails,
          sender_name: customer.name,
          amount: integerAmount,
          email: customer.email,
          phone_number: customer.phone || "",
          is_open: false,
          step: "input-details",
          include_admin_fee: false,
          return_url: returnUrl || config.returnUrl || "",
          ...params.providerParams,
        };

        const response = await fetch(url, {
          method: "POST",
          headers,
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
            provider: "oy",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.status?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        return {
          success: true,
          provider: "oy",
          orderId: data.partner_tx_id || orderId,
          amount: integerAmount,
          reference: data.tx_id || orderId,
          paymentUrl: data.url,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "oy",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to OY! Bisnis API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const username = config.clientKey || config.merchantCode || config.merchantId || config.extra?.username || "";

    const orderId = body.partner_tx_id || body.partner_trx_id || body.trx_id || "";
    const amount = body.amount || body.settlement_amount || 0;
    const rawStatus = (body.status || body.tx_status || "").toUpperCase();

    const isPaid = rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED" || rawStatus === "COMPLETE";
    const isPending = rawStatus === "PENDING" || rawStatus === "WAITING_PAYMENT";
    const isExpired = rawStatus === "EXPIRED";
    const isFailed = rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";
    const headers = config.extra?.headers || {};
    const oyUsernameHeader = headers["x-oy-username"] || headers["X-Oy-Username"] || config.extra?.oyUsername;

    let isValid = true;
    if (oyUsernameHeader || (username && headers && Object.keys(headers).length > 0)) {
      isValid = verifyOyWebhook(headers, username);
    }

    return {
      isValid,
      provider: "oy",
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
        paymentName: "BCA Virtual Account (014)",
        paymentImage: "https://business.oyindonesia.com/assets/images/bca.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account (008)",
        paymentImage: "https://business.oyindonesia.com/assets/images/mandiri.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account (009)",
        paymentImage: "https://business.oyindonesia.com/assets/images/bni.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account (002)",
        paymentImage: "https://business.oyindonesia.com/assets/images/bri.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account (013)",
        paymentImage: "https://business.oyindonesia.com/assets/images/permata.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account (022)",
        paymentImage: "https://business.oyindonesia.com/assets/images/cimb.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "danamon_va",
        paymentName: "Danamon Virtual Account (011)",
        paymentImage: "https://business.oyindonesia.com/assets/images/danamon.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account (451)",
        paymentImage: "https://business.oyindonesia.com/assets/images/bsi.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (OY!)",
        paymentImage: "https://business.oyindonesia.com/assets/images/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO",
        paymentImage: "https://business.oyindonesia.com/assets/images/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA",
        paymentImage: "https://business.oyindonesia.com/assets/images/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay",
        paymentImage: "https://business.oyindonesia.com/assets/images/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "linkaja",
        code: "linkaja",
        paymentName: "LinkAja",
        paymentImage: "https://business.oyindonesia.com/assets/images/linkaja.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart",
        paymentImage: "https://business.oyindonesia.com/assets/images/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://business.oyindonesia.com/assets/images/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card",
        paymentImage: "https://business.oyindonesia.com/assets/images/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
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
      provider: "oy",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const username = config.clientKey || config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const url = `${this.getBaseUrl(sandbox)}/payment-checkout/status?partner_tx_id=${encodeURIComponent(merchantOrderId)}&send_callback=false`;
    const headers = generateOyHeaders(username, apiKey);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false,
          provider: "oy",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.status?.message || `HTTP error! Status: ${response.status}`,
          error: data?.status?.message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const txStatus = (data.status || data.tx_status || "").toUpperCase();
      const isPaid = txStatus === "SUCCESS" || txStatus === "PAID" || txStatus === "SETTLED" || txStatus === "COMPLETE";
      const isPending = txStatus === "PENDING" || txStatus === "WAITING_PAYMENT";
      const isExpired = txStatus === "EXPIRED";
      const isFailed = !isPaid && !isPending && !isExpired;

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "oy",
        orderId: data.partner_tx_id || merchantOrderId,
        reference: data.tx_id || "",
        amount: data.amount ? Number(data.amount) : 0,
        statusCode: txStatus,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.status?.message || data.status || "",
        paymentType: data.payment_method,
        transactionTime: data.created ? new Date(data.created) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "oy",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in OY! Bisnis",
        error: e.message || "Failed to check transaction status in OY! Bisnis",
        rawResponse: null,
      };
    }
  }
}
