import { ProviderConfig } from "../types";
import { buildPaypalBasicAuth } from "../providers/paypal/signature";

export class PaypalClient {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox !== false
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";
  }

  private async getAccessToken(): Promise<string> {
    const clientId = this.config.clientKey || this.config.merchantCode || this.config.merchantId || "";
    const clientSecret = this.config.apiKey || this.config.secretKey || "";
    const auth = buildPaypalBasicAuth(clientId, clientSecret);

    const response = await fetch(`${this.getBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });

    const data = await response.json();
    if (!data?.access_token) throw new Error(data?.error_description || "Failed to get PayPal access token");
    return data.access_token;
  }

  /** Ambil detail order PayPal berdasarkan Order ID */
  async getOrder(orderId: string): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.getBaseUrl()}/v2/checkout/orders/${orderId}`, {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return response.json();
  }

  /** Capture order PayPal (mengeksekusi pembayaran yang sudah diapprove buyer) */
  async captureOrder(orderId: string): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.getBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    return response.json();
  }

  /** Refund capture PayPal */
  async refundCapture(captureId: string, amount?: number, currency?: string): Promise<any> {
    const token = await this.getAccessToken();
    const body: any = {};
    if (amount && currency) {
      body.amount = { value: (amount / 100).toFixed(2), currency_code: currency };
      body.note_to_payer = "Refund";
    }

    const response = await fetch(`${this.getBaseUrl()}/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  }

  /** Cek saldo akun PayPal merchant (hanya tersedia di account via Seller REST API) */
  async checkBalance(): Promise<any> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.getBaseUrl()}/v1/reporting/balances`, {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });
    return response.json();
  }

  /** Verifikasi webhook via PayPal Webhook Verification API */
  async verifyWebhookSignature(webhookId: string, body: any, headers: Record<string, string>): Promise<boolean> {
    const token = await this.getAccessToken();
    const verifyBody = {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: typeof body === "string" ? JSON.parse(body) : body,
    };

    const response = await fetch(`${this.getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(verifyBody),
    });

    const data = await response.json();
    return data?.verification_status === "SUCCESS";
  }
}
