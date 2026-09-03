import { ProviderConfig } from "../types";
import {
  generateSnapSymmetricSignature,
  generateSnapAsymmetricSignature,
  snapTimestamp,
  snapUtcTimestamp,
  snapExternalId,
} from "../providers/doku/snap";

export interface SnapClientOptions {
  clientId: string;        // doku_key_...
  clientSecret: string;    // SK-...
  privateKey?: string;     // RSA PEM (required for get-token b2b)
  sandbox?: boolean;
  merchantId?: string;
  terminalId?: string;
  partnerServiceId?: string;
  channelId?: string;
}

/**
 * DOKU SNAP HTTP client: handles B2B token caching + signed requests
 * (Create VA, Generate QRIS, e-Wallet payment, query/status).
 */
export class SnapClient {
  private options: SnapClientOptions;
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(options: Partial<ProviderConfig> & SnapClientOptions) {
    this.options = {
      clientId: options.clientId || options.merchantCode || "",
      clientSecret: options.clientSecret || options.apiKey || options.serverKey || options.secretKey || "",
      privateKey: options.privateKey,
      sandbox: !!options.sandbox,
      merchantId: options.merchantId,
      terminalId: options.terminalId,
      partnerServiceId: options.partnerServiceId,
      channelId: options.channelId || "H2H",
    };
  }

  get baseUrl(): string {
    return this.options.sandbox ? "https://api-sandbox.doku.com" : "https://api.doku.com";
  }

  get isConfigured(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret);
  }

  /**
   * Get (cached) B2B access token. Mints a new one when expired.
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiry) {
      return this.token;
    }
    const { clientId, clientSecret, privateKey } = this.options;
    if (!privateKey) {
      throw new Error("DOKU SNAP: RSA privateKey required to obtain B2B access token");
    }

    const endpoint = "/authorization/v1/access-token/b2b";
    // Get-token (asymmetric) requires UTC+0 ISO8601 with Z suffix.
    const timestamp = snapUtcTimestamp();
    const signature = generateSnapAsymmetricSignature(privateKey, clientId, timestamp);

    const response = await fetch(this.baseUrl + endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CLIENT-KEY": clientId,
        "X-TIMESTAMP": timestamp,
        "X-SIGNATURE": signature,
      },
      body: JSON.stringify({ grantType: "client_credentials" }),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}

    if (!response.ok || !data?.accessToken) {
      throw new Error(data?.responseMessage || data?.message || `DOKU SNAP get-token failed: HTTP ${response.status} - ${text}`);
    }

    if (!clientSecret) {
      // still cache token; transaction signing requires clientSecret though
    }

    this.token = data.accessToken;
    const expiresIn = Number(data.expiresIn || 900);
    // Refresh slightly before expiry to avoid races.
    this.tokenExpiry = now + (expiresIn - 30) * 1000;
    return this.token as string;
  }

  clearToken() {
    this.token = null;
    this.tokenExpiry = 0;
  }

  /**
   * Perform a signed SNAP transaction request.
   * @param method        GET/POST
   * @param endpoint      request-target path (e.g. /virtual-accounts/...)
   * @param body          request body (object)
   * @param opts          extra headers (X-DEVICE-ID, X-IP-ADDRESS, etc.)
   */
  async request(
    method: "GET" | "POST",
    endpoint: string,
    body?: any,
    opts: { externalId?: string; deviceId?: string; ipAddress?: string; extraHeaders?: Record<string, string> } = {}
  ): Promise<any> {
    const { clientId, clientSecret, channelId } = this.options;
    if (!clientSecret) {
      throw new Error("DOKU SNAP: clientSecret (Secret Key) required for transaction signing");
    }

    const accessToken = await this.getAccessToken();
    const timestamp = snapTimestamp();
    const externalId = opts.externalId || snapExternalId();
    const payload = body === undefined ? "" : body;
    const signature = generateSnapSymmetricSignature(
      clientSecret,
      method,
      endpoint,
      accessToken,
      payload,
      timestamp
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-PARTNER-ID": clientId,
      "X-EXTERNAL-ID": externalId,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": signature,
      "CHANNEL-ID": channelId || "H2H",
      "Authorization": `Bearer ${accessToken}`,
      ...(opts.deviceId ? { "X-DEVICE-ID": opts.deviceId } : {}),
      ...(opts.ipAddress ? { "X-IP-ADDRESS": opts.ipAddress } : {}),
      ...(opts.extraHeaders || {}),
    };

    const response = await fetch(this.baseUrl + endpoint, {
      method,
      headers,
      body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {}

    if (!response.ok) {
      const err = data?.responseMessage || data?.error?.message || data?.message || `HTTP ${response.status}`;
      throw new Error(`${err}${data?.responseCode ? ` (${data.responseCode})` : ""}`);
    }

    return data;
  }
}
