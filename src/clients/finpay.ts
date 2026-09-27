import { ProviderConfig } from "../types";
import { httpFetch } from "../utils/http";

/**
 * Klien tipis untuk Finpay Payment Gateway.
 *
 * Selaras dengan `FinpayProvider` dan dokumentasi resmi:
 *   • Auth  : `Authorization: Basic base64(merchantId:merchantKey)`
 *   • Base  : sandbox → https://devo.finnet.co.id, produksi → https://live.finnet.co.id
 *   • Status: GET /pg/payment/card/check/{orderId}
 */
export class FinpayClient {
  private merchantId: string;
  private merchantKey: string;
  private sandbox: boolean;

  constructor(
    config: ProviderConfig | {
      merchantCode?: string;
      merchantId?: string;
      apiKey?: string;
      serverKey?: string;
      secretKey?: string;
      sandbox?: boolean;
    },
  ) {
    this.merchantId = config.merchantCode || (config as any).merchantId || "";
    this.merchantKey =
      config.apiKey || (config as any).merchantKey || (config as any).serverKey || (config as any).secretKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox ? "https://devo.finnet.co.id" : "https://live.finnet.co.id";
  }

  private authorizationHeader(): string {
    return `Basic ${Buffer.from(`${this.merchantId}:${this.merchantKey}`).toString("base64")}`;
  }

  /** Helper HTTP request ke Finpay API dengan Basic auth. */
  async request(endpoint: string, payload?: any, method: "GET" | "POST" = "POST"): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await httpFetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.authorizationHeader(),
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(payload ?? {}) }),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(
        data?.responseMessage || data?.message || `HTTP error! Status: ${response.status} - ${text}`,
      );
    }

    return data;
  }

  /** Cek status transaksi pembayaran Finpay (GET /pg/payment/card/check/{orderId}). */
  async checkTransaction(orderId: string): Promise<any> {
    return this.request(`/pg/payment/card/check/${encodeURIComponent(orderId)}`, undefined, "GET");
  }

  /**
   * Cancel Order — batalkan transaksi yang belum dibayar.
   * Docs: GET /pg/payment/card/cancel/{orderId}
   */
  async cancelOrder(orderId: string): Promise<any> {
    return this.request(`/pg/payment/card/cancel/${encodeURIComponent(orderId)}`, undefined, "GET");
  }

  /**
   * Void — batalkan transaksi yang sudah diotorisasi/dibayar (sebelum settlement).
   * Docs: GET /pg/payment/card/void/{orderId}
   */
  async voidTransaction(orderId: string): Promise<any> {
    return this.request(`/pg/payment/card/void/${encodeURIComponent(orderId)}`, undefined, "GET");
  }
}
