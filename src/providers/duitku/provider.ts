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
import { getPaymentMethodCategory } from "../../utils/category";
import { toDuitkuPaymentMethod, toCanonicalPaymentMethod } from "../../core/canonical";
import {
  getDuitkuInquirySignatures,
  verifyDuitkuCallbackSignature,
  getDuitkuPaymentMethodsSignature,
  getDuitkuStatusSignatures,
} from "./signature";

export class DuitkuProvider extends BasePaymentProvider {
  readonly name = "duitku";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api-sandbox.duitku.com"
      : "https://api-prod.duitku.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const merchantCode = config.merchantCode || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const duitkuMethod = toDuitkuPaymentMethod(params.paymentMethod);
    const isDirectInquiry = !!duitkuMethod;

    const url = isDirectInquiry
      ? (sandbox
        ? "https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry"
        : "https://passport.duitku.com/webapi/api/merchant/v2/inquiry")
      : `${this.getBaseUrl(sandbox)}/api/merchant/createInvoice`;

    const integerAmount = Math.round(amount);
    const { payloadSignature, timestamp, headerSignature } = getDuitkuInquirySignatures(
      merchantCode,
      orderId,
      integerAmount,
      apiKey
    );

    const payload = {
      merchantCode,
      paymentAmount: integerAmount,
      merchantOrderId: orderId,
      productDetails,
      email: customer.email,
      phoneNumber: customer.phone || "",
      signature: payloadSignature,
      callbackUrl: callbackUrl || config.callbackUrl || "",
      returnUrl: returnUrl || config.returnUrl || "",
      expiryPeriod: 1440,
      ...(duitkuMethod ? { paymentMethod: duitkuMethod } : {}),
      ...params.providerParams,
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      if (!isDirectInquiry) {
        headers["x-duitku-signature"] = headerSignature;
        headers["x-duitku-timestamp"] = timestamp;
        headers["x-duitku-merchantcode"] = merchantCode;
      }

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

      if (!response.ok) {
        return {
          success: false,
          provider: "duitku",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.Message || data?.statusMessage || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.statusCode === "00") {
        return {
          success: true,
          provider: "duitku",
          orderId,
          amount: integerAmount,
          paymentUrl: data.paymentUrl,
          reference: data.reference,
          vaNumber: data.vaNumber,
          vaBank: duitkuMethod ? toCanonicalPaymentMethod("duitku", duitkuMethod).replace("_va", "") : undefined,
          qrString: data.qrString,
          qrCodeUrl: data.qrCodeUrl,
          paymentCode: data.paymentCode,
          expiresAt: new Date(Date.now() + 1440 * 60 * 1000),
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          provider: "duitku",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.statusMessage || `Duitku Error: ${data.statusCode}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "duitku",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make inquiry request to Duitku",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const apiKey = config.apiKey || "";
    const merchantOrderId = body.merchantOrderId || "";
    const amount = body.amount || "";

    const isValid = verifyDuitkuCallbackSignature(body, apiKey);
    const isPaid = isValid && body.resultCode === "00";
    const isFailed = !isValid || body.resultCode !== "00";

    return {
      isValid,
      provider: "duitku",
      orderId: merchantOrderId,
      amount: amount ? Number(amount) : 0,
      status: isValid ? (isPaid ? "paid" : "failed") : "failed",
      isPaid,
      isPending: false,
      isFailed,
      isExpired: isValid && body.resultCode !== "00",
      statusCode: body.resultCode,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const amount = params?.amount ? Math.round(params.amount) : 10000;
    const merchantCode = config.merchantCode || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const url = sandbox
      ? "https://sandbox.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod"
      : "https://passport.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod";

    const datetime = new Date().toISOString().replace("T", " ").slice(0, 19);
    const signature = getDuitkuPaymentMethodsSignature(merchantCode, amount, datetime, apiKey);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantcode: merchantCode,
          amount,
          datetime,
          signature,
        }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false,
          provider: "duitku",
          methods: [],
          rawResponse: data,
          error: data?.responseMessage || `HTTP error! Status: ${response.status}`,
        };
      }

      if (data.responseCode === "00") {
        const rawMethods = data.paymentFee || [];
        const categories: Record<string, PaymentMethod[]> = {};

        const methods: PaymentMethod[] = rawMethods.map((m: any) => {
          const category = getPaymentMethodCategory(m.paymentMethod, m.paymentName);
          const canonicalCode = toCanonicalPaymentMethod("duitku", m.paymentMethod);
          const item: PaymentMethod = {
            paymentMethod: m.paymentMethod,
            paymentName: m.paymentName,
            paymentImage: m.paymentImage,
            totalFee: m.totalFee,
            category,
            code: canonicalCode,
            feeDetail: {
              flat: Number(m.totalFee) || 0,
              percent: 0,
              totalFee: Number(m.totalFee) || 0,
            },
          };

          if (!categories[category]) {
            categories[category] = [];
          }
          categories[category].push(item);

          return item;
        });

        return {
          success: true,
          provider: "duitku",
          methods,
          categories,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          provider: "duitku",
          methods: [],
          rawResponse: data,
          error: data.responseMessage || `Duitku Error: ${data.responseCode}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "duitku",
        methods: [],
        rawResponse: null,
        error: e.message || "Failed to get payment methods from Duitku",
      };
    }
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const merchantCode = config.merchantCode || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    const url = sandbox
      ? "https://api-sandbox.duitku.com/api/merchant/transactionStatus"
      : "https://api-prod.duitku.com/api/merchant/transactionStatus";

    const { timestamp, headerSignature, bodySignature } = getDuitkuStatusSignatures(merchantCode, merchantOrderId, apiKey);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-duitku-signature": headerSignature,
          "x-duitku-timestamp": timestamp,
          "x-duitku-merchantcode": merchantCode,
        },
        body: JSON.stringify({
          merchantCode,
          merchantOrderId,
          signature: bodySignature,
        }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {}

      if (!response.ok || !data) {
        return {
          success: false,
          provider: "duitku",
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

      const isPaid = data.statusCode === "00";
      const isPending = data.statusCode === "01";
      const isFailed = data.statusCode !== "00" && data.statusCode !== "01";
      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isPending
          ? "pending"
          : "failed";

      return {
        success: true,
        provider: "duitku",
        orderId: data.merchantOrderId || merchantOrderId,
        reference: data.reference || "",
        amount: data.amount ? Number(data.amount) : 0,
        statusCode: data.statusCode || "",
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired: isFailed,
        statusMessage: data.statusMessage || "",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "duitku",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Duitku",
        error: e.message || "Failed to check transaction status in Duitku",
        rawResponse: null,
      };
    }
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{ success: boolean; enabled: string[]; error?: string }> {
    try {
      const res = await this.getPaymentMethods({ amount: 10000 }, config);
      if (res.success && res.methods) {
        return {
          success: true,
          enabled: res.methods.map(m => m.paymentMethod),
        };
      }
      return {
        success: false,
        enabled: [],
        error: res.error || "Failed to probe Duitku payment methods",
      };
    } catch (e: any) {
      return {
        success: false,
        enabled: [],
        error: e.message,
      };
    }
  }
}
