import { describe, expect, it } from "bun:test";
import { Buayar, buayar } from "../src";

/**
 * Instance default `buayar` dibuat **lazy** (lihat `src/core/buayar.ts`).
 *
 * Sebelumnya instance di-construct di module scope, sehingga `import` dari paket ini
 * sudah membaca environment + mencetak peringatan autodetect provider. Test di bawah
 * mengunci perilaku baru: import bebas efek samping, tetapi proxy tetap berperilaku
 * seperti instance `Buayar` biasa saat diakses.
 */
describe("Default singleton `buayar` (lazy proxy)", () => {
  it("berperilaku sebagai instance Buayar yang sah", () => {
    expect(buayar instanceof Buayar).toBe(true);
    expect("getConfig" in buayar).toBe(true);
    expect(typeof buayar.getConfig).toBe("function");

    // Getter class juga harus tembus lewat proxy.
    expect(buayar.provider).toBe(new Buayar().provider);

    // Konfigurasi yang dihasilkan identik dengan instance baru pada environment sama.
    const viaProxy = buayar.getConfig();
    const fresh = new Buayar().getConfig();
    expect(viaProxy.provider).toBe(fresh.provider);
    expect(viaProxy.apiKey).toBe(fresh.apiKey);
  });

  it("method tetap terikat meski di-destructure", () => {
    const { getConfig } = buayar;
    expect(typeof getConfig).toBe("function");
    expect(getConfig().provider).toBe(buayar.provider);
  });

  it("state-nya tunggal, tidak bocor ke instance lain", () => {
    buayar.setConfig({ provider: "midtrans", apiKey: "singleton-key-test" });
    expect(buayar.provider).toBe("midtrans");
    expect(buayar.getConfig().apiKey).toBe("singleton-key-test");

    // Instance terpisah tidak terpengaruh oleh mutasi singleton.
    expect(new Buayar().getConfig().apiKey).not.toBe("singleton-key-test");
  });
});
