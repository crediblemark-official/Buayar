/**
 * HTTP client bersama untuk seluruh provider.
 *
 * Kenapa helper ini ada: sebelumnya 117 panggilan `fetch` langsung tersebar di
 * `src/`, dan **tidak satu pun** punya timeout. Akibatnya gateway yang
 * menggantung membuat promise menggantung juga:
 *
 *   • Di serverless (Vercel/Lambda), handler dipaksa jalan sampai batas
 *     platform dan tetap dibayar — meski tidak ada yang terjadi.
 *   • Di Node.js yang berjalan lama, socket & koneksi ke PG terus tertahan
 *     sampai pool habis, lalu request sah ikut gagal.
 *
 * Helper ini menambahkan batas waktu yang seragam dengan pesan error yang bisa
 * ditindaklanjuti, tanpa mengubah bentuk pemanggilan: tetap `fetch(url, opts)`.
 *
 * Catatan penting: helper ini memanggil `globalThis.fetch`, BUKAN `fetch`.
 * Dengan begitu mock `globalThis.fetch` di test tetap berlaku.
 */

/** Batas waktu default untuk satu permintaan ke gateway. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Batas waktu yang benar-benar dipakai, bisa dioverride via env.
 *
 * `BUAYAR_REQUEST_TIMEOUT_MS` berguna untuk merchant dengan gateway lambat —
 * beberapa kanal memang butuh lebih dari 30 detik. Nilai tidak valid diabaikan,
 * bukan dipakai apa adanya.
 */
export const REQUEST_TIMEOUT_MS = (() => {
  const raw = Number(process.env.BUAYAR_REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
})();

/** Error yang dilempar saat permintaan melewati batas waktu. */
export class HttpTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(
      `Permintaan ke ${safeUrl(url)} melewati batas waktu ${timeoutMs}ms dan ` +
        `dibatalkan. Gateway tidak merespons -- permintaan ini TIDAK sampai diproses, ` +
        `jadi jangan dianggap berhasil. Kalau ini kejadian yang wajar, naikkan batas ` +
        `waktu lewat env BUAYAR_REQUEST_TIMEOUT_MS; kalau tidak, periksa status ` +
        `layanan provider.`,
    );
    this.name = "HttpTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export interface HttpFetchOptions extends RequestInit {
  /**
   * Batas waktu khusus untuk permintaan ini, dalam milidetik.
   * Menggantikan `REQUEST_TIMEOUT_MS`. Set `0` atau `Infinity` untuk dinonaktifkan
   * (hanya untuk operasi yang memang boleh menggantung, mis. operasi admin).
   */
  timeoutMs?: number;
}

/** Buang query string & userinfo supaya tidak bocor ke log saat error. */
function safeUrl(url: string): string {
  const cut = url.split("?")[0];
  return cut.replace(/\/\/[^@/]*@/, "//<redacted>@");
}

/**
 * `fetch` dengan batas waktu.
 *
 * Semua panggilan jaringan di dalam `src/` memakai ini, bukan `fetch` langsung,
 * supaya tidak ada jalur yang bisa lupa memasang timeout.
 */
export function httpFetch(url: string, options: HttpFetchOptions = {}): Promise<Response> {
  const { timeoutMs, signal, ...rest } = options;
  const limit = timeoutMs ?? REQUEST_TIMEOUT_MS;

  // Timeout dinonaktifkan secara eksplisit — tetap hormati signal pemanggil.
  if (!Number.isFinite(limit) || limit <= 0) {
    return globalThis.fetch(url, signal ? { ...rest, signal } : rest);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limit);

  // Signal dari pemanggil (mis. pembatalan request) digabung dengan timeout,
  // bukan saling menimpa.
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const done = () => {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  };

  return globalThis
    .fetch(url, { ...rest, signal: controller.signal })
    .then(
      (res) => {
        done();
        return res;
      },
      (err) => {
        done();
        // Abort karena timeout → pesan yang bisa ditindaklanjuti. Abort karena
        // pemanggil, atau error jaringan lain → teruskan apa adanya.
        if (controller.signal.aborted && !signal?.aborted) {
          throw new HttpTimeoutError(url, limit);
        }
        throw err;
      },
    );
}
