# Dokumentasi Provider — `@crediblemark/buayar`

Setiap provider punya folder kode `src/providers/<provider>/` dan folder dokumentasi `docs/providers/<provider>/README.md` ini.

## Struktur

```
src/
├── providers/<provider>/        # provider.ts (wajib) + signature/snap/mcp/... per kebutuhan
├── core/                        # kanonikal (CANONICAL_TO_*), config, manager, buayar
├── clients/                     # HTTP client per provider
├── types/                       # kontrak publik (InvoiceParams, VerifyCallbackResult, ...)
├── utils/                       # snap helper (ASPI), crypto
└── simulator/                   # contract-testing sandbox

scripts/probe/
├── all.ts                       # CLI terpadu: bun run probe [provider...]
├── lib.ts                       # helper JSON summary (__PROBE_JSON__)
├── check.ts                     # check-payment-channels (katalog + LIVE_PROBE)
├── doku/                        # channels, va-notification, va-manual, notification-receiver,
│                                # mcp-e2e, mcp-tools-list, secretkey-check, tunnel-receiver.sh
├── midtrans/channels.ts
├── ipaymu/channels.ts
└── xendit/channels.ts

tests/                           # 535 test (bun test), termasuk webhook fail-closed 21/21
```

## Status per provider (rincian → klik nama)

### 🟢 Provider Terverifikasi Live di Sandbox / Production (7)
Provider yang sudah diuji langsung dengan kredensial sandbox nyata (`sandbox.md`):

| Provider | Audit fidelity | Verifikasi live | Dokumentasi |
|---|---|---|---|
| **DOKU (Jokul/SNAP)** | ✅ D-1…D-17 | ✅ **TESTED LIVE** (Jokul v2 VA, Direct VA 6 bank, MCP 35 tools, SNAP Kirim DOKU) | [doku](./doku/README.md) |
| **Midtrans** | ✅ M-1…M-15 + BI-SNAP | ✅ **TESTED LIVE** (16/19 kanal Core API, Direct VA BCA/BNI/BRI/Mandiri/Permata/BSI, QRIS, Snap) | [midtrans](./midtrans/README.md) |
| **Xendit** | ✅ X-1…X-8 | ✅ **TESTED LIVE** (11/11 kanal v3 & v2, Payment Sessions, Direct VA BCA/BNI/BRI/Mandiri, QRIS) | [xendit](./xendit/README.md) |
| **iPaymu** | ✅ I-1…I-9 | ✅ **TESTED LIVE** (13/19 kanal Direct Payment, Direct VA BCA/BNI/Mandiri/Permata/CIMB/Muamalat, QRIS) | [ipaymu](./ipaymu/README.md) |
| **Duitku** | ✅ DU-1 | ✅ **TESTED LIVE** (POP Invoice, Direct Inquiry BCA VA, Direct QRIS, checkTransaction) | [duitku](./duitku/README.md) |
| **Xenith** | ✅ Spec v1 (OpenAPI) | ✅ **TESTED LIVE** (Hosted Link, Direct Pay In QRIS/VA, Balances, 120 Bank Payouts, Webhook) | [xenith](./xenith/README.md) |
| **SumoPod** | ✅ Spec v1 | ✅ **TESTED LIVE** (Payments v1 & QRIS API sandbox/live) | [sumopod](./sumopod/README.md) + [sumopod.md](../sumopod.md) |

---

### ⏳ Provider Belum Diuji Live Sandbox / Simulator Only (14)
Provider yang implementasinya telah selesai & terkunci 535 test unit/simulator, tetapi **belum pernah ditembakkan ke akun sandbox nyata** karena menunggu tersedianya kredensial:
| Nicepay | ✅ N-1/N-2 | ⏳ **BELUM TESTED LIVE** | Butuh akun sandbox Nicepay (`NICEPAY_IMID`, `NICEPAY_KEY`) | [nicepay](./nicepay/README.md) |
| Faspay | ✅ F-1 (verified) | ⏳ **BELUM TESTED LIVE** | Butuh akun sandbox Faspay (`FASPAY_MERCHANT_ID`, `FASPAY_USER_ID`, `FASPAY_PASSWORD`) | [faspay](./faspay/README.md) |
| OY! Bisnis | ⏳ Gelombang 3 | ⏳ **BELUM TESTED LIVE** | Butuh akun sandbox OY! (`OY_USERNAME`, `OY_API_KEY`) | [oy](./oy/README.md) |
| Finpay | ⏸ BLOCKED (FP-1) | ⏸️ **BELUM TESTED LIVE** | Dokumentasi payload resmi tertutup (butuh dokumen integrasi & akun merchant) | [finpay](./finpay/README.md) |
| Prismalink | ⏸ BLOCKED (FP-1) | ⏸️ **BELUM TESTED LIVE** | Dokumentasi payload resmi tertutup (butuh dokumen integrasi & akun merchant) | [prismalink](./prismalink/README.md) |
| Stripe | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh API Key sandbox (`sk_test_...`) | [stripe](./stripe/README.md) |
| PayPal | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh PayPal Developer Sandbox Client ID & Secret | [paypal](./paypal/README.md) |
| Adyen | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh Adyen Test Account (`API Key`, `Merchant Account`, `HMAC Key`) | [adyen](./adyen/README.md) |
| Checkout.com | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh Checkout.com Sandbox Secret & Public Key | [checkoutcom](./checkoutcom/README.md) |
| Razorpay | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh Razorpay Test Key ID & Key Secret | [razorpay](./razorpay/README.md) |
| Square | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh Square Sandbox Access Token & App ID | [square](./square/README.md) |
| PayU | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh PayU Sandbox POS ID & MD5 Key | [payu](./payu/README.md) |
| Braintree | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh Braintree Sandbox Merchant ID, Public & Private Key | [braintree](./braintree/README.md) |
| 2Checkout | 🔎 Terintegrasi | ⏳ **BELUM TESTED LIVE** | Butuh 2Checkout Sandbox Merchant Code & Secret Key | [twocheckout](./twocheckout/README.md) |

Legenda:
- ✅ **TESTED LIVE**: Telah diverifikasi langsung menghasilkan transaksi nyata di server sandbox provider.
- ⏳ **BELUM TESTED LIVE**: Kode terimplementasi dan lulus contract simulator, menunggu input kredensial sandbox nyata.
- ⏸️ **BLOCKED**: Dokumentasi resmi tidak tersedia bebas secara publik; butuh akses merchant langsung untuk validasi payload.

## Cara membaca dokumentasi tiap provider

Setiap `README.md` provider berisi:

1. **File** — peta file implementasi di `src/providers/<provider>/`.
2. **Operasi** — apa yang dilakukan `createInvoice`/`checkTransaction`/`verifyCallback` (termasuk keputusan fidelity penting).
3. **Kredensial** — env yang dibaca `.env` / CLI scaffold.
4. **Endpoint** — sandbox vs production.
5. **Verifikasi** — probe per-channel (`bun run probe <provider>`), test regresi, dan hasil live terakhir.

## Sumber lintas-provider

- [REVIEW-PG-FIDELITY.md](../REVIEW-PG-FIDELITY.md) — audit lengkap per item (D/M/X/I/DU/N/F/FP) + verifikasi live.
- [AUDIT-BUG-DAN-PREMATURE.md](../AUDIT-BUG-DAN-PREMATURE.md) — ringkasan bug & status.
- [guide.md](../guide.md) — panduan pemakaian SDK.
