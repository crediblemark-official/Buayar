import { ProviderConfig } from "../types";
import { generateIpaymuSignature } from "../providers/ipaymu/signature";

export class IpaymuClient {
  private va: string;
  private apiKey: string;
  private sandbox: boolean;

  constructor(config: ProviderConfig | { merchantCode?: string; merchantId?: string; apiKey?: string; sandbox?: boolean }) {
    this.va = config.merchantCode || (config as any).merchantId || "";
    this.apiKey = (config as any).apiKey || (config as any).serverKey || "";
    this.sandbox = !!config.sandbox;
  }

  private getBaseUrl(): string {
    return this.sandbox
      ? "https://sandbox.ipaymu.com/api/v2"
      : "https://my.ipaymu.com/api/v2";
  }

  /**
   * Helper request bertanda tangan iPaymu v2
   */
  async request(method: "GET" | "POST", endpoint: string, body?: any): Promise<any> {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const { signature, timestamp } = generateIpaymuSignature(method, this.va, this.apiKey, body);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "va": this.va,
      "signature": signature,
      "timestamp": timestamp,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === "POST" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {}

    if (!response.ok) {
      throw new Error(data?.Message || data?.message || `HTTP error! Status: ${response.status} - ${text}`);
    }

    return data;
  }

  /**
   * Cek saldo merchant iPaymu
   */
  async checkBalance(): Promise<{ success: boolean; balance?: number; rawResponse: any; error?: string }> {
    try {
      const payload = { account: this.va };
      const data = await this.request("POST", "/balance", payload);

      const success = data.Status === 200 || data.status === 200;
      const balance = data.Data?.MerchantBalance ? Number(data.Data.MerchantBalance) : undefined;

      return {
        success,
        balance,
        rawResponse: data,
      };
    } catch (e: any) {
      return {
        success: false,
        rawResponse: null,
        error: e.message || "Failed to check iPaymu balance",
      };
    }
  }

  /**
   * Cek detail transaksi iPaymu
   */
  async checkTransaction(transactionId: string | number): Promise<any> {
    return this.request("POST", "/transaction", { transactionId });
  }

  /**
   * Ambil daftar channel pembayaran aktif milik merchant (Official v2: GET /payment-channels)
   */
  async getPaymentMethods(): Promise<any> {
    return this.request("GET", "/payment-channels");
  }

  /**
   * Alias untuk getPaymentMethods (Official v2)
   */
  async getPaymentChannels(): Promise<any> {
    return this.request("GET", "/payment-channels");
  }

  /**
   * Ambil riwayat transaksi merchant berpaginasi (Official v2: POST /history)
   */
  async getHistory(params?: {
    page?: number;
    limit?: number;
    status?: number;
    date?: string;
    start_date?: string;
    end_date?: string;
    bulkId?: string[];
    [key: string]: any;
  }): Promise<any> {
    const payload = {
      account: this.va,
      page: params?.page || 1,
      limit: params?.limit || 10,
      ...params,
    };
    return this.request("POST", "/history", payload);
  }

  /**
   * Ambil daftar seluruh bank di Indonesia (Official v2: POST /banklist)
   */
  async getBankList(): Promise<any> {
    return this.request("POST", "/banklist", { account: this.va });
  }

  /**
   * Cari jangkauan area pengiriman COD (Official v2: GET /cod/area?area=keyword)
   */
  async getCodArea(area: string): Promise<any> {
    const query = { area };
    return this.request("GET", `/cod/area?area=${encodeURIComponent(area)}`, query);
  }

  /**
   * Hitung tarif ongkir pengiriman COD (Official v2: POST /cod/shipping-calculate)
   */
  async getCodRate(params: {
    pickup_area_id?: string | number;
    destination_area_id?: string | number;
    pickupArea?: string | number;
    deliveryArea?: string | number;
    weight: number;
    amount?: number;
    [key: string]: any;
  }): Promise<any> {
    const { pickupArea, deliveryArea, ...rest } = params;
    const pickupId = params.pickup_area_id !== undefined ? params.pickup_area_id : pickupArea;
    const destId = params.destination_area_id !== undefined ? params.destination_area_id : deliveryArea;
    const payload = {
      ...rest,
      pickup_area_id: pickupId !== undefined ? String(pickupId) : undefined,
      destination_area_id: destId !== undefined ? String(destId) : undefined,
      amount: params.amount || 0,
    };
    return this.request("POST", "/cod/shipping-calculate", payload);
  }

  /**
   * Request pickup kurir COD (Official v2: POST /cod/pickup)
   */
  async getCodPickup(params: {
    transaction_id?: string | number;
    transactionId?: string | number;
    pickup_date: string;
    pickup_time: string;
    pickup_vehicle: "Motor" | "Mobil" | string;
    [key: string]: any;
  }): Promise<any> {
    const { transactionId, ...rest } = params;
    const payload = {
      ...rest,
      transaction_id: params.transaction_id || transactionId,
    };
    return this.request("POST", "/cod/pickup", payload);
  }

  /**
   * Unduh label pengiriman / AWB COD (Official v2: GET /cod/download-label/:transaction_id)
   */
  async getCodAwb(transactionId: string | number): Promise<any> {
    return this.request("GET", `/cod/download-label/${transactionId}`);
  }

  /**
   * Lacak status pengiriman kurir COD berdasarkan no resi / AWB (Official v2: POST /cod/tracking)
   */
  async getCodTracking(params: string | { awb: string; transaction_id?: string | number; transactionId?: string | number }): Promise<any> {
    const payload = typeof params === "string"
      ? { awb: params }
      : {
          awb: params.awb,
          transaction_id: params.transaction_id || params.transactionId,
        };
    return this.request("POST", "/cod/tracking", payload);
  }

  // ==========================================
  // Public Area Lookup API (docs.ipaymu.com/en/docs/area-api)
  // Read-only endpoint untuk provinsi, kota/kabupaten, kecamatan, dan kelurahan
  // ==========================================

  /**
   * Ambil daftar seluruh provinsi di Indonesia
   */
  async getAreasProvince(): Promise<any> {
    const res = await fetch("https://my.ipaymu.com/api/areas/province");
    return res.json();
  }

  /**
   * Ambil daftar kota / kabupaten berdasarkan ID provinsi
   */
  async getAreasCity(provinceId: string | number): Promise<any> {
    const res = await fetch(`https://my.ipaymu.com/api/areas/city/${provinceId}`);
    return res.json();
  }

  /**
   * Ambil daftar kecamatan berdasarkan ID kota / kabupaten
   */
  async getAreasDistrict(cityId: string | number): Promise<any> {
    const res = await fetch(`https://my.ipaymu.com/api/areas/district/${cityId}`);
    return res.json();
  }

  /**
   * Ambil daftar kelurahan berdasarkan ID kecamatan
   */
  async getAreasVillage(districtId: string | number): Promise<any> {
    const res = await fetch(`https://my.ipaymu.com/api/areas/village/${districtId}`);
    return res.json();
  }

  // ==========================================
  // Split Payment — Single Register API
  // https://ipaymu.com/en/split-payment/
  // ==========================================

  /**
   * Daftarkan agen / reseller / mitra baru untuk Split Payment (Single Register API: POST /api/v2/register)
   * Mengembalikan VA child account yang siap digunakan untuk parameter `subAccountId` saat membuat transaksi.
   */
  async registerUser(params: {
    name: string;
    email: string;
    phone: string;
    password?: string;
    [key: string]: any;
  }): Promise<{
    Status: number;
    Success: boolean;
    Message: string;
    Data: {
      Email: string;
      Phone: string;
      Va: string;
      VaName: string;
      IsNewUser: boolean;
      Notes?: string;
    };
  }> {
    const { name, email, phone, password, ...rest } = params;
    const payload = {
      ...rest,
      account: this.va,
      name,
      email,
      phone,
      password: password || "Password123!",
    };
    return this.request("POST", "/register", payload);
  }
}
