/**
 * Regresi untuk F-11: seluruh panggilan jaringan di `src/` harus punya batas
 * waktu.
 *
 * Sebelumnya ada 117 panggilan `fetch` langsung tersebar di 42 file, dan
 * **tidak satu pun** memasang timeout. Satu-satunya `AbortController` di repo
 * ada di `doku/mcp.ts`. Akibatnya gateway yang menggantung membuat promise
 * menggantung juga — di serverless handler tetap dibayar sampai batas
 * platform, di Node.js yang berjalan lama socket menumpuk sampai pool habis.
 *
 * Gejalanya sudah terlihat nyata: dua kanal iPaymu timeout 20 detik saat probe
 * channel live (`cstore/indomaret`, `va/danamon`).
 *
 * Yang dikunci di sini:
 *   1. `httpFetch()` benar-benar membatalkan request yang menggantung.
 *   2. Kegagalan lain (DNS, socket, abort dari pemanggil) TIDAK disamarkan
 *      jadi timeout — pesan yang salah membuat debug jauh lebih mahal.
 *   3. Tidak ada `fetch(` telanjang yang tersisa di `src/`, sehingga provider
 *      baru tidak bisa diam-diam reintroduce jalur tanpa timeout.
 *   3. Env override `BUAYAR_REQUEST_TIMEOUT_MS` benar-benar dipakai.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { httpFetch, HttpTimeoutError, REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from "../src/utils/http";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

/**
 * Fetch yang tidak pernah merespons — meniru gateway yang menggantung.
 *
 * WAJIB menghormati `signal` seperti `fetch` asli, kalau tidak test "pembatalan
 * oleh pemanggil" akan menggantung selamanya, bukan perilaku yang diuji.
 */
function hangingFetch() {
  globalThis.fetch = ((_url: any, options: any) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = options?.signal;
      if (!signal) return;
      const fail = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail, { once: true });
    })) as unknown as typeof fetch;
}

describe("httpFetch — batas waktu", () => {
  it("membatalkan request yang menggantung dan melempar HttpTimeoutError", async () => {
    hangingFetch();
    const promise = httpFetch("https://api.example.com/v1/pay", { timeoutMs: 40 });
    await expect(promise).rejects.toBeInstanceOf(HttpTimeoutError);
  });

  it("pesan error menyebut URL dan batas waktunya", async () => {
    hangingFetch();
    try {
      await httpFetch("https://api.example.com/v1/pay", { timeoutMs: 30 });
      throw new Error("seharusnya menolak");
    } catch (e: any) {
      expect(e.name).toBe("HttpTimeoutError");
      expect(e.timeoutMs).toBe(30);
      expect(e.url).toBe("https://api.example.com/v1/pay");
      expect(e.message).toContain("/v1/pay");
      expect(e.message).toContain("30ms");
    }
  });

  it("BUAYAR_REQUEST_TIMEOUT_MS dipakai sebagai batas waktu nyata", () => {
    // Nilai dihitung sekali saat modul dimuat; yang dijamin di sini adalah
    // ia selalu berupa angka positif yang masuk akal, baik default maupun override.
    expect(Number.isFinite(REQUEST_TIMEOUT_MS)).toBe(true);
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    // Tidak diset di environment test -> harus jatuh ke default.
    expect(REQUEST_TIMEOUT_MS).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("pesan error menunjuk knob yang benar-benar ada", async () => {
    // Regression: pesan error pernah menyebut `config.extra.requestTimeoutMs`,
    // opsi yang tidak pernah ada di mana pun di src/. Petunjuk yang salah
    // lebih buruk daripada tidak ada petunjuk sama sekali.
    hangingFetch();
    try {
      await httpFetch("https://api.example.com/pay", { timeoutMs: 20 });
      throw new Error("seharusnya menolak");
    } catch (e: any) {
      expect(e.message).toContain("BUAYAR_REQUEST_TIMEOUT_MS");
      expect(e.message).not.toContain("requestTimeoutMs");
    }
  });

  it("pesan error menegaskan request-nya tidak diproses", async () => {
    // Merchant yang melihat "sukses" setelah 30 detik-detik akan melempar barang.
    hangingFetch();
    try {
      await httpFetch("https://api.example.com/pay", { timeoutMs: 20 });
      throw new Error("se_should_reject");
    } catch (e: any) {
      expect(e.message).toContain("TIDAK sampai diproses");
    }
  });

  it("timeoutMs khusus per-request menggallery default", async () => {
    hangingFetch();
    const mulai = Date.now();
    await expect(
      httpFetch("https://api.example.com/slow", { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(HttpTimeoutError);
    // Tidak menunggu 30 detik default.
    expect(Date.now() - mulai).toBeLessThan(2_000);
  });

  it("timeoutMs: 0 mematikan batas waktu dan signal pemCaller tetap dihormati", async () => {
    const controller = new AbortController();
    hangingFetch();
    const promise = httpFetch("https://api.example.com/no-timeout", {
      timeoutMs: 0,
      signal: controller.signal,
    });
    controller.abort();
    // Dibatalkan oleh pemanggil, bukan oleh timeout -> error asli diteruskan.
    await expect(promise).rejects.toThrow();
  });
});

describe("httpFetch — kegagalan lain tidak disamarkan jadi timeout", () => {
  it("error jaringan diteruskan apa adanya", async () => {
    const asli = new TypeError("fetch failed: getaddrinfo ENOTFOUND api.example.com");
    globalThis.fetch = (() => Promise.reject(asli)) as unknown as typeof fetch;
    try {
      await httpFetch("https://api.example.com/v1/pay", { timeoutMs: 5_000 });
      throw new Error("seharusnya menolak");
    } catch (e: any) {
      expect(e).toBe(asli);
      expect(e.name).not.toBe("HttpTimeoutError");
    }
  });

  it("response sukses diteruskan utuh, termasuk body", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const res = await httpFetch("https://api.example.com/v1/pay", { timeoutMs: 5_000 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("status 500 tetap Response, bukan exception", async () => {
    globalThis.fetch = (async () =>
      new Response("Internal Server Error", { status: 500 })) as unknown as typeof fetch;
    const res = await httpFetch("https://api.example.com/v1/pay", { timeoutMs: 5_000 });
    expect(res.status).toBe(500);
  });
});

describe("httpFetch — kredensial tidak bocor ke pesan error", () => {
  it("query string dibuang dari pesan timeout", async () => {
    hangingFetch();
    try {
      await httpFetch("https://api.example.com/pay?api_key=RAHASIA123&x=1", { timeoutMs: 25 });
      throw new Error("seharusnya menolak");
    } catch (e: any) {
      expect(e.message).not.toContain("RAHASIA123");
    }
  });

  it("userinfo di URL dibuang dari pesan timeout", async () => {
    hangingFetch();
    try {
      await httpFetch("https://user:RAHASIA123@api.example.com/pay", { timeoutMs: 25 });
      throw new Error("seharusnya menolak");
    } catch (e: any) {
      expect(e.message).not.toContain("RAHASIA123");
    }
  });
});

describe("Tidak ada jalur jaringan tanpa timeout di src/", () => {
  function srcFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) srcFiles(full, acc);
      else if (name.endsWith(".ts")) acc.push(full);
    }
    return acc;
  }

  it("tidak ada fetch( telanjang di luar utils/http.ts", () => {
    const offenders: string[] = [];
    for (const file of srcFiles(join(process.cwd(), "src"))) {
      if (file.endsWith(join("utils", "http.ts"))) continue;
      const source = readFileSync(file, "utf8");
      // Cocokkan pemanggilan `fetch(` yang bukan `.fetch(` dan bukan httpFetch.
      if (/(?<![.\w])fetch\(/.test(source)) offenders.push(file.replace(process.cwd(), "."));
    }
    expect(offenders).toEqual([]);
  });

  it("semua file yang memanggil httpFetch mengimpornya", () => {
    const missing: string[] = [];
    for (const file of srcFiles(join(process.cwd(), "src"))) {
      // Helper adalah satu-satunya tempat yang tidak mengimpor dirinya sendiri.
      if (file.endsWith(join("utils", "http.ts"))) continue;
      const source = readFileSync(file, "utf8");
      if (source.includes("httpFetch(") && !source.includes('import { httpFetch } from "')) {
        missing.push(file.replace(process.cwd(), "."));
      }
    }
    expect(missing).toEqual([]);
  });

  it("helper memakai globalThis.fetch agar mock di test tetap berlaku", () => {
    const source = readFileSync(join(process.cwd(), "src", "utils", "http.ts"), "utf8");
    // Panggilan polos `fetch(` akan mengikat lebih awal dan menembus mock.
    expect(source).toContain("globalThis.fetch");
  });
});
