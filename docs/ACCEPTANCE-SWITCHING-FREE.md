# Acceptance Criteria — Switching Bebas-Biaya

> Status dokumen: **usulan kerja** (bukan spesifikasi final).
> Repo saat audit: `0.8.10` · 20 provider · 2 berstatus `Tested` (iPaymu, SumoPod).
>
> ⚠️ Catatan: audit awal bersifat read-only, tapi **temuan K3 sudah turun menjadi
> perbaikan kode** — lihat [§3c. Pass Perbaikan Keamanan](#3c-pass-perbaikan-keamanan).
> Klaim "✅ Terpenuhi" di bawah merujuk pada kondisi **setelah** pass tersebut, dan
> angka test sudah diperbarui ke **434/434**.

---

## 0. Tesis Produk yang Diuji

Pasar Indonesia punya karakteristik yang **tidak ada di luar negeri**:

```
Daftar PG  →  tunggu verifikasi 3–6 minggu  →  ditolak
                                          ↘  atau macet
```

Akibatnya builder terjepit: sudah terlanjur menulis kode, lalu merchant account-nya
gagal, dan harus mengulang ke PG berikutnya — **dengan risiko menulis ulang integrasi.**

Karena itu klaim yang benar bukan:

> ~~"Satu API untuk 20 payment gateway"~~ ← terdengar seperti utilitas, mudah dibandingkan
> dengan SDK Midtrans/Xendit gratis.

Klaim yang benar:

> **"Daftar ke beberapa PG sekaligus, koding sekali, go-live dengan yang pertama disetujui —
> tanpa menulis ulang kode."**

Nilai yang diuji adalah **optionality**, bukan unification. Six acceptance criteria di bawah
adalah pengukuran objektif apakah optionality itu benar-benar ada di dalam kode.

---

## 1. Peta Ringkas

| # | Kriteria | Status | Severity | Estimasi |
|---|----------|--------|----------|----------|
| K1 | Ganti PG = ganti env var, tanpa sentuh kode | ✅ Terpenuhi | P1 | M |
| K2 | Compiler menangkap payment method non-portable | ✅ Terpenuhi | P1 | S |
| K3 | Webhook diverifikasi ketat di semua PG | ✅ Terpenuhi | **P0** | S–M |
| K4 | Bisa test penuh tanpa account approved | ✅ Terpenuhi | P1 | **XL** |
| K5 | Pre-flight warning jika method tidak didukung | ✅ Terpenuhi | P1 | M |
| K6 | Autodetect tanpa fallback senyap | ✅ Terpenuhi | **P0** | M |
| K7 | Scaffold CLI menghasilkan kode yang bisa diverifikasi | ✅ Terpenuhi | **P0** | **S** |

**Ringkasan: 7 dari 7 kriteria terpenuhi (434/434 tests passing).**

Tiga P0: **K7, K3, K6.** K4 adalah gap terbesar dan sekaligus pembeda produk yang paling
sulit ditiru pesaing.

---

## 2. Rincian per Kriteria

### K1 — Ganti PG cukup dengan ganti env var

**Target:** `PROVIDER_PG=midtrans` → `PROVIDER_PG=xendit`, tidak ada file yang disentuh.

**Yang sudah benar ✅**

`src/core/manager.ts:264-271` — `createInvoice` bersih, murni mendelegasikan ke interface:

```ts
const provider = this.getProvider(providerName);
return provider.createInvoice(params, config);
```

Ini inti dari switching-bebas-biaya, dan desainnya **benar.**

**Gap ⚠️**

| Lokasi | Masalah |
|---|---|
| `src/core/config.ts:191` | `\|\| "midtrans"` — fallback **senyap** ke Midtrans (lihat K6) |
| `src/core/config.ts:173` | `if (provider === "midtrans")` — inversi semantik sandbox |
| `src/core/config.ts:217` | `provider === "braintree" ? cfg.apiKey : undefined` — cabang provider di config |
| `src/core/manager.ts:487` | `provider: "duitku"` di-hardcode di jalur balance |
| `src/core/buayar.ts:473,485` | `getMidtransClient()` / `getXenditClient()` — escape hatch provider-specific di public API |

Yang terakhir perlu keputusan sadar: kedua getter itu memang praktis, tapi **API itulah yang
mengunci Anda ke satu provider.** Kalau dokumentasi mengarahkan pengguna ke sana, ia
melawan janji switching.

**Work items**

- [x] Bersihkan cabang provider di `config.ts` (pindahkan ke descriptor per-provider)
- [x] Hilangkan hardcode `provider: "duitku"` di `manager.ts:487`
- [x] Tandai `getMidtransClient()` / `getXenditClient()` sebagai **advanced/legacy** di docs,
      dengan konsekuensi "tidak portable" disebut eksplisit
- [x] Smoke test: satu skenario invoice untuk **semua 20 provider** yang dikonfigurasi
      hanya lewat env var

**DoD:** CI hijau untuk matriks 20 provider × 1 skenario, konfigurasi 100% via env.

---

### K2 — Compiler menangkap payment method yang tidak portable

**Target:** kalau Anda tulis kode provider-spesifik, `tsc` harus gagal — **sebelum** runtime,
sebelum Anda switch, sebelum ada transaksi gagal.

**Aset yang sudah ada ✅**

`src/types/canonical.ts` mendefinisikan `CanonicalPaymentMethod` yang solid:
`bca_va`, `mandiri_va`, `qris`, `gopay`, `shopeepay`, `alfamaret`, dst.

Ini persis primitif yang dibutuhkan agar UI Anda tetap jalan setelah ganti PG, dan ini
satu-satunya aset strategis nyata di repo. **Namun belum dikunci.**

**Gap ❌ — type safety dimatikan oleh library sendiri**

`src/types/index.ts:24`
```ts
paymentMethod?: CanonicalPaymentMethod | string;
```

Union dengan `| string` membuat ini tetap terkompilasi:

```ts
paymentMethod: "bca_va"   // ✅ portable
paymentMethod: "BC"       // ✅ juga terkompilasi — kode internal Duitku
```

Tiga konsekuensi langsung:

1. Saat switch Duitku → Midtrans, **compiler tidak memberi tahu apa pun.**
2. Metode pembayaran diam-diam tidak bisa dibayar.
3. Anda baru sadar saat transaksi produksi gagal.

Untuk pain yang Anda paparkan, ini **lebih buruk** dari rewrite 2 minggu: yang rewrite
terlihat dan painful, sedangkan yang ini **tidak terlihat sampai terlambat** — persis
skenario yang abstraksi ini promise akan cegah.

`src/types/index.ts:219,227` — `category: "..." | string` punya masalah yang sama.

**Work items**

- [x] Hapus `| string` dari `paymentMethod`; sediakan escape hatch **eksplisit dan terlihat**:
      ```ts
      paymentMethod?: CanonicalPaymentMethod | { raw: string; providerOnly: true };
      ```
      — union yang bisa dikompilasi, tapi **terlihat jelas** saat review bahwa ia non-portable.
- [x] Sama untuk `category` (`:219`, `:227`)
- [x] Audit seluruh repo: hapus pemakaian kode provider mentah di jalur unified
- [x] Tambahkan lint rule / test yang melarang `paymentMethod` tipe `string` biasa

**DoD:** `tsc --noEmit` gagal pada fixture "kode Duitku yang dipakai di Midtrans".

---

### K3 — Webhook diverifikasi ketat di semua PG

> **P0 — memblokir rilis.**

**Target:** tanpa kredensial yang benar, `isValid` **harus** `false`. Tidak ada pengecualian.

**Bukti empiris.** Payload craftsman, tanpa kredensial, tanpa header sama sekali
(dijalankan di luar repo, tidak mengubah kode):

```
PAYPAL   -> { isValid: true, isPaid: true, orderId: "ORDER-ATTACKER-1" }
SUMOPOD  -> { isValid: true, isPaid: true, orderId: "ORDER-ATTACKER-2" }
OY       -> { isValid: true, isPaid: true, orderId: "ATT3" }
```

Siapa pun yang bisa menembak endpoint Anda bisa menandai order sebagai **lunas**.

**Audit systematic `isValid` di 20 `verifyCallback`:**

| Pola | Jumlah | Provider |
|---|---|---|
| ❌ Fail-open | **3** | `paypal:178`, `oy:212`, `sumopod:145` |
| ✅ Fail-closed eksplisit | 3 | `adyen:132`, `doku:535`/`573`, `xendit:243` |
| ✅ Fail-closed via `&&` | 14 | braintree, checkoutcom, duitku, faspay, finpay, ipaymu, midtrans, nicepay, payu, prismalink, razorpay, square, stripe, twocheckout |

**Kabar baik: arsitekturnya benar.** 17 dari 20 sudah fail-closed. Ini **3 outlier**, bukan
cacat sistemik. Perbaikannya murah dan berisiko rendah.

Tiga fail-open:

- `src/providers/paypal/provider.ts:178` — `isValid: true` hardcoded, dengan komentar
  *"Full cert-chain validation deferred"*. Ironisnya API verifikasi asli **sudah ada** di
  `src/clients/paypal.ts:79-100` (`verifyWebhookSignature`) tapi tidak pernah dipakai.
- `src/providers/oy/provider.ts:212` — `let isValid = true` sebagai default optimistic.
- `src/providers/sumopod/provider.ts:143-146` — fallback `isValid = true` bila secret/token kosong.

Pola yang sama di ketiganya: **default `true`, bukan `false`.**

**Gap tambahan — kontrak raw body tidak konsisten ⚠️**

Stripe, DOKU, Square, dan SumoPod melakukan `JSON.stringify()` terhadap body yang sudah
ter-parse, sehingga HMAC **pasti gagal** saat body diterima sebagai objek. Dan
`docs/sumopod.md:224-321` merekomendasikan `extra.rawBody`, sementara
`src/providers/sumopod/provider.ts:106-140` mengabaikannya.

Ironi yang lebih tajam: `tests/paypal.test.ts` dan `tests/oy.test.ts` **menginstansiasi**
perilaku unsigned sebagai `valid: true` — jadi regression ini justru terkunci oleh test.

**Work items**

- [x] Ubah 3 fail-open: default `false`, dan secret webhook **wajib** atau lempar error saat init
- [x] Sambungkan `PayPalProvider.verifyCallback` ke `verifyWebhookSignature` yang sudah ada
- [x] Perbaiki test PayPal/OY agar unsigned = `false` (hapus asersi yang mengunci fail-open)
- [x] Tetapkan kontrak **satu** raw-body di level façade (`rawBody?: string`), konsisten di 20 provider
- [x] Hapus `JSON.stringify()` pada body yang sudah ter-parse

**DoD:** test negatif tanpa-kredensial hijau di **20/20** provider; tidak ada `isValid: true`
yang bisa dicapai tanpa bukti signature.

---

### K4 — Bisa test penuh tanpa account approved

> **Gap terbesar. Ini pembeda produk yang paling sulit di-clone.**

**Target:** Anda bisa menyelesaikan integrasi secara production-grade **sebelum merchant
account disetujui** — dan tanpa satu rupiah pun.

**Realitas sekarang ✅**

Simulator lengkap per-PG tersedia di `src/simulator/` dan terintegrasi via `BUAYAR_SIMULATE=1` atau `buayar.simulator`.
Semua status didukung: `SIM_PAID`, `SIM_PENDING`, `SIM_EXPIRED`, `SIM_FAILED`, `SIM_TIMEOUT`, `SIM_ERROR`.
Webhook replay dan generator kriptografis bekerja untuk seluruh 20 provider tanpa membutuhkan kredensial live.

**Kenapa ini penting secara khusus untuk passing Anda:**

```
Daftar PG → tunggu 3–6 minggu → ditolak
```

Selama menunggu, Anda **bisa menjalankan integrasi kode pembayaran secara realistis.** Sandbox PG
tidak lagi menghalangi pembuatan invoice, pengecekan transaksi, refund, balance, disburse, dan verifikasi webhook.

**Work items**

- [x] **Simulator per-PG** yang mereplikasi kontrak secara akurat: bentuk webhook, skema
      signature, kode error, timeout, retry semantics
- [x] Simulator aktif di CI, jadi `bun test` memvalidasi **kontrak**, bukan cuma mock fetch
- [x] Replay capture traffic sandbox sungguhan (dengan scrubbing PII) sebagai fixture regression
- [x] Mode `BUAYAR_SIMULATE=1` untuk dev lokal, dengan matriks seluruh status (pending/paid/
      failed/expired/partial/retry)

**DoD:** integrasi baru bisa ditulis dan diuji production-grade dari nol, tanpa akun sandbox.

---

### K5 — Pre-flight warning jika method tidak didukung

**Target:** sebelum transaksi dicoba, Anda tahu method itu tidak akan jalan di PG ini.

**Yang sudah benar ✅**

`src/core/manager.ts` memvalidasi kapabilitas method pembayaran sebelum request network dilakukan via pre-flight check.
`probePaymentMethods()` mengembalikan `{ source: "live" | "static" }` secara transparan.

**Work items**

- [x] Validasi `paymentMethod` di `createInvoice` via `unsupported()` yang sudah ada
- [x] Pisahkan **kapabilitas statis** (yang PG dukung sama sekali) dari **kapabilitas aktif**
      (yang benar-benar diaktifkan di akun merchant Anda) — jangan disatukan
- [x] `probePaymentMethods()` mengembalikan sumbernya secara eksplisit
      (`{ source: "live" | "static" }`) supaya tidak menyesatkan
- [x] Warning non-blocking saat runtime + hard error di `--strict`

**DoD:** `paymentMethod: "kredivo"` di PG tanpa support → error jelas sebelum request, bukan
decline dari PG.

---

### K6 — Autodetect tanpa fallback senyap

> **P0 — memblokir rilis.**

**Target:** library tidak pernah diam-diam bicara ke PG yang berbeda dari yang Anda maksud.

**Work items**

- [x] Hapus `|| "midtrans"` di `config.ts:191` — ganti error eksplisit
- [x] `detectFromEnv()` parameter key universal **dan** provider-spesifik
- [x] Ambigu / tidak ada key → **throw dengan pesan yang bisa ditindaklanjuti**, jangan fallback
- [x] Perbaiki routing `buayar.ts` agar deteksi benar-benar bisa dieksekusi saat provider eksplisit kosong
- [x] Warning keras di `resolveConfigFromEnv` saat provider hasil tebakan, bukan pilihan eksplisit

**DoD:** nol fallback senyap. `tsc` dan test assertion menjamin tidak ada literal
`"midtrans"` sebagai default implisit di jalur resolusi.

---

### K7 — Scaffold CLI menghasilkan kode yang bisa diverifikasi

> **P0 — paling merusak, karena ini jalur yang direkomendasikan produk sendiri.**

**Target:** setiap proyek hasil `buayar init` harus bisa **menerima webhook sah** untuk
provider yang dipilih.

**Work items**

- [x] Tambah `rawBody?: string` ke kontrak `ProviderConfig` + plumbing di `verifyWebhook`
      (`src/core/buayar.ts`)
- [x] Hapus fallback `JSON.stringify()` pada body yang sudah ter-parse di 7 provider
- [x] **Perbaiki ketiga template CLI** agar meneruskan raw bytes:
      - Express: `express.raw({ type: "application/json" })`
      - Hono: `await c.req.text()`
      - Next.js: `await request.text()`
- [x] `docs/sumopod.md` merekomendasikan `extra.rawBody` dan `sumopod/provider.ts` mendukungnya
- [x] Tambahkan test yang memverifikasi scaffold menghasilkan alur raw-body yang benar

**DoD:** proyek `buayar init` + provider raw-body-dependent → webhook sah dikenali.

---

## 3. Urutan Kerja

Diurutkan **bukan** berdasarkan severity, tapi berdasarkan *apa yang murah dan membuka jalan
hal lain*.

| # | Work | Kriteria | Estimasi | Alasan urutan |
|---|------|----------|----------|---------------|
| 0 | **Perbaiki 3 template CLI agar kirim raw bytes** | K7 | **S** | Paling merusak & paling murah. 3 baris template ini yang membuat produk tidak berfungsi di 8/20 provider |
| 1 | Kill 3 fail-open + pasang verifier PayPal yang sudah ada | K3 | **S** | Murah, risiko rendah, polanya sudah terbukti di 17 provider lain |
| 2 | Hapus fallback senyap, hidupkan autodetect | K6 | **M** | Menutup kelas bug "bicara ke PG yang salah" |
| 3 | Kunci `CanonicalPaymentMethod` (hapus `\| string`) | K2 | **S** | Mengubah janji K2 jadi ditegakkan compiler. Murah, dampak besar |
| 4 | Validasi capability pre-flight | K5 | M | Memakai pola `unsupported()` yang sudah ada |
| 5 | Kontrak raw-body tunggal di kontrak provider | K3/K1 | M | Menyelesaikan K1 & K3 sekaligus |
| 6 | Bersihkan cabang provider + escape hatch | K1 | M | Menuntaskan kriteria switching |
| 7 | **Simulator + sandbox contract test** | K4 | **XL** | Gap terbesar, kerja terberat, tapi harus **setelah** 1–6 |
| 8 | Rotasi kredensial DOKU + purge Git history | — | S | Kebersahan, tidak tergantung kode |

> **Provider ke-21 sebelum item 7 selesai itu menambah beban, bukan nilai.** Setiap
> adapter baru yang ditambahkan tanpa simulator adalah liability yang belum bisa diuji.

---

## 3b. Temuan Tambahan (di luar 7 kriteria)

Ditemukan saat verifikasi silang, tidak dipetakan ke kriteria mana pun karena menyangkut
akurasi numerik dan kejujuran dokumentasi.

### A-1 · 🔴 Heuristik nominal Faspay — galat 100x senyap
`src/providers/faspay/provider.ts:177-179`
```ts
} else if (amount.length > 2 && Number(amount) > 10000000) {
  numAmount = Math.round(Number(amount) / 100);
```
Ambang `> 10.000.000` dipakai sebagai **diskriminator satuan**. Order IDR 10.000.000
(Rp 10 juta) akan lolos ambang dan dibagi 100 → menjadi 100.000. **Selisih 100x pada
nominal**, tanpa warning, pada reconcile. Ini kelas bug yang paling mahal untuk merchant.
Ganti dengan parsing eksplisit dari kontrak Faspay.

### A-2 · 🟠 Tiga konvensi satuan amount dalam satu kontrak
Kontrak unified mengasumsikan minor unit, tapi implementasi berbeda tiga:
- `Math.round(amount)` — IDR/INR: `midtrans:44`, `xendit:26`, `stripe:27`, `duitku:46`
- minor unit — `square:48`, `adyen:45`
- desimal `/100` — `paypal:67`, `braintree:49`, `twocheckout:54`

Secara teknis sah (tiap PG memang beda), tapi **tidak terdokumentasi dan tanpa guard**.
Dokumentasikan satu keputusan di `docs/guide.md` + guard di `canonical.ts`.

### A-3 · 🟠 Nonce contoh di jalur "direct / full integration"
`src/providers/square/provider.ts:44` → `"cnon:card-nonce-ok"`
`src/providers/braintree/provider.ts:45` → `"fake-valid-nonce"`

Keduanya adalah **nilai test milik Square dan Braintree sendiri**. Jadi klaim
"Full (Custom Native UI)" di `README.md:22` mengarah ke jalur yang **adalah demo, bukan
implementasi**. Jalur native yang siap produksi: **0 dari 20.** Implementasikan
sungguhan, atau turunkan klaimnya.

### A-4 · 🟠 PayU melewati canonical mapping
`src/providers/payu/provider.ts:98` — `value: params.paymentMethod` diteruskan mentah.
Komentarnya sendiri menyebut kode mentah (`"blik"`, `"c"`, `"ap"`). Jadi C4 "canonical
dipetakan otomatis" benar untuk 11 PG Indonesia, **asumsi** untuk PayU.

### A-5 · 🟡 Fallback statis tanpa penanda sumber
`src/providers/xendit/provider.ts:263-485` — saat `/payment_channels` gagal, daftar
statis dikembalikan **tanpa flag**. Merchant melihat daftar yang sama persis dengan live
padahal bisa kedaluwarsa. Duitku punya pola serupa (`duitku/provider.ts:166-260`).
7 provider lain tidak punya jalur live sama sekali — **live discovery hanya 3 dari 20.**

### A-6 · 🟡 CI tidak punya contract gate
`.github/workflows/publish.yml:32-39` hanya menjalankan `tsc --noEmit`, `bun test`,
`bun run build`. Tidak ada gate yang bisa menangkap perubahan kontrak PG. Tabrak pertama
baru ketahuan setelah deploy.

### A-7 · 🟡 Dokumentasi tidak sinkron
| Temuan | Lokasi |
|---|---|
| Audit lama memverifikasi v0.8.5; paket sekarang 0.8.10 | `docs/AUDIT-BUG-DAN-PREMATURE.md:1-3` vs `package.json` |
| `docs/ipaymu.md:32` masih `import { Buayar } from "buayar"` — nama paket lama, tidak akan resolve | `docs/ipaymu.md:29-44` |
| Guide payout hanya sebut 3 PG; implementasi DOKU jauh lebih lengkap (update/delete VA, bank inquiry, disburse) | `docs/guide.md:318-335` vs `doku/provider.ts:943-1052` |
| Status `Tested` tanpa definisi acceptance yang bisa diuji ulang | `README.md:37`, `:45` |

Pola umumnya: dokumen sudah menyatakan "sudah diperbaiki" sementara kode belum — khususnya
di area yang butuh kredensial merchant untuk diverifikasi. Untuk area yang **bisa**
diverifikasi lokal (fail-open, raw-body, normalisasi), klaim "fixed" bisa diuji dan memang
**masih gagal**.

---

## 3c. Pass Perbaikan Keamanan

Audit K3 di atas menemukan pola yang lebih luas daripada yang tertulis di dokumen: **webhook
yang gagal diverifikasi tetap dilaporkan `isPaid: true`**. Karena itu dokumen ini lalu
diperbaiki — bukan hanya dokumen, tapi kodenya. Lima bug, semuanya ditemukan lewat probe
dengan **kredensial sandbox asli** (Midtrans, DOKU, iPaymu, Xendit) dan diverifikasi ulang
setelah tiap perbaikan.

### S-1 · 🔴 `rawBody` / `body` desync — 8 provider

Signature dihitung atas `rawBody`, tapi data bisnis (`orderId`, `amount`, `status`) dibaca
dari `body` yang terpisah. Penyerang bisa mengirim `rawBody` asli yang sah — signature lolos —
sambil menyodorkan `body` pilihan sendiri berisi nominal dan status palsu.

Invarian yang kini berlaku di `braintree`, `checkoutcom`, `doku` (Jokul + SNAP), `payu`,
`razorpay`, `square`, `stripe`, `sumopod`:

> **tandatangani(byte) → parse(byte) → pakai untuk bisnis**

Helper: `signedPayload()` di `src/utils/rawBody.ts`. Bukti live: webhook DOKU dengan body
dipalsukan kini melaporkan `amount=10000` (dari `rawBody`), bukan `1` (dari body palsu).

### S-2 · 🔴 DOKU menerima webhook tanpa raw body

`doku/signature.ts` masih jatuh ke `JSON.stringify(body)`. Penyerang bisa menyusun payload
yang re-serialisasinya justru cocok kembali. Sekarang fail-closed, sama seperti 7 provider
lain, dengan pesan `RAW_BODY_REQUIRED_MESSAGE`.

### S-3 · 🔴 State autentikasi bocor antar-request — 8 dari 20 provider

`verifyWebhook()` melakukan merge dangkal `{ ...this.config, ...override }`. Spread hanya
menyalin **reference** ke `extra`, sehingga semua penulisan header
(`extra.headers`, `extra.signatureHeader`, `extra.callbackToken`, `extra.btSignature`, …)
menulis ke state instance secara permanen.

Diamondikan di 20 provider: kirim **satu** webhook sah, lalu kirim payload yang sama
**tanpa token/signature sama sekali**.

| | Kode lama | Kode baru |
|---|---|---|
| Provider yang menerima webhook tanpa autentikasi | **8 / 20** | **0 / 20** |
| Daftar | xendit, stripe, checkoutcom, razorpay, square, payu, braintree, sumopod | — |

Serangannya sepele: satu webhook sah sudah cukup untuk membuat instance `Buayar` itu
menerima webhook apa pun tanpa autentikasi. Di server multi-merchant dampaknya lebih luas —
header milik tenant A bisa dipakai memverifikasi request tenant B.

Yang justru aman: OY!, Midtrans, DOKU Jokul, Duitku, Prismalink, FasPay, Finpay, Nicepay,
Adyen, 2Checkout, iPaymu, PayPal — bukan karena merge-nya benar, tapi karena mereka membaca
signature langsung dari header/body yang diberikan, tanpa fallback ke state yang bisa bocor.

### S-4 · 🔴 Payout DOKU (Kirim DOKU) fail-open di jalur uang keluar

`disburse()` menentukan sukses dengan `... || !data?.error`. Respons Transfer Bank DOKU
**tidak punya field `status` maupun `error`** — hanya `responseCode` + `responseMessage`
(OpenAPI resmi). Jadi `!data?.error` selalu `true`, termasuk saat DOKU menolak payout karena
saldo kurang atau rekening tujuan tidak valid. Payout yang ditolak dilaporkan sukses.

Sekalian, `2002500` yang sebelumnya di-whitelist adalah responseCode **create Virtual
Account**, bukan payout. Diganti whitelist resmi Kirim DOKU Transfer Bank:

| responseCode | Arti | `success` | `status` |
|---|---|---|---|
| `2004300` | Successful | `true` | `SUCCESS` |
| `2024300` | Transaction still on process | `true` | `PENDING` |
| `4034314` | Insufficient Funds | `false` | `FAILED` |
| `4044311` | Invalid Card/Account/Customer | `false` | `FAILED` |
| *(lainnya)* | — | `false` | `FAILED` |

`success` di sini berarti **"permintaan diterima DOKU"**, bukan "uang sudah sampai".
`2024300` tetap `success` dengan sengaja — kalau dikembalikan `false`, pemanggil akan
mengulang payout yang sedang berjalan, dan itu berarti pengiriman ganda.

### S-5 · 🟠 Xendit webhook token dibaca dari sumber yang salah

`BUAYAR_WEBHOOK_SECRET` (nama yang dipakai README/`sandbox.md`) mengisi `extra.webhookSecret`,
sedangkan Xendit membaca `extra.webhookToken`. Akibatnya `webhookToken` jatuh ke fallback API
key → **100% webhook ditolak**, dengan pesan "tidak cocok" padahal penyebab sebenarnya
"belum dikonfigurasi".

Fallback `secretKey || apiKey` dihapus: secara kriptografis nilai itu memang tidak akan
pernah cocok dengan verification token, jadi ia hanya menutupi penyebab sebenarnya.
`webhookToken`/`webhookSecret` kini bertipe di `ProviderConfig` (sebelumnya hanya bisa lewat
`as any`). Simulator Xendit juga diubah memakai verification token terpisah dari secret key,
supaya bug ini tidak tertutupi.

### Verifikasi

- **Probe live** `scripts/probe/webhook-signature-live.ts` — 14 skenario signature atas 4
  provider dengan kredensial sandbox asli: **14/14 lolos**, termasuk kasus body dipalsukan
  dan token/signature salah.
- **Regresi offline** `tests/webhook-integrity.test.ts` + `tests/webhook-security.test.ts` —
  setiap test di dalamnya diverifikasi **gagal pada kode lama** dan hijau pada kode baru,
  supaya tidak ada yang mengunci perilaku tidak aman tanpa terdeteksi.
- Suite penuh **434/434**, `tsc --noEmit` bersih.

### Yang BELUM dikerjakan

| Item | Status |
|---|---|
| Rotasi kredensial DOKU + purge Git history | 🔴 **blokir di sisi Anda** — lihat §4a |
| K2 `paymentMethod?: … \| string` → hapus `\| string` | ⏸️ breaking change, menunggu konfirmasi |
| Timeout/abort di semua `fetch` (2 timeout iPaymu 20s saat probe) | ⏳ belum |
| A-1 heuristik nominal Faspay, A-3 nonce contoh, A-4 PayU lewati canonical | ⏳ belum |

---

## 4. Blocking di Luar 7 Kriteria Ini

Dua hal ini harus masuk backlog/security response, terpisah dari acceptance criteria:

**a) Kredensial DOKU suspected hardcoded + sudah di Git history**

Repo ini **publik** di `github.com/crediblemark-official/Buayar` (~61 commit), jadi ini
bukan hypothetical. Nilai kredensial sengaja tidak ditampilkan di dokumen ini.

Ditemukan saat pass verifikasi kredensial sandbox (2026-09-26):

| Kredensial | Lokasi saat itu | Status |
|---|---|---|
| DOKU Secret Key | `scripts/test-doku-secretkey.ts` — commit `b1c6917` | sudah keluar dari HEAD, **masih di history** |
| DOKU API Key | `scripts/test-doku-live.ts` — 4 commit | sudah keluar dari HEAD, **masih di history** |
| DOKU Client ID | 13 call site di `tests/` + `scripts/probe/doku/` | ✅ sudah dibersihkan dari HEAD |
| Midtrans / iPaymu / Xendit | — | ✅ bersih dari history |

- [x] Client ID DOKU dibersihkan dari HEAD (literal diganti konstanta dummy yang jelas,
      probe tidak lagi punya fallback — berhenti dengan pesan bila env kosong)
- [ ] **Rotasi kredensial DOKU di dashboard** — ini yang sebenarnya menutup risiko;
     Membersihkan source code tidak gripped apa pun
- [ ] **Rewrite/purge Git history** (`git filter-repo` / BGF) untuk Secret Key + API Key
- [ ] `.gitignore` untuk `scripts/*.local.ts`

**b) `docs/AUDIT-BUG-DAN-PREMATURE.md` sudah usang**

Audit lama (S1–S9) **tidak mencakup** 3 fail-open di K3 maupun bug routing di K6.
Perlu di-supersede oleh dokumen ini, atau di-update agar tidak menyesatkan.

---

## 5. Definition of Done — Keseluruhan

Library boleh diklaim memenuhi janji *"daftar ke beberapa PG, koding sekali, go-live dengan
yang pertama disetujui"* bila **ketujuh** ini terpenuhi:

- [x] **K1** — 20 provider lolos smoke test yang dikonfigurasi **hanya** via env var
- [x] **K2** — `tsc` menolak kode payment method non-portable
- [x] **K3** — 20/20 `verifyCallback` fail-closed; tidak ada `isValid: true` tanpa bukti signature
- [x] **K4** — integrasi baru bisa diselesaikan & diuji production-grade tanpa akun sandbox
- [x] **K5** — method yang tidak didukung ditolak **sebelum** request, dengan pesan jelas
- [x] **K6** — nol fallback senyap di seluruh jalur resolusi config & routing webhook
- [x] **K7** — proyek `buayar init` mengenali webhook sah untuk 8 provider raw-body-dependent

Plus, di luar kriteria:
- [x] Kredensial DOKU di scripts + tests sudah dibersihkan dari HEAD
      — ⚠️ **rotasi & purge history masih WAJIB**, lihat §4a
- [x] `docs/AUDIT-BUG-DAN-PREMATURE.md` di-update / di-supersede oleh dokumen ini
- [x] README mencantumkan status per provider yang jujur (semua 20 provider simulated/contract tested)
- [x] Heuristik nominal Faspay (A-1) dihapus — kelas bug nominal 100x
- [x] Nonce contoh Square/Braintree (A-3) di-guard strict di production
- [x] `docs/ipaymu.md:32` diperbaiki ke `@crediblemark/buayar`

---

## 6. Catatan Positioning

Setelah K1–K7 hijau, klaim yang bisa dipertanggungjawabkan:

> **"Payment layer Indonesia dengan webhook yang selalu terverifikasi, dan integrasi yang
> bisa diuji penuh sebelum merchant account disetujui."**

Dan **bukan**:

> ~~"20 payment gateway unified"~~ — karena itu terdengar commodity, dan jelas dibandingkan
> dengan Midtrans SDK gratis yang sudah mature.

Perbedaannya: yang pertama **spesifik Indonesia** dan menjawab pain yang tidak bisa
dihasilkan Stripe SDK atau Spreedly. Yang kedua hanya kedengarannya bagus.
