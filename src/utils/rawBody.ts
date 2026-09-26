/**
 * Helper untuk provider yang verifikasi signature atas RAW REQUEST BODY.
 *
 * Kenapa ini penting:
 * Beberapa payment gateway (Stripe, Checkout.com, Razorpay, Square, PayU, Braintree,
 * DOKU Snap, SumoPod) menghitung HMAC atas **byte persis** yang mereka kirim.
 * `JSON.stringify(obj)` TIDAK PERNAH menghasilkan byte yang identik — urutan key,
 * spasi, dan escape Unicode bisa berbeda. Jadi mem-parse body lalu serialisasi ulang
 * dijamin menghasilkan signature mismatch.
 *
 * Aturan yang dipegang library ini:
 * - Raw body hanya dianggap tersedia kalau benar-benar diterima sebagai string/Buffer.
 * - Kalau tidak tersedia, verifikasi **fail-closed** dengan pesan yang bisa ditindaklanjuti,
 *   bukan diam-diam memakai hasil serialisasi yang salah.
 */

export const RAW_BODY_REQUIRED_MESSAGE =
  "This provider verifies the webhook signature over the raw request body. " +
  "Pass the unparsed body as config.rawBody — e.g. Express: " +
  "app.post('/webhook', express.raw({ type: 'application/json' }), handler) and forward req.body; " +
  "Hono: await c.req.text(); Next.js: await request.text(). " +
  "Do not pass a pre-parsed object: JSON.stringify output never byte-matches what the provider signed.";

/**
 * Ambil raw body dari config, atau `undefined` kalau tidak tersedia.
 * Mengembalikan string apa adanya (tanpa serialisasi ulang) — itu inti dari kontrak ini.
 */
export function resolveRawBody(config: any, fallbackBody?: any): string | undefined {
  const raw = config?.rawBody ?? config?.extra?.rawBody;
  if (typeof raw === "string") return raw;
  // Buffer (Express raw body middleware menghasilkan Buffer)
  if (raw && typeof raw === "object" && typeof raw.toString === "function") return raw.toString("utf8");
  if (typeof fallbackBody === "string") return fallbackBody;
  return undefined;
}
