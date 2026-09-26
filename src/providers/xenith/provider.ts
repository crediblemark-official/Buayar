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
  CheckBalanceResult,
  DisburseParams,
  DisburseResult,
  PaymentMethod,
  resolvePaymentMethodCode,
} from "../../types";
import { verifyXenithWebhookSignature } from "./signature";
import { resolveRawBody, signedPayload, RAW_BODY_REQUIRED_MESSAGE } from "../../utils/rawBody";
import { XenithClient } from "../../clients/xenith";
import { toXenithPayoutChannel, XENITH_TO_CANONICAL } from "../../core/canonical";

export class XenithProvider extends BasePaymentProvider {
  readonly name = "xenith";

  private getClient(config?: ProviderConfig): XenithClient {
    return new XenithClient(config || {});
  }

  /**
   * Pemetaan canonical method Buayar ke paymentMethod & paymentChannel Xenith
   */
  private resolveChannel(input?: any): { paymentMethod: string; paymentChannel: string } | null {
    if (!input) return null;
    const codeStr = resolvePaymentMethodCode(input);
    if (!codeStr) return null;
    const code = codeStr.toLowerCase();

    switch (code) {
      // Virtual Account
      case "bca_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BCA.VA" };
      case "mandiri_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "MDR.VA" };
      case "bni_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BNI.VA" };
      case "bri_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BRI.VA" };
      case "permata_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "PTB.VA" };
      case "cimb_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "CIMBN.VA" };
      case "danamon_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BDMN.VA" };
      case "maybank_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BMI.VA" };
      case "bag_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BAG.VA" };
      case "bss_va":
        return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: "BSS.VA" };
      // QRIS
      case "qris":
      case "gopay_qris":
      case "shopeepay_qris":
      case "nobu_qris":
        return { paymentMethod: "QR_CODE", paymentChannel: "QRIS" };
      // E-Wallet
      case "dana":
        return { paymentMethod: "EWALLET", paymentChannel: "DANA" };
      case "ovo":
        return { paymentMethod: "EWALLET", paymentChannel: "OVO" };
      default: {
        const raw = codeStr.toUpperCase();
        if (raw.endsWith(".VA")) return { paymentMethod: "VIRTUAL_ACCOUNT", paymentChannel: raw };
        if (raw === "QRIS") return { paymentMethod: "QR_CODE", paymentChannel: "QRIS" };
        if (raw === "DANA" || raw === "OVO") return { paymentMethod: "EWALLET", paymentChannel: raw };
        return { paymentMethod: "BANK_TRANSFER", paymentChannel: raw };
      }
    }
  }

  async createInvoice(
    params: CreateInvoiceParams,
    config: ProviderConfig
  ): Promise<InvoiceResponse> {
    const { orderId, amount, customer, returnUrl, callbackUrl } = params;
    const client = this.getClient(config);
    const integerAmount = Math.round(amount);
    const currency = (params.currency || "IDR").toUpperCase();

    // Xenith IDR mengharuskan customerName minimal 5 karakter
    let custName = customer?.name?.trim() || "Customer";
    if (currency === "IDR" && custName.length < 5) {
      custName = (custName + "     ").slice(0, 5);
    }

    const channelInfo = this.resolveChannel(params.paymentMethod);

    try {
      if (channelInfo) {
        // Mode Direct Pay In (kanal spesifik VA / QRIS / E-Wallet)
        const payload: Record<string, any> = {
          initiatedAmount: integerAmount,
          currency,
          paymentMethod: channelInfo.paymentMethod,
          paymentChannel: channelInfo.paymentChannel,
          referenceCode: orderId,
          customerReference: customer.phone || orderId,
          customerName: custName,
          description: params.productDetails || params.description || "Payment",
          callbackUrl: callbackUrl || config.callbackUrl || "https://example.com/callback",
          redirectUrl: returnUrl || config.returnUrl || "https://example.com/redirect",
        };

        if (customer.phone) {
          payload.customerPhoneNumber = customer.phone;
        }

        const res = await client.createPayIn(payload);
        const data = res?.data || res;
        const codeType = data.paymentCodeType;
        const code = data.paymentCode;

        const isLink = codeType === "PAYMENT_LINK" || (typeof code === "string" && code.startsWith("http"));
        const isVa = !isLink && (codeType === "ACCOUNT_NUMBER" || channelInfo.paymentMethod === "VIRTUAL_ACCOUNT");
        const isQris = !isLink && (codeType === "QR_TEXT" || codeType === "QR_IMAGE" || channelInfo.paymentChannel === "QRIS");

        const mode = isLink ? "checkout" : isQris ? "qris" : isVa ? "va" : "other";

        return {
          success: true,
          provider: "xenith",
          orderId,
          amount: data.initiatedAmount ? Number(data.initiatedAmount) : integerAmount,
          reference: data.id,
          paymentCode: code,
          vaNumber: isVa ? code : undefined,
          vaBank: isVa || channelInfo.paymentMethod === "VIRTUAL_ACCOUNT" ? channelInfo.paymentChannel.replace(".VA", "").toLowerCase() : undefined,
          qrString: codeType === "QR_TEXT" ? code : undefined,
          qrCodeUrl: codeType === "QR_IMAGE" ? code : undefined,
          paymentUrl: isLink ? code : undefined,
          expiresAt: data.expirationTime ? new Date(data.expirationTime) : undefined,
          mode,
          rawResponse: res,
        };
      } else {
        // Mode Hosted Payment Link (Checkout Session)
        const payload: Record<string, any> = {
          amount: integerAmount,
          currency,
          referenceCode: orderId,
          customerReference: customer.phone || orderId,
          customerName: custName,
          redirectUrl: returnUrl || config.returnUrl || "https://example.com/redirect",
        };

        if (customer.phone) {
          payload.customerPhoneNumber = customer.phone;
        }
        if (callbackUrl || config.callbackUrl) {
          payload.paymentLinkCallbackUrl = callbackUrl || config.callbackUrl;
          payload.payinCallbackUrl = callbackUrl || config.callbackUrl;
        }

        const res = await client.createPaymentLink(payload);
        const data = res?.data || res;

        return {
          success: true,
          provider: "xenith",
          orderId,
          amount: data.amount ? Number(data.amount) : integerAmount,
          reference: data.id,
          paymentUrl: data.paymentLinkUrl,
          expiresAt: data.expiredTime ? new Date(data.expiredTime) : undefined,
          mode: "checkout",
          rawResponse: res,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "xenith",
        orderId,
        amount: integerAmount,
        error: e.message || String(e),
        rawResponse: e.response || null,
      };
    }
  }

  async checkTransaction(
    params: CheckTransactionParams,
    config: ProviderConfig
  ): Promise<CheckTransactionResult> {
    const client = this.getClient(config);
    const lookupId = params.transactionId || params.merchantOrderId;

    try {
      let res: any;
      if (lookupId.startsWith("plr-")) {
        // Payment Link ID
        res = await client.getPaymentLink(lookupId);
      } else if (lookupId.startsWith("payin-") || lookupId.startsWith("pymt-")) {
        // Pay In ID
        res = await client.getPayIn(lookupId);
      } else {
        // Default coba getPayIn
        try {
          res = await client.getPayIn(lookupId);
        } catch {
          res = await client.getPaymentLink(lookupId);
        }
      }

      const data = res?.data || res;
      const statusRaw = String(data.status || "").toUpperCase();

      let status: "paid" | "pending" | "failed" | "expired" = "pending";
      if (statusRaw === "SUCCESS" || statusRaw === "COMPLETED") {
        status = "paid";
      } else if (statusRaw === "EXPIRED") {
        status = "expired";
      } else if (statusRaw === "FAILED" || statusRaw === "CANCELLED") {
        status = "failed";
      }

      const statusCode = status === "paid" ? "00" : status === "pending" ? "01" : "02";

      return {
        success: true,
        provider: "xenith",
        orderId: data.referenceCode || params.merchantOrderId,
        reference: data.id || "",
        amount: Number(data.paymentAmount || data.amount || data.initiatedAmount || 0),
        status,
        statusCode,
        statusMessage: statusRaw || status,
        isPaid: status === "paid",
        isPending: status === "pending",
        isFailed: status === "failed",
        isExpired: status === "expired",
        transactionTime: data.createdTime ? new Date(data.createdTime) : undefined,
        rawResponse: res,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "xenith",
        orderId: params.merchantOrderId,
        reference: "",
        amount: 0,
        status: "failed",
        statusCode: "02",
        statusMessage: "FAILED",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        error: e.message || String(e),
        rawResponse: null,
      };
    }
  }

  async verifyCallback(
    payload: any,
    config: ProviderConfig,
    headers?: Record<string, any>
  ): Promise<VerifyCallbackResult> {
    const rawBody = resolveRawBody(config, payload);
    const parsedBody = signedPayload(payload, config);

    const getHeader = (name: string): string | undefined => {
      if (!headers) return undefined;
      const target = name.toLowerCase();
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) {
          const val = headers[k];
          return Array.isArray(val) ? val[0] : String(val);
        }
      }
      return undefined;
    };

    const signature =
      getHeader("x-xenith-signature") ||
      config.extra?.xenithSignature ||
      config.extra?.signatureHeader;
    const timestamp =
      getHeader("x-xenith-timestamp") ||
      config.extra?.xenithTimestamp ||
      config.extra?.timestampHeader;

    const secret =
      config.webhookSecret ||
      config.extra?.webhookSecret ||
      config.secretKey ||
      "";

    let isValid = false;
    let error: string | undefined;

    if (!secret) {
      // FAIL-CLOSED: Menolak jika secret tidak disetel
      error =
        "Xenith webhook secret not configured. Set XENITH_WEBHOOK_SECRET or BUAYAR_WEBHOOK_SECRET; rejected for security.";
      isValid = false;
    } else if (!signature || !timestamp) {
      error = "Missing Xenith-Signature or Xenith-Timestamp header.";
      isValid = false;
    } else if (rawBody === undefined) {
      error = RAW_BODY_REQUIRED_MESSAGE + " (Xenith webhook verification)";
      isValid = false;
    } else {
      const urlPath = config.extra?.urlPath || config.extra?.webhookPath || "/v1/webhook";
      isValid = verifyXenithWebhookSignature({
        secret,
        rawBody,
        timestamp,
        signature,
        urlPath,
      });
      if (!isValid) error = "Xenith webhook signature mismatch.";
    }

    const data = parsedBody?.data || parsedBody;
    const orderId = String(data?.referenceCode || data?.id || "");
    const amount = Number(data?.paymentAmount || data?.initiatedAmount || data?.amount || 0);
    const statusRaw = String(data?.status || "").toUpperCase();

    const isPaid = isValid && (statusRaw === "SUCCESS" || statusRaw === "COMPLETED");
    const isExpired = isValid && statusRaw === "EXPIRED";
    const isFailed = !isValid || statusRaw === "FAILED" || statusRaw === "CANCELLED";
    const isPending = isValid && (statusRaw === "PENDING" || statusRaw === "ACTIVE");

    const status: "paid" | "pending" | "failed" | "expired" = !isValid
      ? "failed"
      : isPaid
        ? "paid"
        : isExpired
          ? "expired"
          : isFailed
            ? "failed"
            : "pending";

    return {
      isValid,
      provider: "xenith",
      orderId,
      amount,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: statusRaw,
      transactionTime: data?.createdTime ? new Date(data.createdTime) : undefined,
      rawPayload: parsedBody,
      error,
    };
  }

  async checkBalance(config: ProviderConfig): Promise<CheckBalanceResult> {
    const client = this.getClient(config);
    try {
      const res = await client.getBalances();
      const items: any[] = res?.data || (Array.isArray(res) ? res : []);
      const idr = items.find((i) => String(i.currency).toUpperCase() === "IDR") || items[0];

      return {
        success: true,
        supported: true,
        provider: "xenith",
        balance: idr ? parseFloat(idr.availableBalance ?? "0") : 0,
        pendingBalance: idr ? parseFloat(idr.pendingBalance ?? "0") : 0,
        heldBalance: idr ? parseFloat(idr.heldBalance ?? "0") + parseFloat(idr.frozenBalance ?? "0") : 0,
        totalBalance: idr ? parseFloat(idr.totalBalance ?? "0") : 0,
        currency: idr?.currency || "IDR",
        rawResponse: res,
      };
    } catch (e: any) {
      return {
        success: false,
        supported: true,
        provider: "xenith",
        balance: 0,
        currency: "IDR",
        rawResponse: null,
        error: e.message || String(e),
      };
    }
  }

  async disburse(params: DisburseParams, config: ProviderConfig): Promise<DisburseResult> {
    const client = this.getClient(config);
    const { amount, bankCode, accountNumber, accountHolderName, externalId, description, providerParams } = params;

    try {
      const payload: Record<string, any> = {
        initiatedAmount: Math.round(amount),
        currency: (providerParams?.currency || "IDR").toUpperCase(),
        destinationPayoutMethod: "BANK_TRANSFER",
        destinationPayoutChannel: toXenithPayoutChannel(bankCode),
        destinationPayoutAccount: accountNumber,
        destinationPayoutAccountName: accountHolderName || "Beneficiary",
        referenceCode: externalId,
        customerReference: externalId,
        description: description || `Disbursement for ${externalId}`,
        callbackUrl: config.callbackUrl || "https://example.com/payout-callback",
      };

      const res = await client.createPayout(payload);
      const data = res?.data || res;
      const statusRaw = String(data.status || "").toUpperCase();

      let status: "SUCCESS" | "PENDING" | "FAILED" = "PENDING";
      if (statusRaw === "SUCCESS" || statusRaw === "COMPLETED") status = "SUCCESS";
      else if (statusRaw === "FAILED" || statusRaw === "CANCELLED") status = "FAILED";

      return {
        success: true,
        supported: true,
        provider: "xenith",
        reference: data.id,
        status,
        rawResponse: res,
      };
    } catch (e: any) {
      return {
        success: false,
        supported: true,
        provider: "xenith",
        reference: "",
        status: "FAILED",
        rawResponse: null,
        error: e.message || String(e),
      };
    }
  }

  async getPaymentMethods(
    params: GetPaymentMethodsParams,
    config: ProviderConfig
  ): Promise<GetPaymentMethodsResult> {
    const defaultImage = "https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_QRIS.svg";
    const methods: PaymentMethod[] = [
      {
        paymentMethod: "qris",
        code: "QRIS",
        paymentName: "QRIS",
        paymentImage: defaultImage,
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "bca_va",
        code: "BCA.VA",
        paymentName: "BCA Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "MDR.VA",
        paymentName: "Mandiri Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "BNI.VA",
        paymentName: "BNI Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "BRI.VA",
        paymentName: "BRI Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "PTB.VA",
        paymentName: "Permata Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "CIMBN.VA",
        paymentName: "CIMB Niaga Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "BDMN.VA",
        paymentName: "Danamon Virtual Account",
        paymentImage: defaultImage,
        totalFee: "Rp 2.000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "dana",
        code: "DANA",
        paymentName: "DANA E-Wallet",
        paymentImage: defaultImage,
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "ovo",
        code: "OVO",
        paymentName: "OVO E-Wallet",
        paymentImage: defaultImage,
        totalFee: "1.5%",
        category: "E-Wallet",
      },
    ];

    return {
      success: true,
      methods,
      rawResponse: null,
    };
  }

  /**
   * Batch Disbursement — kirim banyak payout sekaligus (sequential, satu per satu).
   * Xenith API belum memiliki endpoint batch native, sehingga kita fire secara serial.
   */
  async batchDisburse(
    items: Array<{
      externalId: string;
      bankCode: string;
      accountNumber: string;
      accountHolderName?: string;
      amount: number;
      description?: string;
    }>,
    config: ProviderConfig
  ): Promise<{ results: Array<{ externalId: string; success: boolean; reference?: string; status?: string; error?: string }> }> {
    const client = this.getClient(config);
    const results: Array<{ externalId: string; success: boolean; reference?: string; status?: string; error?: string }> = [];

    for (const item of items) {
      try {
        const payload: Record<string, any> = {
          initiatedAmount: Math.round(item.amount),
          currency: "IDR",
          destinationPayoutMethod: "BANK_TRANSFER",
          destinationPayoutChannel: toXenithPayoutChannel(item.bankCode),
          destinationPayoutAccount: item.accountNumber,
          destinationPayoutAccountName: item.accountHolderName || "Beneficiary",
          referenceCode: item.externalId,
          customerReference: item.externalId,
          description: item.description || `Batch disbursement ${item.externalId}`,
          callbackUrl: config.callbackUrl || "https://example.com/payout-callback",
        };
        const res = await client.createPayout(payload);
        const data = res?.data || res;
        const statusRaw = String(data?.status || "").toUpperCase();
        const status = statusRaw === "SUCCESS" || statusRaw === "COMPLETED"
          ? "SUCCESS"
          : statusRaw === "FAILED" ? "FAILED" : "PENDING";

        results.push({ externalId: item.externalId, success: true, reference: data?.id, status });
      } catch (e: any) {
        results.push({ externalId: item.externalId, success: false, error: e.message || String(e) });
      }
    }

    return { results };
  }

  /**
   * List semua transaksi (PAY_IN, PAY_OUT, SETTLEMENT, TOP_UP, PAY_IN_CREDIT, dll.)
   * untuk rekonsiliasi menggunakan /v1/transactions
   */
  async listTransactions(
    params: {
      limit?: number;
      cursor?: string;
      createdTimeGte?: string;
      createdTimeLte?: string;
    },
    config: ProviderConfig
  ): Promise<{ success: boolean; data: any[]; page: any; rawResponse: any; error?: string }> {
    const client = this.getClient(config);
    try {
      const res = await client.listTransactions(params);
      return { success: true, data: res?.data || [], page: res?.page || {}, rawResponse: res };
    } catch (e: any) {
      return { success: false, data: [], page: {}, rawResponse: null, error: e.message || String(e) };
    }
  }

  /**
   * List semua Pay Out dengan paginasi
   */
  async listPayOuts(
    params: { limit?: number; order?: "ASC" | "DESC"; cursor?: string; status?: string },
    config: ProviderConfig
  ): Promise<{ success: boolean; data: any[]; page: any; rawResponse: any }> {
    const client = this.getClient(config);
    try {
      const res = await client.listPayOuts(params);
      return { success: true, data: res?.data || [], page: res?.page || {}, rawResponse: res };
    } catch (e: any) {
      return { success: false, data: [], page: {}, rawResponse: null };
    }
  }

  /**
   * List semua Pay In dengan paginasi
   */
  async listPayIns(
    params: { limit?: number; order?: "ASC" | "DESC"; cursor?: string; status?: string },
    config: ProviderConfig
  ): Promise<{ success: boolean; data: any[]; page: any; rawResponse: any }> {
    const client = this.getClient(config);
    try {
      const res = await client.listPayIns(params);
      return { success: true, data: res?.data || [], page: res?.page || {}, rawResponse: res };
    } catch (e: any) {
      return { success: false, data: [], page: {}, rawResponse: null };
    }
  }

  /**
   * List semua Payment Link dengan paginasi
   */
  async listPaymentLinks(
    params: { limit?: number; order?: "ASC" | "DESC"; cursor?: string; status?: string },
    config: ProviderConfig
  ): Promise<{ success: boolean; data: any[]; page: any; rawResponse: any }> {
    const client = this.getClient(config);
    try {
      const res = await client.listPaymentLinks(params);
      return { success: true, data: Array.isArray(res) ? res : res?.data || [], page: res?.page || {}, rawResponse: res };
    } catch (e: any) {
      return { success: false, data: [], page: {}, rawResponse: null };
    }
  }

  /**
   * Expire (batalkan) Payment Link yang masih aktif
   */
  async expirePaymentLink(id: string, config: ProviderConfig): Promise<{ success: boolean; rawResponse: any }> {
    const client = this.getClient(config);
    try {
      const res = await client.expirePaymentLink(id);
      return { success: true, rawResponse: res };
    } catch (e: any) {
      return { success: false, rawResponse: null };
    }
  }

  /**
   * Dapatkan detail satu Pay Out berdasarkan ID.
   * Fallback ke /v1/transactions jika /v1/payouts/:id tidak ditemukan
   * (terjadi saat payout di-reject karena balance kurang dan tidak disimpan di queue)
   */
  async getPayOut(id: string, config: ProviderConfig): Promise<any> {
    const client = this.getClient(config);
    let rawData: any = null;

    // Coba langsung
    try {
      rawData = await client.getPayout(id);
    } catch (_e) {
      // Fallback: cari di transactions feed
      try {
        const txns = await client.listTransactions({ limit: 50 });
        rawData = txns?.data?.find((t: any) => t.id === id) || null;
      } catch (_e2) {
        rawData = null;
      }
    }

    if (!rawData) {
      return { success: false, error: "Payout tidak ditemukan", reference: id, rawResponse: null };
    }

    const data = rawData?.data || rawData;
    const statusRaw = String(data?.status || "").toUpperCase();
    let status: "SUCCESS" | "PENDING" | "FAILED" = "PENDING";
    if (statusRaw === "SUCCESS" || statusRaw === "COMPLETED") status = "SUCCESS";
    else if (statusRaw === "FAILED" || statusRaw === "CANCELLED") status = "FAILED";

    return {
      success: true,
      provider: "xenith",
      reference: data?.id,
      referenceCode: data?.referenceCode,
      amount: parseFloat(data?.initiatedAmount?.value ?? data?.initiatedAmount ?? "0"),
      status,
      channel: data?.paymentChannel,
      accountName: data?.details?.destinationPayoutAccountName,
      accountNumber: data?.details?.destinationPayoutAccount,
      rawResponse: rawData,
    };
  }
}
