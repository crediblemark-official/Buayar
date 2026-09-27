import { BasePaymentProvider } from "../providers/base";
import { DuitkuProvider } from "../providers/duitku/provider";
import { MidtransProvider } from "../providers/midtrans/provider";
import { IpaymuProvider } from "../providers/ipaymu/provider";
import { XenditProvider } from "../providers/xendit/provider";
import { DokuProvider } from "../providers/doku/provider";
import { PrismalinkProvider } from "../providers/prismalink/provider";
import { FaspayProvider } from "../providers/faspay/provider";
import { FinpayProvider } from "../providers/finpay/provider";
import { NicepayProvider } from "../providers/nicepay/provider";
import { OyProvider } from "../providers/oy/provider";
import { StripeProvider } from "../providers/stripe/provider";
import { PaypalProvider } from "../providers/paypal/provider";
import { AdyenProvider } from "../providers/adyen/provider";
import { CheckoutComProvider } from "../providers/checkoutcom/provider";
import { RazorpayProvider } from "../providers/razorpay/provider";
import { SquareProvider } from "../providers/square/provider";
import { PayuProvider } from "../providers/payu/provider";
import { BraintreeProvider } from "../providers/braintree/provider";
import { TwoCheckoutProvider } from "../providers/twocheckout/provider";
import { SumopodProvider } from "../providers/sumopod/provider";
import { XenithProvider } from "../providers/xenith/provider";
import { MidtransClient } from "../clients/midtrans";
import { DuitkuClient } from "../clients/duitku";
import { IpaymuClient } from "../clients/ipaymu";
import { XenditClient } from "../clients/xendit";
import { DokuClient } from "../clients/doku";
import { PrismalinkClient } from "../clients/prismalink";
import { FaspayClient } from "../clients/faspay";
import { FinpayClient } from "../clients/finpay";
import { NicepayClient } from "../clients/nicepay";
import { OyClient } from "../clients/oy";
import { StripeClient } from "../clients/stripe";
import { PaypalClient } from "../clients/paypal";
import { AdyenClient } from "../clients/adyen";
import { CheckoutComClient } from "../clients/checkoutcom";
import { RazorpayClient } from "../clients/razorpay";
import { SquareClient } from "../clients/square";
import { PayuClient } from "../clients/payu";
import { BraintreeClient } from "../clients/braintree";
import { TwoCheckoutClient } from "../clients/twocheckout";
import { SumopodClient } from "../clients/sumopod";
import { XenithClient } from "../clients/xenith";
import {
  CreateInvoiceParams,
  InvoiceResponse,
  VerifyCallbackResult,
  ProviderConfig,
  GetPaymentMethodsParams,
  GetPaymentMethodsResult,
  CheckTransactionParams,
  CheckTransactionResult,
  RefundParams,
  RefundResult,
  CheckBalanceResult,
  DisburseParams,
  DisburseResult,
  resolvePaymentMethodCode,
} from "../types";
import { providerRegistry } from "./providerRegistry";
import { simulatorEngine } from "../simulator/engine";
import { validateRequiredCustomerFields } from "./requirements";

export class PaymentManager {
  private providers: Map<string, BasePaymentProvider> = new Map();

  constructor() {
    // Register Indonesian providers
    this.registerProvider(new DuitkuProvider());
    this.registerProvider(new MidtransProvider());
    this.registerProvider(new IpaymuProvider());
    this.registerProvider(new XenditProvider());
    this.registerProvider(new DokuProvider());
    this.registerProvider(new PrismalinkProvider());
    this.registerProvider(new FaspayProvider());
    this.registerProvider(new FinpayProvider());
    this.registerProvider(new NicepayProvider());
    this.registerProvider(new OyProvider());
    // Register International providers
    this.registerProvider(new StripeProvider());
    this.registerProvider(new PaypalProvider());
    this.registerProvider(new AdyenProvider());
    this.registerProvider(new CheckoutComProvider());
    this.registerProvider(new RazorpayProvider());
    this.registerProvider(new SquareProvider());
    this.registerProvider(new PayuProvider());
    this.registerProvider(new BraintreeProvider());
    this.registerProvider(new TwoCheckoutProvider());
    this.registerProvider(new SumopodProvider());
    this.registerProvider(new XenithProvider());
  }

  registerProvider(provider: BasePaymentProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  getProvider(name: string): BasePaymentProvider {
    if (!name) {
      throw new Error(
        "No payment provider configured. Set BUAYAR_PROVIDER (e.g. BUAYAR_PROVIDER=midtrans) in environment or specify { provider: '...' } in config."
      );
    }
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Payment provider '${name}' is not registered`);
    }
    return provider;
  }

  // ─── Indonesian Provider Getters ──────────────────────────────────────────

  getMidtransProvider(): MidtransProvider {
    return this.getProvider("midtrans") as MidtransProvider;
  }

  getMidtransClient(config: ProviderConfig): MidtransClient {
    return new MidtransClient(config);
  }

  getDuitkuProvider(): DuitkuProvider {
    return this.getProvider("duitku") as DuitkuProvider;
  }

  getDuitkuClient(config: ProviderConfig): DuitkuClient {
    return new DuitkuClient(config);
  }

  getIpaymuProvider(): IpaymuProvider {
    return this.getProvider("ipaymu") as IpaymuProvider;
  }

  getIpaymuClient(config: ProviderConfig): IpaymuClient {
    return new IpaymuClient(config);
  }

  getXenditProvider(): XenditProvider {
    return this.getProvider("xendit") as XenditProvider;
  }

  getXenditClient(config: ProviderConfig): XenditClient {
    return new XenditClient(config);
  }

  getDokuProvider(): DokuProvider {
    return this.getProvider("doku") as DokuProvider;
  }

  getDokuClient(config: ProviderConfig): DokuClient {
    return new DokuClient(config);
  }

  getPrismalinkProvider(): PrismalinkProvider {
    return this.getProvider("prismalink") as PrismalinkProvider;
  }

  getPrismalinkClient(config: ProviderConfig): PrismalinkClient {
    return new PrismalinkClient(config);
  }

  getFaspayProvider(): FaspayProvider {
    return this.getProvider("faspay") as FaspayProvider;
  }

  getFaspayClient(config: ProviderConfig): FaspayClient {
    return new FaspayClient(config);
  }

  getFinpayProvider(): FinpayProvider {
    return this.getProvider("finpay") as FinpayProvider;
  }

  getFinpayClient(config: ProviderConfig): FinpayClient {
    return new FinpayClient(config);
  }

  getNicepayProvider(): NicepayProvider {
    return this.getProvider("nicepay") as NicepayProvider;
  }

  getNicepayClient(config: ProviderConfig): NicepayClient {
    return new NicepayClient(config);
  }

  getOyProvider(): OyProvider {
    return this.getProvider("oy") as OyProvider;
  }

  getOyClient(config: ProviderConfig): OyClient {
    return new OyClient(config);
  }

  // ─── International Provider Getters ─────────────────────────────────────

  getStripeProvider(): StripeProvider {
    return this.getProvider("stripe") as StripeProvider;
  }

  getStripeClient(config: ProviderConfig): StripeClient {
    return new StripeClient(config);
  }

  getPaypalProvider(): PaypalProvider {
    return this.getProvider("paypal") as PaypalProvider;
  }

  getPaypalClient(config: ProviderConfig): PaypalClient {
    return new PaypalClient(config);
  }

  getAdyenProvider(): AdyenProvider {
    return this.getProvider("adyen") as AdyenProvider;
  }

  getAdyenClient(config: ProviderConfig): AdyenClient {
    return new AdyenClient(config);
  }

  getCheckoutComProvider(): CheckoutComProvider {
    return this.getProvider("checkoutcom") as CheckoutComProvider;
  }

  getCheckoutComClient(config: ProviderConfig): CheckoutComClient {
    return new CheckoutComClient(config);
  }

  getRazorpayProvider(): RazorpayProvider {
    return this.getProvider("razorpay") as RazorpayProvider;
  }

  getRazorpayClient(config: ProviderConfig): RazorpayClient {
    return new RazorpayClient(config);
  }

  getSquareProvider(): SquareProvider {
    return this.getProvider("square") as SquareProvider;
  }

  getSquareClient(config: ProviderConfig): SquareClient {
    return new SquareClient(config);
  }

  getPayuProvider(): PayuProvider {
    return this.getProvider("payu") as PayuProvider;
  }

  getPayuClient(config: ProviderConfig): PayuClient {
    return new PayuClient(config);
  }

  getBraintreeProvider(): BraintreeProvider {
    return this.getProvider("braintree") as BraintreeProvider;
  }

  getBraintreeClient(config: ProviderConfig): BraintreeClient {
    return new BraintreeClient(config);
  }

  getTwoCheckoutProvider(): TwoCheckoutProvider {
    return this.getProvider("twocheckout") as TwoCheckoutProvider;
  }

  getTwoCheckoutClient(config: ProviderConfig): TwoCheckoutClient {
    return new TwoCheckoutClient(config);
  }

  getSumopodProvider(): SumopodProvider {
    return this.getProvider("sumopod") as SumopodProvider;
  }

  getSumopodClient(config: ProviderConfig): SumopodClient {
    return new SumopodClient(config);
  }

  getXenithProvider(): XenithProvider {
    return this.getProvider("xenith") as XenithProvider;
  }

  getXenithClient(config: ProviderConfig): XenithClient {
    return new XenithClient(config);
  }

  // ─── Unified Operations ──────────────────────────────────────────────────

  async createInvoice(
    providerName: string,
    params: CreateInvoiceParams,
    config: ProviderConfig
  ): Promise<InvoiceResponse> {
    const provider = this.getProvider(providerName);

    // Pre-flight: field customer yang WAJIB diisi provider ini. Tanpa ini, kode
    // yang sama berjalan di 6 provider lalu ditolak iPaymu dengan pesan
    // "phone wajib diisi." yang tidak menjelaskan apa pun. Aturannya diverifikasi
    // terhadap sandbox iPaymu (lihat tests/ipaymu.test.ts).
    //
    // Dilewati saat `simulate`: simulator tidak punya gateway, jadi aturan
    // gateway tidak berlaku — kalau tidak, `BUAYAR_SIMULATE=1` justru jadi
    // lebih ketat dari produksi, yang membingungkan.
    const fieldError = config.simulate
      ? undefined
      : validateRequiredCustomerFields(providerName, params.customer);
    if (fieldError) {
      return {
        success: false,
        provider: providerName,
        orderId: params.orderId,
        amount: params.amount,
        error: fieldError,
        rawResponse: null,
      };
    }

    // K5: Pre-flight capability check — tolak sebelum request bila method tidak didukung
    if (params.paymentMethod) {
      const isRawEscapeHatch =
        typeof params.paymentMethod === "object" &&
        params.paymentMethod !== null &&
        "raw" in params.paymentMethod;

      if (!isRawEscapeHatch) {
        const code = resolvePaymentMethodCode(params.paymentMethod);
        if (code) {
          const canonicalCode = code.toLowerCase().trim();
          const desc = providerRegistry.get(providerName);
          if (desc && desc.methods.length > 0 && !desc.methods.includes(canonicalCode)) {
            return {
              success: false,
              provider: providerName,
              orderId: params.orderId,
              amount: params.amount,
              error: `Payment method '${code}' is not supported by provider '${providerName}'. Supported methods: ${desc.methods.join(", ")}`,
              rawResponse: null,
            };
          }
        }
      }
    }

    const normalizedParams: CreateInvoiceParams = {
      ...params,
      productDetails: params.productDetails || params.description || "Payment",
      description: params.description || params.productDetails || "Payment",
    };

    if (config.simulate) {
      return simulatorEngine.createInvoice(providerName, normalizedParams, config);
    }

    const res = await provider.createInvoice(normalizedParams, config);
    return this.deriveMode(res);
  }

  /**
   * Isi `mode` bila provider tidak mengisinya.
   *
   * Kenapa perlu: hanya 6 dari 21 provider yang benar-benar set `mode`, padahal
   * `InvoiceResponse.mode` adalah field publik yang dipakai render UI. Tanpa
   * ini, `if (inv.mode === "va")` diam-diam selalu false untuk 15 provider
   * lain, dan tidak ada error — persis kelas bug yang paling mahal dicari.
   *
   * Aturan: field yang sudah diisi provider tidak pernah ditimpa. Yang diinfer
   * hanya dari isian yang benar-benar ada, jadi tidak pernah mengarang kanal.
   */
  private deriveMode(res: InvoiceResponse): InvoiceResponse {
    if (res.mode || !res.success) return res;

    // Urutan dari paling spesifik: jangan simpulkan "checkout" hanya karena
    // paymentUrl ada — VA/QRIS/e-wallet juga punya paymentUrl di sebagian PG.
    if (res.vaNumber) return { ...res, mode: "va" };
    if (res.qrString) return { ...res, mode: "qris" };
    if (res.deeplink) return { ...res, mode: "ewallet" };
    if (res.qrCodeUrl) return { ...res, mode: "qris" };
    if (res.paymentUrl) return { ...res, mode: "checkout" };

    return { ...res, mode: "other" };
  }

  async verifyCallback(
    providerName: string,
    body: any,
    config: ProviderConfig
  ): Promise<VerifyCallbackResult> {
    const provider = this.getProvider(providerName);
    return provider.verifyCallback(body, config);
  }

  async getPaymentMethods(
    providerName: string,
    params: GetPaymentMethodsParams,
    config: ProviderConfig
  ): Promise<GetPaymentMethodsResult> {
    if (config.simulate) {
      return simulatorEngine.getPaymentMethods(providerName, params, config);
    }
    const provider = this.getProvider(providerName);
    return provider.getPaymentMethods(params, config);
  }

  async checkTransaction(
    providerName: string,
    params: CheckTransactionParams,
    config: ProviderConfig
  ): Promise<CheckTransactionResult> {
    // Normalisasi di sini, bukan di 21 provider: `merchantOrderId` (order milik
    // merchant) dan `transactionId` (ID dari gateway) sama-sama bisa jadi input,
    // tapi hanya sebagian provider yang memakai yang mana. Tanpa ini, pemanggil
    // harus hafal per provider — persis yang harus dihindari oleh SDK ini.
    //
    // iPaymu butuh `transactionId` (TransactionId numerik dari PG); sisa 20
    // provider memakai `merchantOrderId` milik merchant. Fallback di sini
    // menyatukan keduanya: kode lama yang hanya mengirim `merchantOrderId`
    // tetap jalan, dan iPaymu bisa menerima `transactionId` dengan nama yang
    // tidak menyesatkan.
    const transactionId = (params.transactionId || params.merchantOrderId || "").trim();
    const merchantOrderId = (params.merchantOrderId || params.transactionId || "").trim();

    if (!transactionId && !merchantOrderId) {
      return {
        success: false,
        provider: providerName,
        orderId: "",
        reference: "",
        amount: 0,
        statusCode: "",
        status: "failed",
        isPaid: false,
        rawResponse: null,
        error:
          "checkTransaction requires an identifier. Pass `merchantOrderId` (the orderId you " +
          "sent to createInvoice) for most providers, or `transactionId` for iPaymu " +
          "(use createInvoice's `reference`). Neither was provided.",
      } as CheckTransactionResult;
    }

    const normalized: CheckTransactionParams = { ...params, transactionId, merchantOrderId };

    if (config.simulate) {
      return simulatorEngine.checkTransaction(providerName, normalized, config);
    }
    const provider = this.getProvider(providerName);
    return provider.checkTransaction(normalized, config);
  }

  async probePaymentMethods(
    providerName: string,
    config: ProviderConfig
  ): Promise<{ success: boolean; enabled: string[]; source?: "live" | "static"; error?: string }> {
    if (config.simulate) {
      return simulatorEngine.probePaymentMethods(providerName, config);
    }
    const provider = this.getProvider(providerName);
    if (provider.probePaymentMethods) {
      const res = await provider.probePaymentMethods(config);
      return {
        ...res,
        source: (res as any).source || "live",
      };
    }
    // Fallback dinamis: jika provider memiliki getPaymentMethods, manfaatkan untuk probing
    try {
      if (typeof (provider as any).getPaymentMethods === "function") {
        const res = await provider.getPaymentMethods({ amount: 10000 }, config);
        if (res && res.success && Array.isArray(res.methods) && res.methods.length > 0) {
          return {
            success: true,
            enabled: res.methods.map((m: any) => m.paymentMethod),
            source: "static",
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return { success: false, enabled: [], source: "static", error: `Provider '${providerName}' does not support payment methods probing` };
  }

  // ─── Unified Advanced Operations (Refund / Balance / Disburse) ─────────────
  // "Mata tertutup": satu API untuk semua provider yang mendukung fitur.
  // Provider yang tidak mendukung mengembalikan `supported: false` (bukan throw).

  private unsupported(supported: false, provider: string, operation: string, rawResponse: any = null) {
    return { success: false, supported, provider, rawResponse, error: `Provider '${provider}' does not support ${operation}` };
  }

  async refund(
    providerName: string,
    params: RefundParams,
    config: ProviderConfig
  ): Promise<RefundResult> {
    if (config.simulate) {
      return simulatorEngine.refund(providerName, params, config);
    }
    const name = providerName.toLowerCase();
    try {
      switch (name) {
        case "midtrans": {
          const data = await this.getMidtransClient(config).refundTransaction(params.transactionId, {
            amount: params.amount,
            reason: params.reason,
          });
          return { success: true, supported: true, provider: "midtrans", reference: data.transaction_id || data.order_id, status: data.status_message, rawResponse: data };
        }
        case "stripe": {
          const data = await this.getStripeClient(config).createRefund(params.transactionId, params.amount);
          return { success: true, supported: true, provider: "stripe", reference: data.id, status: data.status, rawResponse: data };
        }
        case "paypal": {
          const data = await this.getPaypalClient(config).refundCapture(params.transactionId, params.amount, params.currency);
          return { success: true, supported: true, provider: "paypal", reference: data.id, status: data.status, rawResponse: data };
        }
        case "adyen": {
          const client = this.getAdyenClient(config);
          const merchantAccount = config.extra?.merchantAccount || config.merchantCode || config.merchantId || "";
          const data = await client.refundPayment(params.transactionId, params.amount || 0, params.currency || "IDR", merchantAccount);
          return { success: true, supported: true, provider: "adyen", reference: data.pspReference, status: data.response, rawResponse: data };
        }
        case "checkoutcom": {
          const data = await this.getCheckoutComClient(config).refundPayment(params.transactionId, params.amount);
          return { success: true, supported: true, provider: "checkoutcom", reference: data.reference, status: data.status, rawResponse: data };
        }
        case "razorpay": {
          const data = await this.getRazorpayClient(config).createRefund(params.transactionId, params.amount);
          return { success: true, supported: true, provider: "razorpay", reference: data.id, status: data.status, rawResponse: data };
        }
        case "square": {
          const client = this.getSquareClient(config);
          const currency = (params.currency || "IDR").toUpperCase();
          const idempotencyKey = config.extra?.idempotencyKey || `refund-${params.transactionId}-${Date.now()}`;
          const data = await client.refundPayment(params.transactionId, Math.round(params.amount || 0), currency, idempotencyKey, params.reason);
          const refund = data.refund;
          return { success: !data.errors, supported: true, provider: "square", reference: refund?.id, status: refund?.status, rawResponse: data };
        }
        case "payu": {
          const data = await this.getPayuClient(config).refundOrder(params.transactionId, params.amount, params.reason);
          return { success: true, supported: true, provider: "payu", reference: data.orderId, status: data.status, rawResponse: data };
        }
        case "braintree": {
          const data = await this.getBraintreeClient(config).refundTransaction(params.transactionId, params.amount);
          return { success: true, supported: true, provider: "braintree", reference: data?.transaction?.id, status: data?.transaction?.status, rawResponse: data };
        }
        case "twocheckout": {
          const data = await this.getTwoCheckoutClient(config).refundOrder(params.transactionId, params.amount || 0, params.reason);
          return { success: true, supported: true, provider: "twocheckout", reference: data.refno, status: data.response_code, rawResponse: data };
        }
        default:
          return this.unsupported(false, name, "refund");
      }
    } catch (e: any) {
      return { success: false, supported: true, provider: name, rawResponse: null, error: e.message || "Refund failed" };
    }
  }

  async checkBalance(providerName: string, config: ProviderConfig): Promise<CheckBalanceResult> {
    if (config.simulate) {
      return simulatorEngine.checkBalance(providerName, config);
    }
    const name = providerName.toLowerCase();
    try {
      let balance: number | undefined;
      let currency: string | undefined;
      let raw: any;

      switch (name) {
        case "midtrans": {
          raw = await this.getMidtransClient(config).getBalance();
          balance = raw?.balance ?? raw?.balance_amount ?? raw?.amount;
          break;
        }
        case "duitku": {
          const result = await this.getDuitkuClient(config).checkBalance();
          return { success: result.success, supported: true, provider: "duitku", balance: result.balance, rawResponse: result.rawResponse, error: result.error };
        }
        case "ipaymu": {
          const result = await this.getIpaymuClient(config).checkBalance();
          return { success: result.success, supported: true, provider: "ipaymu", balance: result.balance, rawResponse: result.rawResponse, error: result.error };
        }
        case "xendit": {
          const result = await this.getXenditClient(config).checkBalance("CASH");
          return { success: result.success, supported: true, provider: "xendit", balance: result.balance, rawResponse: result.rawResponse, error: result.error };
        }
        case "oy": {
          raw = await this.getOyClient(config).checkBalance();
          balance = raw?.balance ?? raw?.data?.balance;
          break;
        }
        case "stripe": {
          raw = await this.getStripeClient(config).checkBalance();
          const available = raw?.available?.[0];
          balance = available?.amount;
          currency = available?.currency;
          break;
        }
        case "paypal": {
          raw = await this.getPaypalClient(config).checkBalance();
          const first = raw?.balances?.[0];
          balance = first?.total_balance?.value !== undefined ? Number(first.total_balance.value) * 100 : undefined;
          currency = first?.currency_code;
          break;
        }
        case "checkoutcom": {
          raw = await this.getCheckoutComClient(config).checkBalance();
          const first = raw?.data?.[0]?.available;
          balance = first?.[0]?.value;
          currency = first?.[0]?.currency;
          break;
        }
        case "razorpay": {
          raw = await this.getRazorpayClient(config).checkBalance();
          balance = raw?.balance ?? raw?.amount;
          currency = raw?.currency;
          break;
        }
        case "square": {
          raw = await this.getSquareClient(config).retrieveBalance();
          balance = raw?.balance_money?.amount;
          currency = raw?.balance_money?.currency;
          break;
        }
        case "xenith": {
          raw = await this.getXenithClient(config).getBalances();
          const items: any[] = raw?.data || (Array.isArray(raw) ? raw : []);
          const idr = items.find((i: any) => String(i.currency).toUpperCase() === "IDR") || items[0];
          balance = idr ? parseFloat(idr.availableBalance ?? "0") : undefined;
          currency = idr?.currency || "IDR";
          return {
            success: true,
            supported: true,
            provider: "xenith",
            balance,
            pendingBalance: idr ? parseFloat(idr.pendingBalance ?? "0") : 0,
            heldBalance: idr ? parseFloat(idr.heldBalance ?? "0") + parseFloat(idr.frozenBalance ?? "0") : 0,
            totalBalance: idr ? parseFloat(idr.totalBalance ?? "0") : 0,
            currency,
            rawResponse: raw,
          };
        }
        default:
          return this.unsupported(false, name, "checkBalance");
      }

      return { success: true, supported: true, provider: name, balance, currency, rawResponse: raw };
    } catch (e: any) {
      return { success: false, supported: true, provider: name, rawResponse: null, error: e.message || "Balance check failed" };
    }
  }

  async disburse(
    providerName: string,
    params: DisburseParams,
    config: ProviderConfig
  ): Promise<DisburseResult> {
    if (config.simulate) {
      return simulatorEngine.disburse(providerName, params, config);
    }
    const name = providerName.toLowerCase();
    try {
      switch (name) {
        case "duitku": {
          const hasil = await this.getDuitkuClient(config).disburse({
            bankCode: params.bankCode,
            bankAccount: params.accountNumber,
            amount: params.amount,
            purpose: params.description || "Disbursement",
            disburseId: params.providerParams?.disburseId,
            accountHolderName: params.providerParams?.accountHolderName,
            custRefNumber: params.providerParams?.custRefNumber,
          });
          // `responseCode: "00"` dari Duitku berarti transfer DISETUJUI, bukan
          // uang sudah sampai. Status akhirnya hanya diketahui lewat
          // inquiry status, jadi yang dikembalikan tetap PENDING.
          return {
            success: hasil.success,
            supported: true,
            provider: name,
            reference: hasil.disburseId || params.externalId,
            status: hasil.success ? "PENDING" : "FAILED",
            error: hasil.error,
            rawResponse: hasil.rawResponse,
          };
        }
        case "xendit": {
          const data = await this.getXenditClient(config).createDisbursement({
            externalId: params.externalId,
            bankCode: params.bankCode,
            accountHolderName: params.accountHolderName || "",
            accountNumber: params.accountNumber,
            description: params.description || "Disbursement",
            amount: params.amount,
          });
          return { success: true, supported: true, provider: "xendit", reference: data.id, status: data.status, rawResponse: data };
        }
        case "oy": {
          const data = await this.getOyClient(config).remit({
            recipientBank: params.bankCode,
            recipientAccount: params.accountNumber,
            amount: params.amount,
            note: params.description,
            partnerTrxId: params.externalId,
          });
          return { success: true, supported: true, provider: "oy", reference: params.externalId, status: data?.status, rawResponse: data };
        }
        case "doku": {
          return await this.getDokuProvider().disburse(params, config);
        }
        case "xenith": {
          const data = await this.getXenithClient(config).createPayout({
            initiatedAmount: Math.round(params.amount),
            currency: (params.providerParams?.currency || "IDR").toUpperCase(),
            destinationPayoutMethod: "BANK_TRANSFER",
            destinationPayoutChannel: params.bankCode.toUpperCase(),
            destinationPayoutAccount: params.accountNumber,
            destinationPayoutAccountName: params.accountHolderName || "Beneficiary",
            referenceCode: params.externalId,
            customerReference: params.externalId,
            description: params.description || `Disbursement for ${params.externalId}`,
            callbackUrl: config.callbackUrl || "https://example.com/payout-callback",
          });
          const resData = data?.data || data;
          const statusRaw = String(resData?.status || "").toUpperCase();
          const status = statusRaw === "SUCCESS" || statusRaw === "COMPLETED" ? "SUCCESS" : statusRaw === "FAILED" ? "FAILED" : "PENDING";
          return {
            success: true,
            supported: true,
            provider: "xenith",
            reference: resData?.id || params.externalId,
            status,
            rawResponse: data,
          };
        }
        default:
          return this.unsupported(false, name, "disburse");
      }
    } catch (e: any) {
      return { success: false, supported: true, provider: name, rawResponse: null, error: e.message || "Disbursement failed" };
    }
  }
}

export const paymentManager = new PaymentManager();
