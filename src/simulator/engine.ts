import type {
  CreateInvoiceParams,
  InvoiceResponse,
  CheckTransactionParams,
  CheckTransactionResult,
  RefundParams,
  RefundResult,
  CheckBalanceResult,
  DisburseParams,
  DisburseResult,
  ProviderConfig,
  PaymentMode,
} from "../types";
import { resolvePaymentMethodCode } from "../types";
import {
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  UpdateVaParams,
  UpdateVaResult,
  DeleteVaParams,
  DeleteVaResult,
  ValidateBankAccountParams,
  ValidateBankAccountResult,
} from "../types";
import { providerRegistry } from "../core/providerRegistry";
import { getPaymentMethodCategory } from "../utils/category";

export class SimulatorEngine {
  /**
   * Simulasi panggilan createInvoice secara realistis tanpa network request.
   */
  async createInvoice(
    providerName: string,
    params: CreateInvoiceParams,
    config: ProviderConfig
  ): Promise<InvoiceResponse> {
    const orderId = params.orderId;

    // Skenario error deterministik dari orderId
    if (orderId.includes("SIM_TIMEOUT")) {
      throw new Error(`Gateway connection timed out (simulated by ${providerName})`);
    }

    if (orderId.includes("SIM_ERROR")) {
      return {
        success: false,
        provider: providerName,
        orderId,
        amount: params.amount,
        error: `Simulated gateway error for provider '${providerName}'`,
        rawResponse: { simulated: true, error_code: "SIMULATED_FAIL" },
      };
    }

    const methodCode = resolvePaymentMethodCode(params.paymentMethod)?.toLowerCase();
    let mode: PaymentMode = "checkout";
    let vaNumber: string | undefined;
    let vaBank: string | undefined;
    let qrString: string | undefined;
    let qrCodeUrl: string | undefined;
    let deeplink: string | undefined;

    if (methodCode?.includes("_va") || methodCode === "va" || methodCode === "bank_transfer") {
      mode = "va";
      const bank = methodCode.replace("_va", "").toUpperCase();
      vaBank = bank === "VA" ? "BCA" : bank;
      vaNumber = "8808" + Math.floor(100000000000 + Math.random() * 900000000000).toString();
    } else if (methodCode?.includes("qris") || methodCode === "qr") {
      mode = "qris";
      qrString = "00020101021226540014ID.LINKAJA.WWW01189360091100200000010208123456785204581253033605802ID5911BUAYAR SIM6007JAKARTA61051234062070703A016304" + Math.random().toString(16).slice(2, 6).toUpperCase();
      qrCodeUrl = `https://simulator.buayar.dev/qr/${providerName}/${orderId}.png`;
    } else if (
      methodCode === "gopay" ||
      methodCode === "shopeepay" ||
      methodCode === "ovo" ||
      methodCode === "dana" ||
      methodCode === "linkaja"
    ) {
      mode = "ewallet";
      deeplink = `${methodCode}://pay?orderId=${orderId}&amount=${params.amount}`;
    }

    const paymentUrl = `https://simulator.buayar.dev/checkout/${providerName}/${orderId}`;

    return {
      success: true,
      provider: providerName,
      orderId,
      amount: params.amount,
      paymentUrl,
      mode,
      vaNumber,
      vaBank,
      qrString,
      qrCodeUrl,
      deeplink,
      rawResponse: {
        simulated: true,
        provider: providerName,
        orderId,
        amount: params.amount,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Simulasi panggilan checkTransaction secara realistis.
   */
  async checkTransaction(
    providerName: string,
    params: CheckTransactionParams,
    config: ProviderConfig
  ): Promise<CheckTransactionResult> {
    const orderId = params.merchantOrderId || "";

    if (orderId.includes("SIM_PAID") || orderId.includes("PAID") || orderId.includes("SETTLEMENT")) {
      return {
        success: true,
        provider: providerName,
        orderId,
        reference: "REF-" + orderId,
        amount: 10000,
        status: "paid",
        isPaid: true,
        isPending: false,
        isFailed: false,
        isExpired: false,
        statusCode: "200",
        statusMessage: "Settlement / Paid",
        transactionTime: new Date(),
        rawResponse: { simulated: true, status: "PAID" },
      };
    }

    if (orderId.includes("SIM_EXPIRED") || orderId.includes("EXPIRED")) {
      return {
        success: false,
        provider: providerName,
        orderId,
        reference: "REF-" + orderId,
        amount: 10000,
        status: "expired",
        isPaid: false,
        isPending: false,
        isFailed: false,
        isExpired: true,
        statusCode: "407",
        statusMessage: "Transaction Expired",
        transactionTime: new Date(),
        rawResponse: { simulated: true, status: "EXPIRED" },
      };
    }

    if (orderId.includes("SIM_FAILED") || orderId.includes("FAILED") || orderId.includes("DENY")) {
      return {
        success: false,
        provider: providerName,
        orderId,
        reference: "REF-" + orderId,
        amount: 10000,
        status: "failed",
        isPaid: false,
        isPending: false,
        isFailed: true,
        isExpired: false,
        statusCode: "202",
        statusMessage: "Transaction Denied / Failed",
        transactionTime: new Date(),
        rawResponse: { simulated: true, status: "FAILED" },
      };
    }

    return {
      success: true,
      provider: providerName,
      orderId,
      reference: "REF-" + orderId,
      amount: 10000,
      status: "pending",
      isPaid: false,
      isPending: true,
      isFailed: false,
      isExpired: false,
      statusCode: "201",
      statusMessage: "Waiting for payment",
      transactionTime: new Date(),
      rawResponse: { simulated: true, status: "PENDING" },
    };
  }

  /**
   * Simulasi refund terpadu.
   */
  async refund(
    providerName: string,
    params: RefundParams,
    config: ProviderConfig
  ): Promise<RefundResult> {
    return {
      success: true,
      supported: true,
      provider: providerName,
      reference: "sim_ref_" + params.transactionId,
      status: "completed",
      rawResponse: { simulated: true, transactionId: params.transactionId, amount: params.amount },
    };
  }

  /**
   * Simulasi checkBalance.
   */
  async checkBalance(
    providerName: string,
    config: ProviderConfig
  ): Promise<CheckBalanceResult> {
    return {
      success: true,
      supported: true,
      provider: providerName,
      balance: 50000000,
      currency: "IDR",
      rawResponse: { simulated: true, balance: 50000000 },
    };
  }

  /**
   * Simulasi disburse.
   */
  async disburse(
    providerName: string,
    params: DisburseParams,
    config: ProviderConfig
  ): Promise<DisburseResult> {
    return {
      success: true,
      supported: true,
      provider: providerName,
      reference: params.externalId,
      status: "SUCCESS",
      rawResponse: { simulated: true, externalId: params.externalId, amount: params.amount },
    };
  }

  /**
   * Simulasi `getPaymentMethods` — tanpa network.
   *
   * PENTING: katalog yang dikembalikan adalah tabel statik di dalam repo, BUKAN
   * channel yang benar-benar aktif di akun merchant. Karena itu `source` selalu
   * `"static"`. Jangan pakai hasilnya untuk memutuskan channel mana yang
   * guaranteed hidup — untuk itu butuh mode live (`BUAYAR_SIMULATE` tidak di-set).
   */
  async getPaymentMethods(
    providerName: string,
    params: GetPaymentMethodsParams,
    config: ProviderConfig
  ): Promise<GetPaymentMethodsResult> {
    const cap = providerRegistry.get(providerName);
    const methods = cap?.methods || [];
    return {
      success: true,
      provider: providerName,
      methods: methods.map((paymentMethod) => ({
        paymentMethod,
        paymentName: paymentMethod,
        // Katalog statis tidak punya aset/fee PG. Jangan dikarang — pemanggil
        // yang butuh fee & logo harus memanggil provider sungguhan.
        paymentImage: "",
        totalFee: "",
        category: getPaymentMethodCategory(paymentMethod, paymentMethod),
      })),
      rawResponse: { simulated: true, source: "static", provider: providerName },
    };
  }

  /**
   * Simulasi `probePaymentMethods` — selalu static, tidak pernah menyentuh API PG.
   */
  async probePaymentMethods(
    providerName: string,
    config: ProviderConfig
  ): Promise<{ success: boolean; enabled: string[]; source?: "live" | "static"; error?: string }> {
    const cap = providerRegistry.get(providerName);
    return {
      success: true,
      enabled: cap?.methods || [],
      source: "static",
    };
  }

  /**
   * Simulasi operasi Virtual Account khusus DOKU.
   *
   * Ketiganya hanya ada di DOKU (lihat `Buayar.updateVirtualAccount`), jadi tanpa
   * entrain ini `BUAYAR_SIMULATE=1` tetap menembak API DOKU sungguhan — melanggar
   * janji simulator "tanpa memanggil PG".
   */
  async updateVirtualAccount(
    providerName: string,
    params: UpdateVaParams,
    config: ProviderConfig
  ): Promise<UpdateVaResult> {
    return {
      success: true,
      provider: providerName,
      orderId: params.orderId,
      rawResponse: { simulated: true, orderId: params.orderId, vaNumber: params.vaNumber, bank: params.bank, amount: params.amount },
    };
  }

  async deleteVirtualAccount(
    providerName: string,
    params: DeleteVaParams,
    config: ProviderConfig
  ): Promise<DeleteVaResult> {
    return {
      success: true,
      provider: providerName,
      orderId: params.orderId,
      rawResponse: { simulated: true, orderId: params.orderId },
    };
  }

  async validateBankAccount(
    providerName: string,
    params: ValidateBankAccountParams,
    config: ProviderConfig
  ): Promise<ValidateBankAccountResult> {
    return {
      success: true,
      provider: providerName,
      bankCode: params.bankCode,
      accountNumber: params.accountNumber,
      accountHolderName: params.accountHolderName || params.accountNumber,
      rawResponse: { simulated: true, bankCode: params.bankCode, accountNumber: params.accountNumber },
    };
  }
}

export const simulatorEngine = new SimulatorEngine();
