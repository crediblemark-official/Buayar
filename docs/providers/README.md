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

tests/                           # 396 test (bun test), termasuk webhook fail-closed 20/20
```

## Status per provider (rincian → klik nama)

| Provider | Audit fidelity | Verifikasi live | Dokumentasi |
|---|---|---|---|
| **DOKU (Jokul)** | ✅ D-1…D-17 | ✅ Terdalam: MCP 35 tool, 17 VA, e2e BTN & BNC terbayar | [doku](./doku/README.md) |
| **Midtrans** | ✅ M-1…M-15 + BI-SNAP | ✅ 16/19 kanal (ovo/dana/linkaja menunggu aktivasi) | [midtrans](./midtrans/README.md) |
| **Xendit** | ✅ X-1…X-8 | ✅ v3 11/11, v2 11/11 (4 kanal tak tersedia di akun) | [xendit](./xendit/README.md) |
| **iPaymu** | ✅ I-1…I-9 | ✅ 14/19 kanal (4 partner-side) | [ipaymu](./ipaymu/README.md) |
| Duitku | ✅ DU-1 | ⏸ belum ada probe live | [duitku](./duitku/README.md) |
| Nicepay | ✅ N-1/N-2 | ⏸ belum ada probe live | [nicepay](./nicepay/README.md) |
| Faspay | ✅ F-1 (verified) | ⏸ belum ada probe live | [faspay](./faspay/README.md) |
| OY! | ⏳ gelombang berikutnya | ⏸ butuh akun sandbox | [oy](./oy/README.md) |
| Finpay | ⏸ BLOCKED (FP-1) | ⏸ docs resmi tak ditemukan | [finpay](./finpay/README.md) |
| Prismalink | ⏸ BLOCKED (FP-1) | ⏸ docs resmi tak ditemukan | [prismalink](./prismalink/README.md) |
| Stripe | 🔎 sekilas (gel. 3) | ⏸ | [stripe](./stripe/README.md) |
| PayPal | 🔎 sekilas (gel. 3) | ⏸ | [paypal](./paypal/README.md) |
| Adyen | 🔎 sekilas (gel. 3) | ⏸ | [adyen](./adyen/README.md) |
| Checkout.com | 🔎 sekilas (gel. 3) | ⏸ | [checkoutcom](./checkoutcom/README.md) |
| Razorpay | 🔎 sekilas (gel. 3) | ⏸ | [razorpay](./razorpay/README.md) |
| Square | 🔎 sekilas (gel. 3) | ⏸ | [square](./square/README.md) |
| PayU | 🔎 sekilas (gel. 3) | ⏸ | [payu](./payu/README.md) |
| Braintree | 🔎 sekilas (gel. 3) | ⏸ | [braintree](./braintree/README.md) |
| 2Checkout | 🔎 sekilas (gel. 3) | ⏸ | [twocheckout](./twocheckout/README.md) |
| SumoPod | 🔎 sekilas (gel. 3) | ⏸ | [sumopod](./sumopod/README.md) + [sumopod.md](../sumopod.md) |

Legenda: ✅ diperbaiki & dikunci test · 🔎 diaudit sekilas, belum pendalaman per-channel · ⏸ blocked/menunggu akses · ⏳ masuk gelombang berikutnya.

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
