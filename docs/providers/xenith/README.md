# Xenith Pay — Implementasi Buayar

> Status: ✅ **LIVE SANDBOX TESTED** · Hosted Payment Links, Direct Pay In (QRIS & Virtual Accounts: BRI, Mandiri, BNI, Permata, CIMB, Danamon), Check Balance, 120 Bank Payouts / Account Inquiry, dan Webhook Fail-Closed. Dokumentasi resmi: [https://docs.xenithpay.com/](https://docs.xenithpay.com/).

## File

| File | Isi |
|---|---|
| `src/providers/xenith/provider.ts` | `XenithProvider` (`createInvoice`, `checkTransaction`, `verifyCallback`, `checkBalance`, `disburse`, `getPaymentMethods`) |
| `src/providers/xenith/signature.ts` | `buildXenithRequestSignature` (outbound API) & `verifyXenithWebhookSignature` (inbound webhook) |
| `src/clients/xenith.ts` | `XenithClient` (HTTP client terotentikasi HMAC-SHA256 Base64 dengan header `Xenith-Api-Key`, `Xenith-Request-Timestamp`, `Xenith-Request-Signature`) |

## Operasi

- `createInvoice`:
  - **Direct Pay In** (ketika `paymentMethod` spesifik, misal `bca_va`, `qris`, `dana`, `ovo`) → memanggil `POST /v1/payins`. Menghasilkan `vaNumber`, `qrString`, atau `paymentUrl` langsung.
  - **Hosted Payment Link** (ketika `paymentMethod` tidak diisi atau `"checkout"`) → memanggil `POST /v1/payment-links`. Menghasilkan `paymentUrl` (checkout session).
- `checkTransaction`:
  - Mendukung lookup by Pay In ID (`payin-...`, `pymt-...`) via `GET /v1/payins/{id}` atau Payment Link ID (`plr-...`) via `GET /v1/payment-links/{id}`.
- `checkBalance`:
  - Memanggil `GET /v1/balances`, mengambil saldo aktif mata uang `IDR`.
- `disburse`:
  - Memanggil `POST /v1/payouts` untuk transfer bank instan ke rekening tujuan.
- `verifyCallback`:
  - Memverifikasi tanda tangan webhook dari header `X-Xenith-Signature` dan `X-Xenith-Timestamp` menggunakan formula HMAC-SHA256 Base64:
    `${method}\n${urlPath}\n${rawBody}\n${timestamp}` di mana pembatasnya adalah literal 2-karakter `\n` sesuai spesifikasi resmi Xenith.
  - Fail-closed: jika signature tidak cocok, header hilang, atau secret belum diset, verifikasi langsung mengembalikan `isValid: false`.

## Kredensial (`.env`)

```env
XENITH_ACCESS_KEY=ak-e9ce58b...       # Access Key dari dashboard
XENITH_SECRET_KEY=sk-1bacf5b...       # Secret Key dari dashboard (API Request Signing)
XENITH_WEBHOOK_SECRET=bNhIQPh...      # Webhook Signature Secret dari dashboard
XENITH_SANDBOX=true
```

## Endpoint

- Sandbox: `https://openapi.sandbox.xenithpay.com`
- Production: `https://openapi.xenithpay.com`

## Catatan IP Whitelist Sandbox

Xenith Pay menerapkan proteksi keamanan **IP Whitelist** wajib untuk semua pemanggilan API di sandbox dan production.
Bila IP pemanggil belum didaftarkan di dashboard Xenith (`app.sandbox.xenithpay.com` -> *Developer Settings* -> *IP Whitelist*), API akan mengembalikan respons:
```json
{
  "code": "UNKNOWN_IP_ADDRESS",
  "message": "IP Address is invalid and unauthorized. Please register this IP Address to your account"
}
```
Untuk menjalankan probe/test live, pastikan IP publik server/mesin Anda telah didaftarkan pada whitelist dashboard Xenith Pay.
