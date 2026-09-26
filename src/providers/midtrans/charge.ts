import { CreateInvoiceParams, InvoiceResponse, ProviderConfig } from "../../types";

/**
 * Mapping kode kanonikal Buayar → nilai `enabled_payments` Snap API yang SAH.
 *
 * Dokumen resmi hanya menerima nilai berikut (lihat Request Body → enabled_payments).
 * Yang berbeda dari kode kanonikal: mandiri_va → echannel, qris/gopay_qris/shopeepay_qris.
 */
export const CANONICAL_TO_MIDTRANS_SNAP: Record<string, string> = {
  credit_card: "credit_card",
  mandiri_va: "echannel",
  permata_va: "permata_va",
  bca_va: "bca_va",
  bni_va: "bni_va",
  bri_va: "bri_va",
  cimb_va: "cimb_va",
  danamon_va: "danamon_va",
  bsi_va: "bsi_va",
  seabank_va: "seabank_va",
  gopay: "gopay",
  gopay_qris: "gopay",
  ovo: "ovo",
  dana: "dana",
  shopeepay: "shopeepay",
  shopeepay_qris: "shopeepay",
  qris: "other_qris",
  alfamart: "alfamart",
  indomaret: "indomaret",
  akulaku: "akulaku",
  kredivo: "kredivo",
};

/** Ubah kode kanonikal → nilai `enabled_payments` Snap, atau undefined bila tak dikenal. */
export function toMidtransSnapEnabledPayment(code?: string): string | undefined {
  if (!code) return undefined;
  return CANONICAL_TO_MIDTRANS_SNAP[code.toLowerCase().trim()];
}

export const CORE_API_METHODS = [
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
  "gopay_qris",
  "shopeepay_qris",
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

export function buildCoreChargePayload(
  method: string,
  params: CreateInvoiceParams,
  config: ProviderConfig,
  integerAmount: number
): { payload?: any; error?: string } {
  const { orderId, productDetails, customer, returnUrl } = params;

  const payload: any = {
    transaction_details: {
      order_id: orderId,
      gross_amount: integerAmount,
    },
    customer_details: {
      first_name: customer.name,
      email: customer.email,
      // Jangan kirim phone kosong — Midtrans menolak/validasi ketat bila ada nilai blank.
      ...(customer.phone ? { phone: customer.phone } : {}),
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

  if (["bca_va", "bni_va", "bri_va", "cimb_va", "permata_va", "danamon_va", "bsi_va", "seabank_va"].includes(method)) {
    const bankName = method.split("_")[0];
    payload.payment_type = "bank_transfer";
    payload.bank_transfer = { bank: bankName };
  } else if (method === "mandiri_va") {
    payload.payment_type = "echannel";
    payload.echannel = {
      bill_info1: "Payment for",
      bill_info2: productDetails.length > 30 ? productDetails.substring(0, 27) + "..." : productDetails,
    };
  } else if (method === "qris" || method === "gopay_qris" || method === "shopeepay_qris") {
    payload.payment_type = "qris";
    // Nilai acquirer resmi hanya "gopay" dan "airpay shopee" (bukan "shopeepay").
    payload.qris = { acquirer: method === "shopeepay_qris" ? "airpay shopee" : "gopay" };
  } else if (method === "gopay") {
    payload.payment_type = "gopay";
    payload.gopay = {
      enable_callback: true,
      callback_url: returnUrl || config.returnUrl || "",
    };
  } else if (method === "shopeepay") {
    payload.payment_type = "shopeepay";
    payload.shopeepay = {
      callback_url: returnUrl || config.returnUrl || "",
    };
  } else if (method === "ovo") {
    if (!customer.phone) {
      return { error: "OVO payment method requires customer phone number in customer.phone" };
    }
    payload.payment_type = "ovo";
    payload.ovo = { phone: customer.phone };
  } else if (method === "dana") {
    payload.payment_type = "dana";
  } else if (method === "linkaja") {
    payload.payment_type = "linkaja";
  } else if (method === "credit_card") {
    const token = params.providerParams?.credit_card?.token_id || params.providerParams?.tokenId;
    if (!token) {
      return { error: "Credit Card payment method requires token_id (passed via providerParams.credit_card.token_id or providerParams.tokenId)" };
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
      return { error: "Google Pay payment method requires token_id (passed via providerParams.googlepay.token_id or providerParams.tokenId)" };
    }
    payload.payment_type = "googlepay";
    payload.googlepay = { token_id: token };
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

  return { payload };
}

export function parseCoreChargeResponse(
  method: string,
  data: any,
  orderId: string,
  integerAmount: number
): InvoiceResponse {
  const res: InvoiceResponse = {
    success: true,
    provider: "midtrans",
    orderId: data.order_id || orderId,
    amount: integerAmount,
    reference: data.transaction_id || data.order_id,
    expiresAt: data.expiry_time ? new Date(data.expiry_time) : undefined,
    rawResponse: data,
  };

  if (["bca_va", "bni_va", "bri_va", "cimb_va", "danamon_va", "bsi_va", "seabank_va"].includes(method)) {
    res.vaNumber = data.va_numbers?.[0]?.va_number;
    res.vaBank = data.va_numbers?.[0]?.bank || method.split("_")[0];
  } else if (method === "permata_va") {
    res.vaNumber = data.permata_va_number;
    res.vaBank = "permata";
  } else if (method === "mandiri_va") {
    res.vaNumber = `${data.biller_code}-${data.bill_key}`;
    res.vaBank = "mandiri";
    res.billInfo = { billerCode: data.biller_code, billKey: data.bill_key };
  } else if (method === "qris" || method === "gopay_qris" || method === "shopeepay_qris") {
    // PENTING: Core API QRIS Midtrans TIDAK mengembalikan `qr_string`. Yang tersedia
    // hanya actions[] berisi URL PNG (generate-qr-code / generate-qr-code-v2).
    // `qr_string` tetap dibaca bila ada (jalur BI-SNAP), tetapi sumber andalan adalah QR URL.
    res.qrString = data.qr_string;
    res.qrCodeUrl =
      data.actions?.find((a: any) => a.name === "generate-qr-code-v2")?.url ||
      data.actions?.find((a: any) => a.name === "generate-qr-code")?.url;
  } else if (["gopay", "shopeepay", "dana", "linkaja", "kredivo", "akulaku", "googlepay"].includes(method)) {
    res.deeplink = data.actions?.find((a: any) => a.name === "deeplink-redirect")?.url;
    res.paymentUrl = res.deeplink ||
      data.actions?.find((a: any) => a.name === "web-redirect")?.url ||
      data.actions?.find((a: any) => a.name === "generate-qr-code")?.url ||
      data.redirect_url;
    res.qrCodeUrl = data.actions?.find((a: any) => a.name === "generate-qr-code")?.url;
  } else if (method === "credit_card") {
    res.paymentUrl = data.redirect_url || data.actions?.find((a: any) => a.name === "redirect")?.url;
  } else if (method === "ovo") {
    res.paymentUrl = "";
  } else if (["alfamart", "indomaret"].includes(method)) {
    res.paymentCode = data.payment_code;
  }

  return res;
}
