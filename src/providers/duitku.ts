import crypto from "crypto";
import { BasePaymentProvider } from "./base";
import { CreateInvoiceParams, InvoiceResponse, VerifyCallbackResult, ProviderConfig } from "../types";

export class DuitkuProvider extends BasePaymentProvider {
  readonly name = "duitku";

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const { merchantCode, apiKey, sandbox } = config;

    const url = sandbox
      ? "https://api-sandbox.duitku.com/api/merchant/createInvoice"
      : "https://api-prod.duitku.com/api/merchant/createInvoice";

    const integerAmount = Math.round(amount);

    // Signature formula: md5(merchantCode + orderId + amount + apiKey)
    const rawSignature = merchantCode + orderId + integerAmount.toString() + apiKey;
    const signature = crypto.createHash("md5").update(rawSignature).digest("hex");

    const payload = {
      merchantCode,
      paymentAmount: integerAmount,
      merchantOrderId: orderId,
      productDetails,
      email: customer.email,
      phoneNumber: customer.phone || "",
      signature,
      callbackUrl,
      returnUrl,
      expiryPeriod: 1440, // 24 hours expiry
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
          rawResponse: data,
          error: data?.Message || data?.statusMessage || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.statusCode === "00") {
        return {
          success: true,
          paymentUrl: data.paymentUrl,
          reference: data.reference,
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
}
