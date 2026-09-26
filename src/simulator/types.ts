import type { ProviderConfig, InvoiceResponse, PaymentMode } from "../types";

export type SimulationStatus = "paid" | "pending" | "failed" | "expired";

export interface SimulatedWebhookEvent {
  provider: string;
  headers: Record<string, string>;
  body: any;
  rawBody: string;
}

export interface CreateWebhookEventParams {
  provider?: string;
  orderId: string;
  amount: number;
  status?: SimulationStatus;
  paymentMethod?: string;
  currency?: string;
  config?: Partial<ProviderConfig>;
  /** Jika true, hasilkan signature salah untuk negative contract testing */
  tampered?: boolean;
}

export interface SimulatedContractFixture {
  provider: string;
  channel: string;
  statusMap: Record<SimulationStatus, {
    statusCode?: string;
    rawStatus: string;
    statusText: string;
  }>;
}
