import crypto from "crypto";
import { BasePaymentProvider } from "./base";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
} from "../types";
import { getPaymentMethodCategory } from "../utils";

export class DuitkuProvider extends BasePaymentProvider {
  readonly name = "duitku";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api-sandbox.duitku.com"
      : "https://api-prod.duitku.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const { merchantCode, apiKey, sandbox } = config;

    const isDirectInquiry = !!params.paymentMethod;
    const url = isDirectInquiry
      ? (sandbox
        ? "https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry"
        : "https://passport.duitku.com/webapi/api/merchant/v2/inquiry")
      : `${this.getBaseUrl(sandbox)}/api/merchant/createInvoice`;

    const integerAmount = Math.round(amount);

    // 1. Generate payload signature: md5(merchantCode + orderId + amount + apiKey)
    const rawPayloadSignature = merchantCode + orderId + integerAmount.toString() + apiKey;
    const payloadSignature = crypto.createHash("md5").update(rawPayloadSignature).digest("hex");

    // 2. Generate header signature: sha256(merchantCode + timestamp + apiKey)
    const timestamp = Date.now().toString();
    const rawHeaderSignature = merchantCode + timestamp + apiKey;
    const headerSignature = crypto.createHash("sha256").update(rawHeaderSignature).digest("hex");

    const payload = {
      merchantCode,
      paymentAmount: integerAmount,
      merchantOrderId: orderId,
      productDetails,
      email: customer.email,
      phoneNumber: customer.phone || "",
      signature: payloadSignature,
      callbackUrl,
      returnUrl,
      expiryPeriod: 1440, // 24 hours expiry
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
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
      } catch (e) { }

      if (!response.ok) {
        return {
          success: false,
          rawResponse: data,
          error: data?.Message || data?.statusMessage || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.statusCode === "00") {
        return {
          success: true,
          paymentUrl: data.paymentUrl,
          reference: data.reference,
          vaNumber: data.vaNumber,
          qrString: data.qrString,
          qrCodeUrl: data.qrCodeUrl,
          paymentCode: data.paymentCode,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          rawResponse: data,
          error: data.statusMessage || `Duitku Error: ${data.statusCode}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        rawResponse: null,
        error: e.message || "Failed to make inquiry request to Duitku",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const { apiKey } = config;

    // Callback parameters signature formula: md5(merchantCode + amount + merchantOrderId + apiKey)
    const merchantCode = body.merchantCode || "";
    const amount = body.amount || "";
    const merchantOrderId = body.merchantOrderId || "";
    const signature = body.signature || "";

    const rawSignature = merchantCode + amount + merchantOrderId + apiKey;
    const computedSignature = crypto.createHash("md5").update(rawSignature).digest("hex");

    const isValid = signature.toLowerCase() === computedSignature.toLowerCase();
    const isPaid = body.resultCode === "00";

    return {
      isValid,
      orderId: merchantOrderId,
      amount: amount ? Number(amount) : 0,
      status: isValid ? (isPaid ? "paid" : "failed") : "failed",
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const { amount } = params;
    const { merchantCode, apiKey, sandbox } = config;

    // Duitku uses different endpoints for v1 payment methods API
    const url = sandbox
      ? "https://sandbox.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod"
      : "https://passport.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod";

    const integerAmount = Math.round(amount);
    const datetime = new Date().toISOString().replace("T", " ").slice(0, 19); // "yyyy-MM-dd HH:mm:ss"

    // Signature: HMAC_SHA256(merchantCode + amount + datetime, apiKey)
    const stringToSign = merchantCode + integerAmount.toString() + datetime;
    const signature = crypto.createHmac("sha256", apiKey).update(stringToSign).digest("hex");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantcode: merchantCode,
          amount: integerAmount,
          datetime,
          signature,
        }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) { }

      if (!response.ok || !data) {
        return {
          success: false,
          methods: [],
          rawResponse: data,
          error: data?.responseMessage || `HTTP error! Status: ${response.status}`,
        };
      }

      if (data.responseCode === "00") {
        const rawMethods = data.paymentFee || [];
        const methods = rawMethods.map((m: any) => ({
          paymentMethod: m.paymentMethod,
          paymentName: m.paymentName,
          paymentImage: m.paymentImage,
          totalFee: m.totalFee,
          category: getPaymentMethodCategory(m.paymentMethod, m.paymentName),
        }));
        return {
          success: true,
          methods,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          methods: [],
          rawResponse: data,
          error: data.responseMessage || `Duitku Error: ${data.responseCode}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        methods: [],
        rawResponse: null,
        error: e.message || "Failed to get payment methods from Duitku",
      };
    }
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const { merchantCode, apiKey, sandbox } = config;

    const url = sandbox
      ? "https://api-sandbox.duitku.com/api/merchant/transactionStatus"
      : "https://api-prod.duitku.com/api/merchant/transactionStatus";

    const timestamp = Date.now().toString();

    // Header signature: sha256(merchantCode + timestamp + apiKey)
    const rawHeaderSignature = merchantCode + timestamp + apiKey;
    const headerSignature = crypto.createHash("sha256").update(rawHeaderSignature).digest("hex");

    // Body signature: md5(merchantCode + merchantOrderId + apiKey)
    const rawBodySignature = merchantCode + merchantOrderId + apiKey;
    const bodySignature = crypto.createHash("md5").update(rawBodySignature).digest("hex");

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
      } catch (e) { }

      if (!response.ok || !data) {
        return {
          success: false,
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: "",
          status: "failed",
          statusMessage: `HTTP error! Status: ${response.status}`,
          error: `HTTP ${response.status}`,
          rawResponse: data,
        };
      }

      // statusCode: "00" = paid, "01" = pending, "02" = failed/expired
      const statusCode = data.statusCode || "";
      let status: "paid" | "pending" | "failed";
      if (statusCode === "00") {
        status = "paid";
      } else if (statusCode === "01") {
        status = "pending";
      } else {
        status = "failed";
      }

      return {
        success: true,
        orderId: data.merchantOrderId || merchantOrderId,
        reference: data.reference || "",
        amount: data.amount ? Number(data.amount) : 0,
        statusCode,
        status,
        statusMessage: data.statusMessage || "",
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "",
        status: "failed",
        statusMessage: "Network error",
        error: e.message || "Failed to check transaction status",
        rawResponse: null,
      };
    }
  }
}
