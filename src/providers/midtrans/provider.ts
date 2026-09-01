import { BasePaymentProvider } from "../base";
import { MidtransClient } from "../../clients/midtrans";
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
import { toCanonicalPaymentMethod } from "../../core/canonical";
import { sha512, safeCompare } from "../../utils/crypto";
import {
  CORE_API_METHODS,
  buildCoreChargePayload,
  parseCoreChargeResponse,
} from "./charge";
import {
  MIDTRANS_STATIC_METHODS,
  MIDTRANS_PROBE_PAYLOADS,
} from "./methods";

export class MidtransProvider extends BasePaymentProvider {
  readonly name = "midtrans";

  private getSnapBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://app.sandbox.midtrans.com/snap/v1/transactions"
      : "https://app.midtrans.com/snap/v1/transactions";
  }

  private getApiBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://api.sandbox.midtrans.com/v2"
      : "https://api.midtrans.com/v2";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl } = params;
    const sandbox = !!config.sandbox;
    const integerAmount = Math.round(amount);
    const rawMethod = params.paymentMethod?.toLowerCase().trim() || "";
    const canonicalMethod = toCanonicalPaymentMethod("midtrans", rawMethod);
    const method = canonicalMethod || rawMethod;

    // 1. Core API (Direct Charge / Custom Native UI)
    if (method && CORE_API_METHODS.includes(method)) {
      const { payload, error } = buildCoreChargePayload(method, params, config, integerAmount);
      if (error || !payload) {
        return {
          success: false,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          rawResponse: null,
          error: error || "Failed to build charge payload",
        };
      }

      try {
        const client = new MidtransClient(config);
        const data = await client.request("POST", "/charge", payload);

        if (data.status_code === "201" || data.status_code === "200") {
          return parseCoreChargeResponse(method, data, orderId, integerAmount);
        } else {
          return {
            success: false,
            provider: "midtrans",
            orderId,
            amount: integerAmount,
            rawResponse: data,
            error: data.status_message || `Midtrans Core Error: ${data.status_code}`,
          };
        }
      } catch (e: any) {
        return {
          success: false,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          rawResponse: null,
          error: e.message || "Failed to make request to Midtrans Core API",
        };
      }
    }

    // 2. Snap API (Semi Integration / Redirect Checkout)
    const url = this.getSnapBaseUrl(sandbox);
    const payload = {
      transaction_details: { order_id: orderId, gross_amount: integerAmount },
      customer_details: {
        first_name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
      },
      item_details: [
        {
          id: orderId,
          price: integerAmount,
          quantity: 1,
          name: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
        },
      ],
      callbacks: { finish: returnUrl || config.returnUrl || "" },
      ...(params.paymentMethod ? { enabled_payments: [params.paymentMethod] } : {}),
      ...params.providerParams,
    };

    try {
      const client = new MidtransClient(config);
      const data = await client.request("POST", url, payload);

      if (data.token) {
        return {
          success: true,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          paymentUrl: data.redirect_url,
          reference: data.token,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          provider: "midtrans",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.error_messages?.[0] || "Failed to create Midtrans Snap transaction",
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "midtrans",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Midtrans Snap API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const serverKey = config.serverKey || config.apiKey || "";
    const orderId = body.order_id || "";
    const statusCode = body.status_code || "";
    const grossAmount = body.gross_amount || "";
    const signatureKey = body.signature_key || "";

    const rawSignature = orderId + statusCode + grossAmount + serverKey;
    const computedSignature = sha512(rawSignature);
    const isValid = safeCompare(signatureKey, computedSignature);

    const transactionStatus = body.transaction_status || "";
    const fraudStatus = body.fraud_status || "";

    let isPaid = false;
    let isPending = false;
    let isFailed = false;
    let isExpired = false;
    let status: "paid" | "pending" | "failed" | "expired" = "pending";

    if (transactionStatus === "capture" || transactionStatus === "settlement") {
      if (fraudStatus === "accept" || !fraudStatus) {
        status = "paid";
        isPaid = true;
      } else if (fraudStatus === "challenge") {
        status = "pending";
        isPending = true;
      } else {
        status = "failed";
        isFailed = true;
      }
    } else if (transactionStatus === "pending") {
      status = "pending";
      isPending = true;
    } else if (transactionStatus === "expire") {
      status = "expired";
      isExpired = true;
      isFailed = true;
    } else if (["deny", "cancel"].includes(transactionStatus)) {
      status = "failed";
      isFailed = true;
    }

    return {
      isValid,
      provider: "midtrans",
      orderId,
      amount: grossAmount ? Number(grossAmount) : 0,
      status: isValid ? status : "failed",
      isPaid: isValid && isPaid,
      isPending: isValid && isPending,
      isFailed: !isValid || isFailed,
      isExpired: isValid && isExpired,
      statusCode,
      transactionTime: body.transaction_time ? new Date(body.transaction_time) : undefined,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const categories: Record<string, PaymentMethod[]> = {};
    for (const item of MIDTRANS_STATIC_METHODS) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    return {
      success: true,
      provider: "midtrans",
      methods: MIDTRANS_STATIC_METHODS,
      categories,
      rawResponse: MIDTRANS_STATIC_METHODS,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;

    try {
      const client = new MidtransClient(config);
      const data = await client.request("GET", `/${merchantOrderId}/status`, null);

      const transactionStatus = data.transaction_status || "";
      const fraudStatus = data.fraud_status || "";

      let isPaid = false;
      let isPending = false;
      let isFailed = false;
      let isExpired = false;
      let status: "paid" | "pending" | "failed" | "expired" = "pending";

      if (transactionStatus === "capture" || transactionStatus === "settlement") {
        if (fraudStatus === "accept" || !fraudStatus) {
          status = "paid";
          isPaid = true;
        } else if (fraudStatus === "challenge") {
          status = "pending";
          isPending = true;
        } else {
          status = "failed";
          isFailed = true;
        }
      } else if (transactionStatus === "pending") {
        status = "pending";
        isPending = true;
      } else if (transactionStatus === "expire") {
        status = "expired";
        isExpired = true;
        isFailed = true;
      } else if (["deny", "cancel"].includes(transactionStatus)) {
        status = "failed";
        isFailed = true;
      }

      return {
        success: true,
        provider: "midtrans",
        orderId: data.order_id || merchantOrderId,
        reference: data.transaction_id || "",
        amount: data.gross_amount ? Number(data.gross_amount) : 0,
        statusCode: data.status_code || "",
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.status_message || "",
        paymentType: data.payment_type,
        transactionTime: data.transaction_time ? new Date(data.transaction_time) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "midtrans",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: "Network error",
        error: e.message || "Failed to check transaction status with Midtrans",
        rawResponse: null,
      };
    }
  }

  getClient(config: ProviderConfig): MidtransClient {
    return new MidtransClient(config);
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{ success: boolean; enabled: string[]; error?: string }> {
    const enabled: string[] = [];
    const client = new MidtransClient(config);

    for (const [methodId, specificPayload] of Object.entries(MIDTRANS_PROBE_PAYLOADS)) {
      try {
        const probeOrderId = `PROBE-${methodId}-${Date.now()}`;
        const probeBody = {
          ...specificPayload,
          transaction_details: { order_id: probeOrderId, gross_amount: 15000 },
          item_details: [{ id: probeOrderId, name: "Probe", price: 15000, quantity: 1 }],
          customer_details: { first_name: "Probe", email: "probe@test.com" },
        };

        const result = await client.request("POST", "/charge", probeBody);
        if (result && ["200", "201", "202"].includes(result.status_code)) {
          enabled.push(methodId);
          try {
            await client.cancelTransaction(probeOrderId);
          } catch (e) {}
        }
      } catch (e) {}
    }

    return { success: true, enabled };
  }
}
