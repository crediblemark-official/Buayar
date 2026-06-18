import crypto from "crypto";
import { BasePaymentProvider } from "./base";
import { MidtransClient } from "../clients/midtrans";
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
} from "../types";

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
    const { apiKey, sandbox } = config;

    const integerAmount = Math.round(amount);
    const method = params.paymentMethod?.toLowerCase() || "";

    // ─── CORE API (DIRECT CHARGE) CHANNELS ──────────────────────────────────────────
    const coreApiMethods = [
      "bca_va",
      "bni_va",
      "bri_va",
      "permata_va",
      "cimb_va",
      "danamon_va",
      "bsi_va",
      "seabank_va",
      "mandiri_va",
      "qris",
      "gopay",
      "shopeepay",
      "ovo",
      "dana",
      "linkaja",
      "alfamart",
      "indomaret",
      "credit_card",
      "googlepay",
      "kredivo",
      "akulaku",
    ];

    if (method && coreApiMethods.includes(method)) {
      const url = `${this.getApiBaseUrl(sandbox)}/charge`;
      let payload: any = {
        transaction_details: {
          order_id: orderId,
          gross_amount: integerAmount,
        },
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
        ...params.providerParams,
      };

      // Map specific payment_type and configs
      if (["bca_va", "bni_va", "bri_va", "cimb_va", "permata_va", "danamon_va", "bsi_va", "seabank_va"].includes(method)) {
        const bankName = method.split("_")[0]; // "bca", "bni", "bri", "cimb", "permata", "danamon", "bsi", "seabank"
        payload.payment_type = "bank_transfer";
        payload.bank_transfer = {
          bank: bankName,
        };
      } else if (method === "mandiri_va") {
        payload.payment_type = "echannel";
        payload.echannel = {
          bill_info1: "Payment for",
          bill_info2: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
        };
      } else if (method === "qris") {
        payload.payment_type = "qris";
      } else if (method === "gopay") {
        payload.payment_type = "gopay";
        payload.gopay = {
          enable_callback: true,
          callback_url: returnUrl,
        };
      } else if (method === "shopeepay") {
        payload.payment_type = "shopeepay";
        payload.shopeepay = {
          callback_url: returnUrl,
        };
      } else if (method === "ovo") {
        if (!customer.phone) {
          return {
            success: false,
            rawResponse: null,
            error: "OVO payment method requires a customer phone number in customer.phone",
          };
        }
        payload.payment_type = "ovo";
        payload.ovo = {
          phone: customer.phone,
        };
      } else if (method === "dana") {
        payload.payment_type = "dana";
      } else if (method === "linkaja") {
        payload.payment_type = "linkaja";
      } else if (method === "credit_card") {
        const token = params.providerParams?.credit_card?.token_id || params.providerParams?.tokenId;
        if (!token) {
          return {
            success: false,
            rawResponse: null,
            error: "Credit Card payment method requires token_id (passed via providerParams.credit_card.token_id or providerParams.tokenId)",
          };
        }
        payload.payment_type = "credit_card";
        payload.credit_card = {
          token_id: token,
          authentication: params.providerParams?.credit_card?.authentication ?? true,
          save_card: params.providerParams?.credit_card?.save_card,
          bank: params.providerParams?.credit_card?.bank,
          installment_term: params.providerParams?.credit_card?.installment_term,
          bins: params.providerParams?.credit_card?.bins,
          type: params.providerParams?.credit_card?.type,
        };
      } else if (method === "googlepay") {
        const token = params.providerParams?.googlepay?.token_id || params.providerParams?.tokenId;
        if (!token) {
          return {
            success: false,
            rawResponse: null,
            error: "Google Pay payment method requires token_id (passed via providerParams.googlepay.token_id or providerParams.tokenId)",
          };
        }
        payload.payment_type = "googlepay";
        payload.googlepay = {
          token_id: token,
        };
      } else if (method === "kredivo") {
        payload.payment_type = "kredivo";
        payload.kredivo = {
          address: params.providerParams?.kredivo?.address,
          first_name: params.providerParams?.kredivo?.first_name || customer.name.split(" ")[0],
          last_name: params.providerParams?.kredivo?.last_name || customer.name.split(" ").slice(1).join(" "),
          email: params.providerParams?.kredivo?.email || customer.email,
          phone: params.providerParams?.kredivo?.phone || customer.phone || "",
        };
      } else if (method === "akulaku") {
        payload.payment_type = "akulaku";
      } else if (["alfamart", "indomaret"].includes(method)) {
        payload.payment_type = "cstore";
        payload.cstore = {
          store: method,
          message: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
        };
      }

      try {
        const client = new MidtransClient(config);
        const data = await client.request("POST", "/charge", payload);

        // Midtrans core API success status code is usually "201" (created)
        if (data.status_code === "201" || data.status_code === "200") {
          const res: InvoiceResponse = {
            success: true,
            reference: data.transaction_id || data.order_id,
            rawResponse: data,
          };

          // Extract payment details depending on method
          if (["bca_va", "bni_va", "bri_va", "cimb_va", "danamon_va", "bsi_va", "seabank_va"].includes(method)) {
            res.vaNumber = data.va_numbers?.[0]?.va_number;
          } else if (method === "permata_va") {
            res.vaNumber = data.permata_va_number;
          } else if (method === "mandiri_va") {
            res.vaNumber = `${data.biller_code}-${data.bill_key}`;
          } else if (method === "qris") {
            res.qrString = data.qr_string;
            res.qrCodeUrl = data.actions?.find((a: any) => a.name === "generate-qr-code")?.url;
          } else if (["gopay", "shopeepay", "dana", "linkaja", "kredivo", "akulaku", "googlepay"].includes(method)) {
            res.paymentUrl = data.actions?.find((a: any) => a.name === "deeplink-redirect")?.url || 
                             data.actions?.find((a: any) => a.name === "web-redirect")?.url ||
                             data.actions?.find((a: any) => a.name === "generate-qr-code")?.url ||
                             data.redirect_url;
            res.qrCodeUrl = data.actions?.find((a: any) => a.name === "generate-qr-code")?.url;
          } else if (method === "credit_card") {
            res.paymentUrl = data.redirect_url || data.actions?.find((a: any) => a.name === "redirect")?.url;
          } else if (method === "ovo") {
            res.paymentUrl = ""; // OVO uses push notification directly to user's OVO app
          } else if (["alfamart", "indomaret"].includes(method)) {
            res.paymentCode = data.payment_code;
          }

          return res;
        } else {
          return {
            success: false,
            rawResponse: data,
            error: data.status_message || `Midtrans Core Error: ${data.status_code}`,
          };
        }
      } catch (e: any) {
        return {
          success: false,
          rawResponse: null,
          error: e.message || "Failed to make request to Midtrans Core API",
        };
      }
    }

    // ─── SNAP API (FALLBACK / REDIRECT) ───────────────────────────────────────────
    const url = this.getSnapBaseUrl(sandbox);
    const payload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: integerAmount,
      },
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
      callbacks: {
        finish: returnUrl,
      },
      ...(params.paymentMethod ? { enabled_payments: [params.paymentMethod] } : {}),
      ...params.providerParams,
    };

    try {
      const client = new MidtransClient(config);
      const data = await client.request("POST", url, payload);

      if (data.token) {
        return {
          success: true,
          paymentUrl: data.redirect_url,
          reference: data.token,
          rawResponse: data,
        };
      } else {
        return {
          success: false,
          rawResponse: data,
          error: data.error_messages?.[0] || "Failed to create Midtrans Snap transaction",
        };
      }
    } catch (e: any) {
      return {
        success: false,
        rawResponse: null,
        error: e.message || "Failed to make request to Midtrans Snap API",
      };
    }
  }

  async verifyCallback(body: any, config: ProviderConfig): Promise<VerifyCallbackResult> {
    const { apiKey } = config;

    const orderId = body.order_id || "";
    const statusCode = body.status_code || "";
    const grossAmount = body.gross_amount || "";
    const signatureKey = body.signature_key || "";

    // Midtrans Signature verification formula: SHA512(order_id + status_code + gross_amount + server_key)
    const rawSignature = orderId + statusCode + grossAmount + apiKey;
    const computedSignature = crypto.createHash("sha512").update(rawSignature).digest("hex");

    const isValid = signatureKey.toLowerCase() === computedSignature.toLowerCase();

    const transactionStatus = body.transaction_status || "";
    const fraudStatus = body.fraud_status || "";

    let status: "paid" | "pending" | "failed" = "pending";

    if (transactionStatus === "capture" || transactionStatus === "settlement") {
      if (fraudStatus === "accept" || !fraudStatus) {
        status = "paid";
      } else if (fraudStatus === "challenge") {
        status = "pending";
      } else {
        status = "failed";
      }
    } else if (transactionStatus === "pending") {
      status = "pending";
    } else if (["deny", "cancel", "expire"].includes(transactionStatus)) {
      status = "failed";
    }

    return {
      isValid,
      orderId,
      amount: grossAmount ? Number(grossAmount) : 0,
      status: isValid ? status : "failed",
      rawPayload: body,
    };
  }

  async getPaymentMethods(params: GetPaymentMethodsParams, config: ProviderConfig): Promise<GetPaymentMethodsResult> {
    // Static list of commonly supported Midtrans payment channels
    const staticMethods: PaymentMethod[] = [
      {
        paymentMethod: "credit_card",
        paymentName: "Credit / Debit Card",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/credit_card.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "googlepay",
        paymentName: "Google Pay™",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/googlepay.png",
        totalFee: "2.9% + IDR 2,000",
        category: "Kartu Kredit",
      },
      {
        paymentMethod: "bca_va",
        paymentName: "BCA Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/bca_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bni_va",
        paymentName: "BNI Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/bni_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bri_va",
        paymentName: "BRI Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/bri_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "mandiri_va",
        paymentName: "Mandiri Bill Payment / VA",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/mandiri_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "permata_va",
        paymentName: "Permata Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/permata_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "cimb_va",
        paymentName: "CIMB Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/cimb_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "danamon_va",
        paymentName: "Danamon Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/danamon_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "bsi_va",
        paymentName: "BSI Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/bsi_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "seabank_va",
        paymentName: "SeaBank Virtual Account",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/seabank_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "other_va",
        paymentName: "Other Banks (ATM Bersama, Prima, Alto)",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/other_va.png",
        totalFee: "IDR 4,000",
        category: "Virtual Account",
      },
      {
        paymentMethod: "qris",
        paymentName: "QRIS (GoPay, ShopeePay, Dana, LinkAja)",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/qris.png",
        totalFee: "0.7%",
        category: "QRIS",
      },
      {
        paymentMethod: "gopay",
        paymentName: "GoPay E-Wallet",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/gopay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "shopeepay",
        paymentName: "ShopeePay E-Wallet",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/shopeepay.png",
        totalFee: "2.0%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "ovo",
        paymentName: "OVO E-Wallet",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/ovo.png",
        totalFee: "1.5%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "dana",
        paymentName: "DANA E-Wallet",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/dana.png",
        totalFee: "1.7%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "linkaja",
        paymentName: "LinkAja E-Wallet",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/linkaja.png",
        totalFee: "1.7%",
        category: "E-Wallet",
      },
      {
        paymentMethod: "indomaret",
        paymentName: "Indomaret",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/indomaret.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "alfamart",
        paymentName: "Alfamart / Alfamidi",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/alfamart.png",
        totalFee: "IDR 5,000",
        category: "Retail / Gerai",
      },
      {
        paymentMethod: "kredivo",
        paymentName: "Kredivo Paylater",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/kredivo.png",
        totalFee: "2.3%",
        category: "Paylater / Cicilan",
      },
      {
        paymentMethod: "akulaku",
        paymentName: "Akulaku Paylater",
        paymentImage: "https://docs.midtrans.com/asset/payment_methods/akulaku.png",
        totalFee: "1.7%",
        category: "Paylater / Cicilan",
      },
    ];

    return {
      success: true,
      methods: staticMethods,
      rawResponse: staticMethods,
    };
  }

  async checkTransaction(params: CheckTransactionParams, config: ProviderConfig): Promise<CheckTransactionResult> {
    const { merchantOrderId } = params;

    try {
      const client = new MidtransClient(config);
      const data = await client.request("GET", `/${merchantOrderId}/status`, null);

      const transactionStatus = data.transaction_status || "";
      const fraudStatus = data.fraud_status || "";

      let status: "paid" | "pending" | "failed" = "pending";

      if (transactionStatus === "capture" || transactionStatus === "settlement") {
        if (fraudStatus === "accept" || !fraudStatus) {
          status = "paid";
        } else if (fraudStatus === "challenge") {
          status = "pending";
        } else {
          status = "failed";
        }
      } else if (transactionStatus === "pending") {
        status = "pending";
      } else if (["deny", "cancel", "expire"].includes(transactionStatus)) {
        status = "failed";
      }

      return {
        success: true,
        orderId: data.order_id || merchantOrderId,
        reference: data.transaction_id || "",
        amount: data.gross_amount ? Number(data.gross_amount) : 0,
        statusCode: data.status_code || "",
        status,
        statusMessage: data.status_message || "",
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
        error: e.message || "Failed to check transaction status with Midtrans",
        rawResponse: null,
      };
    }
  }

  /**
   * Get an instance of MidtransClient to perform transaction actions, subscriptions, invoicing, etc.
   */
  getClient(config: ProviderConfig): MidtransClient {
    return new MidtransClient(config);
  }

  async probePaymentMethods(config: ProviderConfig): Promise<{ success: boolean; enabled: string[]; error?: string }> {
    const probePayloads: Record<string, any> = {
      qris: { payment_type: "qris", qris: { acquirer: "gopay" } },
      gopay: { payment_type: "gopay", gopay: { enable_callback: true, callback_url: "https://example.com" } },
      shopeepay: { payment_type: "shopeepay", shopeepay: { callback_url: "https://example.com" } },
      ovo: { payment_type: "ovo", ovo: { phone: "081234567890" } },
      dana: { payment_type: "dana" },
      linkaja: { payment_type: "linkaja" },
      bca: { payment_type: "bank_transfer", bank_transfer: { bank: "bca" } },
      bni: { payment_type: "bank_transfer", bank_transfer: { bank: "bni" } },
      bri: { payment_type: "bank_transfer", bank_transfer: { bank: "bri" } },
      cimb: { payment_type: "bank_transfer", bank_transfer: { bank: "cimb" } },
      danamon: { payment_type: "bank_transfer", bank_transfer: { bank: "danamon" } },
      bsi: { payment_type: "bank_transfer", bank_transfer: { bank: "bsi" } },
      seabank: { payment_type: "bank_transfer", bank_transfer: { bank: "seabank" } },
      mandiri: { payment_type: "echannel", echannel: { bill_info1: "Payment", bill_info2: "Probe" } },
      permata: { payment_type: "permata" },
      alfamart: { payment_type: "cstore", cstore: { store: "alfamart", message: "Probe" } },
      indomaret: { payment_type: "cstore", cstore: { store: "indomaret", message: "Probe" } },
      akulaku: { payment_type: "akulaku" },
      kredivo: {
        payment_type: "kredivo",
        seller_details: { address: { city: "Jakarta" } },
      },
    };

    const enabled: string[] = [];
    const client = new MidtransClient(config);

    for (const [methodId, specificPayload] of Object.entries(probePayloads)) {
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
          } catch (e) {
            // ignore cancel errors
          }
        }
      } catch (e) {
        // network error — skip this method
      }
    }

    return { success: true, enabled };
  }
}

