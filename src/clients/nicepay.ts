import { ProviderConfig } from "../types";
import { formatNicepayTimestamp, generateNicepayToken } from "../providers/nicepay/signature";
import { sha256 } from "../utils/crypto";

export class NicepayClient {
  private iMid: string;
  private merchantKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; merchantId?: string; iMid?: string; apiKey?: string; serverKey?: string; secretKey?: string; sandbox?: boolean }) {
    this.iMid = config.merchantCode || (config as any).merchantId || (config as any).iMid || "";
    this.merchantKey = config.apiKey || (config as any).merchantKey || (config as any).serverKey || (config as any).secretKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://dev.nicepay.co.id/nicepay"
      : "https://www.nicepay.co.id/nicepay";
  }

  /**
   * Helper HTTP Request ke Nicepay API
   */
  async request(endpoint: string, payload: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(data?.resultMsg || data?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek status transaksi pembayaran di Nicepay
   */
  async checkTransaction(referenceNo: string, amount: number = 0): Promise<any> {
    const timeStamp = formatNicepayTimestamp();
    const merchantToken = generateNicepayToken(timeStamp, this.iMid, referenceNo, amount, this.merchantKey);

    return this.request("/api/oneStepTransInquiry.do", {
      timeStamp,
      iMid: this.iMid,
      referenceNo,
      amt: String(amount),
      merchantToken,
    });
  }

  /**
   * Batalkan transaksi di Nicepay
   */
  async cancelTransaction(tXid: string, payMethod: string, cancelMsg: string = "User Cancel"): Promise<any> {
    const timeStamp = formatNicepayTimestamp();
    const merchantToken = sha256(`${timeStamp}${this.iMid}${tXid}0${this.merchantKey}`);

    return this.request("/api/oneStepTransCancel.do", {
      timeStamp,
      iMid: this.iMid,
      tXid,
      payMethod,
      cancelType: "1",
      cancelMsg,
      merchantToken,
    });
  }
}
