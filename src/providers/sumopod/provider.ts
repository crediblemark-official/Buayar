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
import { verifySumopodSvixSignature, verifySumopodToken } from "./signature";

export class SumopodProvider extends BasePaymentProvider {
  readonly name = "sumopod";

  private getBaseUrl(config?: ProviderConfig): string {
    if (config?.customBaseUrl) return config.customBaseUrl;
    if (config?.sandbox) return "https://api-pay-sandbox.sumopod.com";
    return "https://api-pay.sumopod.com";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, returnUrl } = params;
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    const baseUrl = this.getBaseUrl(config);
    const integerAmount = Math.round(amount);

    const payload: Record<string, any> = {
      order_id: orderId,
      amount: integerAmount,
      currency: (params.currency || "IDR").toUpperCase(),
      expires_in_hours: params.providerParams?.expires_in_hours ?? 24,
      ...(returnUrl || config.returnUrl ? { success_return_url: returnUrl || config.returnUrl } : {}),
      ...(params.providerParams?.cancel_return_url || config.returnUrl || returnUrl
        ? { cancel_return_url: params.providerParams?.cancel_return_url || config.returnUrl || returnUrl }
        : {}),
      payment_method_type_code: "QRIS",
      ...params.providerParams,
    };

    try {
      const response = await fetch(`${baseUrl}/api/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!response.ok || !data || data.error) {
        return {
          success: false,
          provider: "sumopod",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.message || data?.error || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      const isQris = data.payment_channel_used?.toLowerCase()?.includes('qris') || data.payment_code_type === 'QRIS' || !data.payment_code_type;
      const isVa = data.payment_code_type === 'ACCOUNT_NUMBER';

      return {
        success: true,
        provider: 'sumopod',
        orderId: data.order_id || orderId,
        amount: data.amount ? Number(data.amount) : integerAmount,
        reference: data.payment_id,
        paymentUrl: data.payment_link_url,
        paymentCode: data.payment_code,
        qrString: isQris ? (data.payment_code || data.payment_link_url) : undefined,
        qrCodeUrl: data.payment_code_type === 'QR_IMAGE' ? data.payment_code : undefined,
        vaNumber: isVa ? data.payment_code : undefined,
        vaBank: isVa ? (data.payment_channel_used?.split('.')[0]?.toLowerCase()) : undefined,
        expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
        mode: isQris ? 'qris' : (isVa ? 'va' : 'checkout'),
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "sumopod",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to SumoPod API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    let parsedBody: any;
    try {
      parsedBody = typeof body === "string" ? JSON.parse(body) : body;
    } catch {
      parsedBody = {};
    }

    const headers = config.extra?.headers || {};
    const getHeader = (name: string): string | undefined => {
      const lower = name.toLowerCase();
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === lower) {
          const val = headers[k];
          return Array.isArray(val) ? val[0] : val;
        }
      }
      return undefined;
    };

    const svixId = getHeader("svix-id") || config.extra?.svixId;
    const svixTimestamp = getHeader("svix-timestamp") || config.extra?.svixTimestamp;
    const svixSignature = getHeader("svix-signature") || config.extra?.svixSignature || config.extra?.signatureHeader;
    const receivedToken = getHeader("x-webhook-token") || config.extra?.webhookTokenHeader;

    const webhookSecret = config.extra?.webhookSecret || config.secretKey || "";
    const webhookToken = config.extra?.webhookToken || config.extra?.callbackToken || "";

    let isValid = false;

    // Verifikasi via Svix Signature jika header Svix tersedia
    if (svixId && svixTimestamp && svixSignature && webhookSecret) {
      isValid = verifySumopodSvixSignature(webhookSecret, svixId, svixTimestamp, svixSignature, rawBody);
    } else if (receivedToken && webhookToken) {
      // Verifikasi via X-Webhook-Token jika token header tersedia
      isValid = verifySumopodToken(webhookToken, receivedToken);
    } else if (!webhookSecret && !webhookToken) {
      // Jika merchant belum mengatur secret/token di konfigurasi, toleransi namun beri tanda
      isValid = true;
    }

    const eventType = parsedBody?.event_type || "";
    const data = parsedBody?.data || parsedBody;

    const orderId = String(data?.order_id || "");
    const amount = Number(data?.amount || 0);
    const statusRaw = (data?.status || "").toLowerCase();

    const isPaid = eventType === "payment.completed" || statusRaw === "completed";
    const isFailed = eventType === "payment.failed" || statusRaw === "failed";
    const isExpired = eventType === "payment.expired" || statusRaw === "expired";
    const isPending = !isPaid && !isFailed && !isExpired;

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isExpired
      ? "expired"
      : isFailed
      ? "failed"
      : "pending";

    return {
      isValid,
      provider: "sumopod",
      orderId,
      amount,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: eventType || statusRaw,
      transactionTime: data?.completed_at ? new Date(data.completed_at) : undefined,
      rawPayload: parsedBody,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const amount = params?.amount || 10000;
    const percentFee = Math.round(amount * 0.007);
    const flatFee = 300;
    const totalFeeNum = percentFee + flatFee;

    const methods: PaymentMethod[] = [
      {
        paymentMethod: "qris",
        code: "QRIS",
        paymentName: "QRIS",
        paymentImage: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_QRIS.svg",
        totalFee: "0.7% + Rp 300",
        category: "QRIS",
        feeDetail: {
          percent: 0.7,
          flat: 300,
          totalFee: totalFeeNum,
        },
      },
    ];

    const categories: Record<string, PaymentMethod[]> = {
      QRIS: methods,
    };

    return {
      success: true,
      provider: "sumopod",
      methods,
      categories,
      rawResponse: methods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const apiKey = config.apiKey || config.serverKey || config.secretKey || "";
    const baseUrl = this.getBaseUrl(config);

    try {
      const response = await fetch(`${baseUrl}/api/v1/payments/${encodeURIComponent(merchantOrderId)}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Api-Key": apiKey,
        },
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {}

      if (!response.ok || !data || data.error) {
        return {
          success: false,
          provider: "sumopod",
          orderId: merchantOrderId,
          reference: merchantOrderId,
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.message || data?.error || `HTTP error! Status: ${response.status}`,
          error: data?.message || data?.error,
          rawResponse: data,
        };
      }

      const statusRaw = (data.status || "").toLowerCase();
      const isPaid = statusRaw === "completed" || statusRaw === "paid";
      const isFailed = statusRaw === "failed";
      const isExpired = statusRaw === "expired";
      const isPending = !isPaid && !isFailed && !isExpired;

      const status: "paid" | "pending" | "failed" | "expired" = isPaid
        ? "paid"
        : isExpired
        ? "expired"
        : isFailed
        ? "failed"
        : "pending";

      return {
        success: true,
        provider: "sumopod",
        orderId: data.order_id || merchantOrderId,
        reference: data.payment_id || merchantOrderId,
        amount: Number(data.amount || 0),
        statusCode: statusRaw,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: statusRaw,
        paymentType: data.payment_method || "qris",
        transactionTime: data.completed_at ? new Date(data.completed_at) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "sumopod",
        orderId: merchantOrderId,
        reference: merchantOrderId,
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message,
        error: e.message,
        rawResponse: null,
      };
    }
  }
}
