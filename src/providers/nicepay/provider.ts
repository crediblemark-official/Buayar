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
import { toNicepayPaymentMethod } from "../../core/canonical";
import { formatNicepayTimestamp, generateNicepayToken, verifyNicepayWebhook } from "./signature";

export class NicepayProvider extends BasePaymentProvider {
  readonly name = "nicepay";

  private getBaseUrl(sandbox: boolean) {
    return sandbox
      ? "https://dev.nicepay.co.id/nicepay"
      : "https://www.nicepay.co.id/nicepay";
  }

  async createInvoice(params: CreateInvoiceParams, config: ProviderConfig): Promise<InvoiceResponse> {
    const { orderId, amount, productDetails, customer, returnUrl, callbackUrl } = params;
    const iMid = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const integerAmount = Math.round(amount);
    const niceMethod = toNicepayPaymentMethod(params.paymentMethod);
    const isDirect = !!niceMethod;

    const baseUrl = this.getBaseUrl(sandbox);
    const timeStamp = formatNicepayTimestamp();
    const merchantToken = generateNicepayToken(timeStamp, iMid, orderId, integerAmount, merchantKey);

    let endpoint = "/api/orderRegist.do";
    if (isDirect) {
      if (niceMethod.payMethod === "02") {
        endpoint = "/api/oneStepVa.do";
      } else if (niceMethod.payMethod === "08") {
        endpoint = "/api/oneStepQris.do";
      } else if (niceMethod.payMethod === "03") {
        endpoint = "/api/oneStepCstore.do";
      } else if (niceMethod.payMethod === "05") {
        endpoint = "/api/oneStepEwallet.do";
      }
    }

    const url = `${baseUrl}${endpoint}`;

    const payload: any = {
      timeStamp,
      iMid,
      payMethod: niceMethod ? niceMethod.payMethod : "00",
      currency: "IDR",
      amt: String(integerAmount),
      referenceNo: orderId,
      goodsNm: productDetails.length > 50 ? productDetails.substring(0, 47) + "..." : productDetails,
      billingNm: customer.name,
      billingEmail: customer.email,
      billingPhone: customer.phone || "",
      billingCity: "Jakarta",
      billingState: "Jakarta",
      billingPostCd: "10110",
      billingCountry: "Indonesia",
      dbProcessUrl: callbackUrl || config.callbackUrl || "",
      callBackUrl: returnUrl || config.returnUrl || "",
      merchantToken,
      ...params.providerParams,
    };

    if (niceMethod?.bankCd) {
      payload.bankCd = niceMethod.bankCd;
      payload.vacctValidDt = formatNicepayTimestamp(new Date(Date.now() + 24 * 60 * 60 * 1000)).substring(0, 8);
      payload.vacctValidTm = "235959";
    }

    if (niceMethod?.mitraCd) {
      payload.mitraCd = niceMethod.mitraCd;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
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
          provider: "nicepay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data?.resultMsg || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
        };
      }

      if (data.resultCd === "0000" || data.resultCd === "0" || data.vacctNo || data.qrContent || data.paymentUrl) {
        const res: InvoiceResponse = {
          success: true,
          provider: "nicepay",
          orderId: data.referenceNo || orderId,
          amount: data.amt ? Number(data.amt) : integerAmount,
          reference: data.tXid || orderId,
          paymentUrl: data.paymentUrl || data.checkoutUrl,
          rawResponse: data,
        };

        if (data.vacctNo) {
          res.vaNumber = data.vacctNo;
          res.vaBank = (data.bankCd || niceMethod?.bankCd || "").toLowerCase();
        }

        if (data.qrContent) {
          res.qrString = data.qrContent;
          res.qrCodeUrl = data.qrUrl;
        }

        if (data.payNo) {
          res.paymentCode = data.payNo;
        }

        if (data.vacctValidDt) {
          const dtStr = data.vacctValidDt; // YYYYMMDD
          const tmStr = data.vacctValidTm || "235959";
          const formatted = `${dtStr.substring(0, 4)}-${dtStr.substring(4, 6)}-${dtStr.substring(6, 8)}T${tmStr.substring(0, 2)}:${tmStr.substring(2, 4)}:${tmStr.substring(4, 6)}Z`;
          res.expiresAt = new Date(formatted);
        }

        return res;
      } else {
        return {
          success: false,
          provider: "nicepay",
          orderId,
          amount: integerAmount,
          rawResponse: data,
          error: data.resultMsg || data.message || `Nicepay Error: ${data.resultCd}`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        provider: "nicepay",
        orderId,
        amount: integerAmount,
        rawResponse: null,
        error: e.message || "Failed to make request to Nicepay API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const iMid = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";

    const orderId = body.referenceNo || body.order_id || "";
    const amount = body.amt || body.amount || 0;
    const timeStamp = body.timeStamp || "";
    const merchantToken = body.merchantToken || "";

    const isValid = verifyNicepayWebhook(timeStamp, iMid, orderId, amount, merchantKey, merchantToken);
    const resultCd = (body.resultCd || body.status || "").toUpperCase();

    const isPaid = isValid && (resultCd === "0000" || resultCd === "0" || body.status === "PAID" || body.status === "0");
    const isPending = resultCd === "PENDING" || resultCd === "1";
    const isExpired = resultCd === "EXPIRED" || resultCd === "2";
    const isFailed = !isValid || (!isPaid && !isPending && !isExpired);

    const status: "paid" | "pending" | "failed" | "expired" = isPaid
      ? "paid"
      : isPending
        ? "pending"
        : isExpired
          ? "expired"
          : "failed";

    return {
      isValid,
      provider: "nicepay",
      orderId: String(orderId),
      amount: Number(amount) || 0,
      status,
      isPaid,
      isPending,
      isFailed,
      isExpired,
      statusCode: resultCd,
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "bca_va",
        code: "bca_va",
        paymentName: "BCA Virtual Account (BBBB)",
        paymentImage: "https://www.nicepay.co.id/assets/images/bca.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        code: "mandiri_va",
        paymentName: "Mandiri Virtual Account (BMRI)",
        paymentImage: "https://www.nicepay.co.id/assets/images/mandiri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        code: "bni_va",
        paymentName: "BNI Virtual Account (BNIN)",
        paymentImage: "https://www.nicepay.co.id/assets/images/bni.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        code: "bri_va",
        paymentName: "BRI Virtual Account (BRIN)",
        paymentImage: "https://www.nicepay.co.id/assets/images/bri.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        code: "permata_va",
        paymentName: "Permata Virtual Account (BBBA)",
        paymentImage: "https://www.nicepay.co.id/assets/images/permata.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        code: "cimb_va",
        paymentName: "CIMB Niaga Virtual Account (BNIA)",
        paymentImage: "https://www.nicepay.co.id/assets/images/cimb.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        code: "danamon_va",
        paymentName: "Danamon Virtual Account (BDIN)",
        paymentImage: "https://www.nicepay.co.id/assets/images/danamon.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        code: "bsi_va",
        paymentName: "BSI Virtual Account (BBSI)",
        paymentImage: "https://www.nicepay.co.id/assets/images/bsi.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        code: "qris",
        paymentName: "QRIS Universal (Nicepay)",
        paymentImage: "https://www.nicepay.co.id/assets/images/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "alfamart",
        code: "alfamart",
        paymentName: "Alfamart (ALFA)",
        paymentImage: "https://www.nicepay.co.id/assets/images/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "indomaret",
        code: "indomaret",
        paymentName: "Indomaret (INDO)",
        paymentImage: "https://www.nicepay.co.id/assets/images/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "ovo",
        code: "ovo",
        paymentName: "OVO (05)",
        paymentImage: "https://www.nicepay.co.id/assets/images/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        code: "dana",
        paymentName: "DANA (05)",
        paymentImage: "https://www.nicepay.co.id/assets/images/dana.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        code: "shopeepay",
        paymentName: "ShopeePay (05)",
        paymentImage: "https://www.nicepay.co.id/assets/images/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "linkaja",
        code: "linkaja",
        paymentName: "LinkAja (05)",
        paymentImage: "https://www.nicepay.co.id/assets/images/linkaja.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "credit_card",
        code: "credit_card",
        paymentName: "Credit / Debit Card (01)",
        paymentImage: "https://www.nicepay.co.id/assets/images/cc.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "kredivo",
        code: "kredivo",
        paymentName: "Kredivo Paylater (04)",
        paymentImage: "https://www.nicepay.co.id/assets/images/kredivo.png",
        totalFee: "2.3%",
        category: "Paylater / Cicilan",
      },
      {
        paymentMethod: "akulaku",
        code: "akulaku",
        paymentName: "Akulaku Paylater (04)",
        paymentImage: "https://www.nicepay.co.id/assets/images/akulaku.png",
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
      provider: "nicepay",
      methods: staticMethods,
      categories,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;
    const iMid = config.merchantCode || config.merchantId || "";
    const merchantKey = config.apiKey || config.serverKey || config.secretKey || "";
    const sandbox = !!config.sandbox;

    const url = `${this.getBaseUrl(sandbox)}/api/oneStepTransInquiry.do`;
    const timeStamp = formatNicepayTimestamp();
    const merchantToken = generateNicepayToken(timeStamp, iMid, merchantOrderId, 0, merchantKey);

    const payload = {
      timeStamp,
      iMid,
      referenceNo: merchantOrderId,
      amt: "0",
      merchantToken,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
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
          provider: "nicepay",
          orderId: merchantOrderId,
          reference: "",
          amount: 0,
          statusCode: response.status.toString(),
          status: "failed",
          isPaid: false,
          isPending: false,
          isFailed: true,
          isExpired: false,
          statusMessage: data?.resultMsg || `HTTP error! Status: ${response.status}`,
          error: data?.resultMsg || `HTTP error! Status: ${response.status}`,
          rawResponse: data,
        };
      }

      const resultCd = (data.resultCd || data.status || "").toUpperCase();
      const isPaid = resultCd === "0000" || resultCd === "0" || data.status === "PAID" || data.status === "0";
      const isPending = resultCd === "PENDING" || resultCd === "1";
      const isExpired = resultCd === "EXPIRED" || resultCd === "2";
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
        provider: "nicepay",
        orderId: data.referenceNo || merchantOrderId,
        reference: data.tXid || "",
        amount: data.amt ? Number(data.amt) : 0,
        statusCode: resultCd,
        status,
        isPaid,
        isPending,
        isFailed,
        isExpired,
        statusMessage: data.resultMsg || "",
        paymentType: data.payMethod,
        transactionTime: data.transDt ? new Date(data.transDt) : undefined,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        provider: "nicepay",
        orderId: merchantOrderId,
        reference: "",
        amount: 0,
        statusCode: "ERROR",
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusMessage: e.message || "Failed to check transaction status in Nicepay",
        error: e.message || "Failed to check transaction status in Nicepay",
        rawResponse: null,
      };
    }
  }
}
