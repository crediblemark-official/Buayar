import { ProviderConfig } from "../types";

export class MidtransClient {
  private apiKey: string;
  private sandbox: boolean;

  constructor(config: { apiKey: string; sandbox: boolean } | ProviderConfig) {
    this.apiKey = config.apiKey;
    this.sandbox = config.sandbox;
  }

  private getApiBaseUrl() {
    return this.sandbox
      ? "https://api.sandbox.midtrans.com/v2"
      : "https://api.midtrans.com/v2";
  }

  private async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body: any
  ): Promise<any> {
    let url = path.startsWith("http") ? path : `${this.getApiBaseUrl()}${path}`;

    if (!path.startsWith("http") && (path.startsWith("/v1/") || path.startsWith("/v2/"))) {
      url = `${this.sandbox ? "https://api.sandbox.midtrans.com" : "https://api.midtrans.com"}${path}`;
    }

    const authHeader = `Basic ${Buffer.from(this.apiKey + ":").toString("base64")}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": authHeader,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(data?.message || data?.status_message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data || text;
  }

  // ─── TRANSACTION ACTIONS ─────────────────────────────────────────────────────

  async cancelTransaction(orderId: string): Promise<any> {
    return this.request("POST", `/${orderId}/cancel`, null);
  }

  async refundTransaction(
    orderId: string,
    payload: { refund_key?: string; amount?: number; reason?: string }
  ): Promise<any> {
    return this.request("POST", `/${orderId}/refund`, payload);
  }

  async expireTransaction(orderId: string): Promise<any> {
    return this.request("POST", `/${orderId}/expire`, null);
  }

  async approveTransaction(orderId: string): Promise<any> {
    return this.request("POST", `/${orderId}/approve`, null);
  }

  async denyTransaction(orderId: string): Promise<any> {
    return this.request("POST", `/${orderId}/deny`, null);
  }

  async captureTransaction(transactionId: string, amount?: number): Promise<any> {
    const payload = amount ? { transaction_id: transactionId, gross_amount: Math.round(amount) } : { transaction_id: transactionId };
    return this.request("POST", "/capture", payload);
  }

  // ─── GOPAY TOKENIZATION API ──────────────────────────────────────────────────

  async linkPayAccount(payload: any): Promise<any> {
    return this.request("POST", "/v2/pay/account", payload);
  }

  async getPayAccount(accountId: string): Promise<any> {
    return this.request("GET", `/v2/pay/account/${accountId}`, null);
  }

  async unbindPayAccount(accountId: string): Promise<any> {
    return this.request("POST", `/v2/pay/account/${accountId}/unbind`, null);
  }

  async getGoPayPromo(accountId: string, grossAmount: number, currency: string = "IDR"): Promise<any> {
    return this.request("GET", `/v2/gopay/promo/${accountId}?gross_amount=${grossAmount}&currency=${currency}`, null);
  }

  // ─── SUBSCRIPTION API ────────────────────────────────────────────────────────

  async createSubscription(payload: any): Promise<any> {
    return this.request("POST", "/v1/subscriptions", payload);
  }

  async getSubscription(subscriptionId: string): Promise<any> {
    return this.request("GET", `/v1/subscriptions/${subscriptionId}`, null);
  }

  async updateSubscription(subscriptionId: string, payload: any): Promise<any> {
    return this.request("PATCH", `/v1/subscriptions/${subscriptionId}`, payload);
  }

  async disableSubscription(subscriptionId: string): Promise<any> {
    return this.request("POST", `/v1/subscriptions/${subscriptionId}/disable`, null);
  }

  async enableSubscription(subscriptionId: string): Promise<any> {
    return this.request("POST", `/v1/subscriptions/${subscriptionId}/enable`, null);
  }

  // ─── PAYMENT LINK API ────────────────────────────────────────────────────────

  async createPaymentLink(payload: any): Promise<any> {
    return this.request("POST", "/v1/payment-links", payload);
  }

  async getPaymentLink(paymentLinkId: string): Promise<any> {
    return this.request("GET", `/v1/payment-links/${paymentLinkId}`, null);
  }

  async deletePaymentLink(paymentLinkId: string): Promise<any> {
    return this.request("DELETE", `/v1/payment-links/${paymentLinkId}`, null);
  }

  // ─── BALANCE API ─────────────────────────────────────────────────────────────

  async getBalance(): Promise<any> {
    try {
      return await this.request("GET", "/v1/balance", null);
    } catch (e: any) {
      try {
        const irisUrl = `${this.sandbox ? "https://api.sandbox.midtrans.com" : "https://api.midtrans.com"}/iris/api/v1/balance`;
        const authHeader = `Basic ${Buffer.from(this.apiKey + ":").toString("base64")}`;
        const response = await fetch(irisUrl, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Authorization": authHeader,
          },
        });
        const text = await response.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (err) {}
        if (response.ok) return data || text;
      } catch (irisErr) {}
      throw e;
    }
  }

  // ─── INVOICING API ───────────────────────────────────────────────────────────

  async createBillingInvoice(payload: any): Promise<any> {
    return this.request("POST", "/v1/invoices", payload);
  }

  async getBillingInvoice(invoiceId: string): Promise<any> {
    return this.request("GET", `/v1/invoices/${invoiceId}`, null);
  }

  async voidBillingInvoice(invoiceId: string): Promise<any> {
    return this.request("PATCH", `/v1/invoices/${invoiceId}/void`, null);
  }

  async convertBillingInvoice(invoiceId: string): Promise<any> {
    return this.request("PATCH", `/v1/invoices/${invoiceId}/convert`, null);
  }
}
