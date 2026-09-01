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
import { toDokuPaymentMethod } from "../../core/canonical";
import { generateDokuHeaders, verifyDokuWebhookSignature } from "./signature";

export class DokuProvider extends BasePaymentProvider {
  readonly name = "doku";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api-sandbox.doku.com"
      : "https://api.doku.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const dokuMethod = toDokuPaymentMethod(params.paymentMethod);
    const isDirect = !!dokuMethod;

    const baseUrl = this.getBaseUrl(sandbox);

    try {
      if (isDirect) {
        // Direct Payment API (Jokul v2)
        const endpoint = dokuMethod.endpoint;
        const url = `${baseUrl}${endpoint}`;

        let payload: any;
        if (dokuMethod.type === "va") {
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            virtual_account_info: {
              expired_time: 1440,
              reusable_status: false,
              info1: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
            },
            customer: {
              name: customer.name,
              email: customer.email,
            },
            ...params.providerParams,
          };
        } else if (dokuMethod.type === "qris") {
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            qris_info: {
              expired_time: 1440,
            },
            ...params.providerParams,
          };
        } else if (dokuMethod.type === "cstore") {
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            online_info: {
              expired_time: 1440,
              reusable_status: false,
              info1: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
            },
            customer: {
              name: customer.name,
              email: customer.email,
            },
            ...params.providerParams,
          };
        } else {
          // E-Wallet
          payload = {
            order: {
              invoice_number: orderId,
              amount: integerAmount,
            },
            customer: {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            },
            ...params.providerParams,
          };
        }

        const headers = generateDokuHeaders(clientId, secretKey, endpoint, payload);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
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
            provider: "doku",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.error?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        const res: InvoiceResponse = {
          success: true,
          provider: "doku",
          orderId: data.order?.invoice_number || orderId,
          amount: data.order?.amount || integerAmount,
          reference: data.virtual_account_info?.virtual_account_number || data.order?.invoice_number || orderId,
          rawResponse: data,
        };

        if (data.virtual_account_info) {
          res.vaNumber = data.virtual_account_info.virtual_account_number;
          res.vaBank = dokuMethod.bank;
          res.paymentUrl = data.virtual_account_info.how_to_pay_page;
          if (data.virtual_account_info.expired_date) {
            res.expiresAt = new Date(data.virtual_account_info.expired_date);
          }
        } else if (data.qris_info) {
          res.qrString = data.qris_info.qr_content;
          res.qrCodeUrl = data.qris_info.qr_image_url;
        } else if (data.online_info) {
          res.paymentCode = data.online_info.payment_code;
          res.paymentUrl = data.online_info.how_to_pay_page;
        } else if (data.payment_instruction) {
          res.deeplink = data.payment_instruction.url || data.payment_instruction.deeplink;
          res.paymentUrl = res.deeplink;
        }

        return res;
      } else {
        // Semi Integrasi (Jokul Checkout v1)
        const endpoint = "/checkout/v1/payment";
        const url = `${baseUrl}${endpoint}`;

        const payload = {
          order: {
            invoice_number: orderId,
            amount: integerAmount,
            callback_url: returnUrl || config.returnUrl || "",
            line_items: [
              {
                name: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
                price: integerAmount,
                quantity: 1,
              },
            ],
          },
          payment: {
            payment_due_date: 60,
          },
          customer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone || "",
          },
          ...params.providerParams,
        };

        const headers = generateDokuHeaders(clientId, secretKey, endpoint, payload);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
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
            provider: "doku",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data?.error?.message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
          };
        }

        const checkoutUrl = data.response?.payment?.url || data.payment?.url || data.url;

        return {
          success: true,
          provider: "doku",
          orderId: data.response?.order?.invoice_number || orderId,
          amount: data.response?.order?.amount || integerAmount,
          reference: data.response?.order?.invoice_number || orderId,
          paymentUrl: checkoutUrl,
          rawResponse: data,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to DOKU API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const rawStatus = (body.transaction?.status || body.status || "").toUpperCase();

    const isPaid = rawStatus === "SUCCESS" || rawStatus === "PAID" || rawStatus === "SETTLED";
    const isPending = rawStatus === "PENDING";
    const isExpired = rawStatus === "EXPIRED";
    const isFailed = rawStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

    const orderId = body.order?.invoice_number || body.invoice_number || body.order_id || "";
    const amount = body.order?.amount || body.amount || 0;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";

    return {
      isValid: true,
      provider: "doku",
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
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bca.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/mandiri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bni.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/permata.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/cimb.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "danamon_va",
        paymentName: "Danamon Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/danamon.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/bsi.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (GoPay, ShopeePay, DANA, OVO, LinkAja)",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart / Alfa Group",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (Visa, Mastercard, JCB)",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "kredivo",
        code: "kredivo",
        paymentName: "Kredivo Paylater",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/kredivo.png",
        totalFee: "2.3%",
        category: "Paylater / Cicilan",
      },
      {
        paymentMethod: "akulaku",
        code: "akulaku",
        paymentName: "Akulaku Paylater",
        paymentImage: "https://sandbox.doku.com/jokul/assets/images/akulaku.png",
        totalFee: "1.7%",
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
      provider: "doku",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const clientId = config.merchantCode || config.merchantId || config.clientKey || "";
    const secretKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const endpoint = `/orders/v1/status/${merchantOrderId}`;
    const url = `${this.getBaseUrl(sandbox)}${endpoint}`;
    const headers = generateDokuHeaders(clientId, secretKey, endpoint);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false,
          provider: "doku",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.error?.message || `HTTP error! Status: ${response.status}`,
          error: data?.error?.message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const txStatus = (data.transaction?.status || data.status || "").toUpperCase();
      const isPaid = txStatus === "SUCCESS" || txStatus === "PAID" || txStatus === "SETTLED";
      const isPending = txStatus === "PENDING";
      const isExpired = txStatus === "EXPIRED";
      const isFailed = txStatus === "FAILED" || (!isPaid && !isPending && !isExpired);

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "doku",
        orderId: data.order?.invoice_number || merchantOrderId,
        reference: data.transaction?.id || data.order?.invoice_number || "",
        amount: data.order?.amount ? Number(data.order.amount) : 0,
        statusCode: txStatus,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.transaction?.status || "",
        paymentType: data.service?.id,
        transactionTime: data.transaction?.date ? new Date(data.transaction.date) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "doku",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in DOKU",
        error: e.message || "Failed to check transaction status in DOKU",
        rawResponse: null,
      };
    }
  }
}
