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
} from "../types";

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
  }

  registerProvider(provider: BasePaymentProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  getProvider(name: string): BasePaymentProvider {
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

  // ─── Unified Operations ──────────────────────────────────────────────────

  async createInvoice(
    providerName: string,
    params: CreateInvoiceParams,
    config: ProviderConfig
  ): Promise<InvoiceResponse> {
    const provider = this.getProvider(providerName);
    return provider.createInvoice(params, config);
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
    const provider = this.getProvider(providerName);
    return provider.getPaymentMethods(params, config);
  }

  async checkTransaction(
    providerName: string,
    params: CheckTransactionParams,
    config: ProviderConfig
  ): Promise<CheckTransactionResult> {
    const provider = this.getProvider(providerName);
    return provider.checkTransaction(params, config);
  }

  async probePaymentMethods(
    providerName: string,
    config: ProviderConfig
  ): Promise<{ success: boolean; enabled: string[]; error?: string }> {
    const provider = this.getProvider(providerName);
    if (provider.probePaymentMethods) {
      return provider.probePaymentMethods(config);
    }
    return { success: false, enabled: [], error: `Provider '${providerName}' does not support payment methods probing` };
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
    const name = providerName.toLowerCase();
    try {
      switch (name) {
        case "duitku": {
          const data = await this.getDuitkuClient(config).disburse({
            bankCode: params.bankCode,
            bankAccount: params.accountNumber,
            amount: params.amount,
            purpose: params.description || "Disbursement",
            merchantOrderId: params.externalId,
          });
          return { success: data?.statusCode === "00", supported: true, provider: "duitku", reference: params.externalId, status: data?.statusMessage, rawResponse: data };
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
        default:
          return this.unsupported(false, name, "disburse");
      }
    } catch (e: any) {
      return { success: false, supported: true, provider: name, rawResponse: null, error: e.message || "Disbursement failed" };
    }
  }
}

export const paymentManager = new PaymentManager();
