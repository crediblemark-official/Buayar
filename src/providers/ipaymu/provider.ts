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
import { toIpaymuPaymentMethod } from "../../core/canonical";
import { generateIpaymuSignature, verifyIpaymuCallback } from "./signature";

export class IpaymuProvider extends BasePaymentProvider {
  readonly name = "ipaymu";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://sandbox.ipaymu.com/api/v2"
      : "https://my.ipaymu.com/api/v2";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const va = config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const ipaymuMethod = toIpaymuPaymentMethod(params.paymentMethod);
    const isDirect = !!ipaymuMethod;

    const baseUrl = this.getBaseUrl(sandbox);
    const endpoint = isDirect ? "/payment/direct" : "/payment";
    const url = `${baseUrl}${endpoint}`;

    let payload: any;
    if (isDirect) {
      payload = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        amount: integerAmount,
        notifyUrl: callbackUrl || config.callbackUrl || "",
        expired: 24,
        expiredType: "hours",
        comments: productDetails,
        referenceId: orderId,
        paymentMethod: ipaymuMethod.paymentMethod,
        ...(ipaymuMethod.paymentChannel ? { paymentChannel: ipaymuMethod.paymentChannel } : {}),
        ...params.providerParams,
      };
    } else {
      payload = {
        product: [productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails],
        qty: [1],
        price: [integerAmount],
        description: [productDetails],
        returnUrl: returnUrl || config.returnUrl || "",
        notifyUrl: callbackUrl || config.callbackUrl || "",
        cancelUrl: returnUrl || config.returnUrl || "",
        referenceId: orderId,
        buyerName: customer.name,
        buyerEmail: customer.email,
        buyerPhone: customer.phone || "",
        ...params.providerParams,
      };
    }

    const { signature, timestamp } = generateIpaymuSignature("POST", va, apiKey, payload);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "va": va,
          "signature": signature,
          "timestamp": timestamp,
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
          provider: "ipaymu",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.Message || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.Status === 200 || data.status === 200 || data.Status === "200") {
        const resData = data.Data || {};
        const res: InvoiceResponse = {
          success: true,
          provider: "ipaymu",
          orderId,
          amount: integerAmount,
          reference: resData.TransactionId ? String(resData.TransactionId) : String(resData.SessionId || ""),
          paymentUrl: resData.Url,
          rawResponse: data,
        };

        if (resData.PaymentNo) {
          if (ipaymuMethod?.paymentMethod === "va") {
            res.vaNumber = resData.PaymentNo;
            res.vaBank = ipaymuMethod.paymentChannel;
          } else if (ipaymuMethod?.paymentMethod === "cstore") {
            res.paymentCode = resData.PaymentNo;
          }
        }

        if (resData.QrString || resData.QrImage) {
          res.qrString = resData.QrString;
          res.qrCodeUrl = resData.QrImage || resData.QrTemplate;
        }

        if (resData.Expired) {
          res.expiresAt = new Date(resData.Expired);
        }

        return res;
      } else {
        return {
          success: false,
          provider: "ipaymu",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.Message || data.message || `iPaymu Error status: ${data.Status}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "ipaymu",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to iPaymu API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const { isPaid, isPending, isFailed } = verifyIpaymuCallback(body);
    const orderId = body.reference_id || body.referenceId || body.trx_id || "";
    const amount = body.amount || body.total || 0;

    return {
      isValid: true,
      provider: "ipaymu",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status: isPaid ? "paid" : isPending ? "pending" : "failed",
      isPaid,
      isPending,
      isFailed,
      isExpired: (body.status || "").toLowerCase() === "expired",
      statusCode: String(body.status_code || body.status || ""),
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/bca.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/mandiri.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/bni.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/bri.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/cimb.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/permata.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "danamon_va",
        paymentName: "Danamon Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/danamon.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://my.ipaymu.com/images/banks/bsi.png",
        totalFee: "IDR 3,500",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS (GoPay, ShopeePay, DANA, OVO, LinkAja)",
        paymentImage: "https://my.ipaymu.com/images/banks/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart",
        paymentImage: "https://my.ipaymu.com/images/banks/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://my.ipaymu.com/images/banks/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (Visa, Mastercard)",
        paymentImage: "https://my.ipaymu.com/images/banks/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "akulaku",
        code: "akulaku",
        paymentName: "Akulaku Paylater",
        paymentImage: "https://my.ipaymu.com/images/banks/akulaku.png",
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
      provider: "ipaymu",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const va = config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const url = `${this.getBaseUrl(sandbox)}/transaction`;
    const payload = { transactionId: merchantOrderId };
    const { signature, timestamp } = generateIpaymuSignature("POST", va, apiKey, payload);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "va": va,
          "signature": signature,
          "timestamp": timestamp,
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
          provider: "ipaymu",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.Message || `HTTP error! Status: ${response.status}`,
          error: data?.Message || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const txData = data.Data || {};
      const statusText = (txData.Status || txData.status || "").toString().toLowerCase();
      const isPaid = statusText === "berhasil" || statusText === "success" || txData.StatusCode === 1;
      const isPending = statusText === "pending" || txData.StatusCode === 0;
      const isFailed = !isPaid && !isPending;
      const isExpired = statusText === "expired";

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : isExpired
            ? "expired"
            : "failed";

      return {
        success: true,
        provider: "ipaymu",
        orderId: txData.ReferenceId || merchantOrderId,
        reference: String(txData.TransactionId || ""),
        amount: Number(txData.Amount || txData.Total) || 0,
        statusCode: String(txData.StatusCode || txData.Status || ""),
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: txData.StatusDesc || txData.Status || "",
        paymentType: txData.PaymentMethod || txData.Via,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "ipaymu",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in iPaymu",
        error: e.message || "Failed to check transaction status in iPaymu",
        rawResponse: null,
      };
    }
  }
}
