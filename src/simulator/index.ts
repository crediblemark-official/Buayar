import type { ProviderConfig } from "../types";
import type { CreateWebhookEventParams, SimulatedWebhookEvent } from "./types";
import { generateSimulatedWebhook } from "./generator";
import { simulatorEngine, SimulatorEngine } from "./engine";

export * from "./types";
export * from "./fixtures";
export * from "./generator";
export * from "./engine";

export class BuayarSimulator {
  readonly engine: SimulatorEngine;

  constructor(engine: SimulatorEngine = simulatorEngine) {
    this.engine = engine;
  }

  /**
   * Membuat webhook event yang valid atau sengaja salah (tampered) untuk testing lokal/CI.
   */
  createWebhookEvent(
    provider: string,
    params: CreateWebhookEventParams,
    config?: ProviderConfig
  ): SimulatedWebhookEvent {
    return generateSimulatedWebhook(provider, params, config);
  }
}

export const simulator = new BuayarSimulator();
