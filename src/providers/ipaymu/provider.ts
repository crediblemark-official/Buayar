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

    const notifyUrl = callbackUrl || config.callbackUrl || "https://localhost/callback";
    const redirectUrl = returnUrl || config.returnUrl || "https://localhost/return";
    const feeDirection = params.feeDirection || params.extra?.feeDirection || config.extra?.feeDirection;
    const escrow = params.escrow !== undefined ? params.escrow : (params.extra?.escrow !== undefined ? params.extra?.escrow : config.extra?.escrow);
    const subAccount = params.subAccountId || params.extra?.subAccountId || params.extra?.account || params.extra?.childAccount || (params as any).account || config.extra?.account;

    let payload: any;
    if (isDirect) {
      payload = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "081234567890",
        amount: integerAmount,
        notifyUrl,
        expired: 24,
        expiredType: "hours",
        comments: productDetails,
        referenceId: orderId,
        paymentMethod: ipaymuMethod.paymentMethod,
        ...(ipaymuMethod.paymentChannel ? { paymentChannel: ipaymuMethod.paymentChannel } : {}),
        ...(feeDirection ? { feeDirection } : {}),
        ...(escrow !== undefined ? { escrow } : {}),
        ...(subAccount ? { account: subAccount } : {}),
        ...params.providerParams,
      };
    } else {
      const hasItems = params.items && params.items.length > 0;
      const product = hasItems
        ? params.items!.map(i => i.name)
        : [productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails];
      const qty = hasItems ? params.items!.map(i => i.quantity) : [1];
      const price = hasItems ? params.items!.map(i => Math.round(i.price)) : [integerAmount];
      const description = hasItems ? params.items!.map(i => i.description || i.name) : [productDetails];

      payload = {
        product,
        qty,
        price,
        description,
        returnUrl: redirectUrl,
        notifyUrl,
        cancelUrl: redirectUrl,
        referenceId: orderId,
        buyerName: customer.name,
        buyerEmail: customer.email,
        buyerPhone: customer.phone || "081234567890",
        ...(feeDirection ? { feeDirection } : {}),
        ...(escrow !== undefined ? { escrow } : {}),
        ...(subAccount ? { account: subAccount } : {}),
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
          reference: resData.TransactionId ? String(resData.TransactionId) : String(resData.SessionId || resData.SessionID || ""),
          paymentUrl: resData.Url || resData.url,
          rawResponse: data,
        };

        if (resData.PaymentNo) {
          if (ipaymuMethod?.paymentMethod === "va") {
            res.vaNumber = resData.PaymentNo;
            res.vaBank = ipaymuMethod.paymentChannel;
            res.mode = "va";
          } else if (ipaymuMethod?.paymentMethod === "cstore") {
            res.paymentCode = resData.PaymentNo;
            res.mode = "retail";
          }
        }

        if (resData.QrString || resData.QrImage) {
          res.qrString = resData.QrString;
          res.qrCodeUrl = resData.QrImage || resData.QrTemplate;
          res.mode = "qris";
        }

        if (ipaymuMethod?.paymentMethod === "ewallet") {
          res.mode = "ewallet";
          if (resData.Url) {
            res.deeplink = resData.Url;
            res.paymentUrl = resData.Url;
          }
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
    const va = config.merchantCode || config.merchantId || "";
    const apiKey = config.apiKey || "";
    const sandbox = !!config.sandbox;

    if (!va || !apiKey) {
      return {
        success: false,
        provider: "ipaymu",
        methods: [],
        categories: {},
        error: "Missing iPaymu credentials (BUAYAR_MERCHANT_CODE/VA or BUAYAR_API_KEY)",
        rawResponse: null,
      };
    }

    try {
      // Endpoint resmi iPaymu v2: GET /api/v2/payment-channels
      const url = `${this.getBaseUrl(sandbox)}/payment-channels`;
      const { signature, timestamp } = generateIpaymuSignature("GET", va, apiKey);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "va": va,
          "signature": signature,
          "timestamp": timestamp,
        },
      });

      const data: any = await response.json().catch(() => null);
      if (response.ok && data?.Data && Array.isArray(data.Data)) {
        const methods: PaymentMethod[] = [];
        const categories: Record<string, PaymentMethod[]> = {};

        for (const group of data.Data) {
          const groupCode = (group.Code || "").toLowerCase();
          const groupName = group.Name || group.Description || "Lainnya";
          const channels = group.Channels || [];

          let category = "Lainnya";
          if (groupCode === "va") category = "Virtual Account";
          else if (groupCode === "cstore") category = "Retail / Gerai";
          else if (groupCode === "qris") category = "QRIS";
          else if (groupCode === "cc") category = "Kartu Kredit";
          else if (groupCode === "paylater") category = "Paylater / Cicilan";
          else if (groupCode === "cod") category = "COD";
          else if (groupCode === "ewallet" || groupCode === "ewallet-asia") category = "E-Wallet";
          else if (groupCode === "debitonline") category = "Debit Online";
          else category = groupName;

          for (const ch of channels) {
            const chCode = (ch.Code || "").toLowerCase();
            let canonicalCode = chCode;
            if (groupCode === "va") {
              canonicalCode = chCode === "bag" ? "bag_va" : chCode === "bmi" ? "muamalat_va" : `${chCode}_va`;
            } else if (groupCode === "cc") {
              canonicalCode = "credit_card";
            } else if (groupCode === "qris") {
              canonicalCode = "qris";
            }

            let totalFee = "-";
            if (ch.TransactionFee) {
              if (ch.TransactionFee.ActualFeeType === "PERCENT") {
                totalFee = `${ch.TransactionFee.ActualFee}%`;
              } else if (ch.TransactionFee.ActualFee !== undefined) {
                totalFee = `IDR ${Number(ch.TransactionFee.ActualFee).toLocaleString()}`;
              }
            }

            const pm: PaymentMethod = {
              paymentMethod: canonicalCode,
              code: canonicalCode,
              paymentName: ch.Name || ch.Description || canonicalCode,
              paymentImage: ch.Logo || `https://my.ipaymu.com/images/banks/${chCode}.png`,
              totalFee,
              category,
              extra: {
                healthStatus: ch.HealthStatus,
                featureStatus: ch.FeatureStatus,
                instructionsDoc: ch.PaymentInstructionsDoc,
                feeDetail: ch.TransactionFee,
              },
            };

            methods.push(pm);
            if (!categories[category]) categories[category] = [];
            categories[category].push(pm);
          }
        }

        return {
          success: true,
          provider: "ipaymu",
          methods,
          categories,
          rawResponse: data,
        };
      }

      return {
        success: false,
        provider: "ipaymu",
        methods: [],
        categories: {},
        error: data?.Message || data?.message || `Failed to fetch payment channels (HTTP ${response.status})`,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: "ipaymu",
        methods: [],
        categories: {},
        error: err.message || "Failed to fetch iPaymu payment channels",
        rawResponse: null,
      };
    }
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
      const rawStatus = txData.Status !== undefined ? txData.Status : txData.status;
      const statusDesc = (txData.StatusDesc || "").toString().toLowerCase();
      const paidStatus = (txData.PaidStatus || "").toString().toLowerCase();
      const statusCode = txData.StatusCode !== undefined ? Number(txData.StatusCode) : (rawStatus !== undefined ? Number(rawStatus) : undefined);

      const isPaid = statusCode === 1 || paidStatus === "paid" || statusDesc.includes("berhasil") || statusDesc.includes("success");
      const isPending = statusCode === 0 || paidStatus === "unpaid" || statusDesc.includes("menunggu") || statusDesc.includes("pending");
      const isExpired = statusCode === 2 || statusDesc.includes("expired") || statusDesc.includes("kadaluarsa");
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
