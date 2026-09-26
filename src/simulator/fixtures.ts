import type { SimulationStatus } from "./types";

/**
 * Fixture kontrak status webhook untuk 20 provider.
 * Menggambarkan pemetaan status asli gateway ke status kanonik Buayar.
 */
export const CONTRACT_FIXTURES: Record<string, Record<SimulationStatus, any>> = {
  midtrans: {
    paid: { transaction_status: "settlement", status_code: "200", fraud_status: "accept" },
    pending: { transaction_status: "pending", status_code: "201", fraud_status: "accept" },
    failed: { transaction_status: "deny", status_code: "202", fraud_status: "deny" },
    expired: { transaction_status: "expire", status_code: "407", fraud_status: "accept" },
  },
  duitku: {
    paid: { resultCode: "00" },
    pending: { resultCode: "01" },
    failed: { resultCode: "02" },
    expired: { resultCode: "02" },
  },
  ipaymu: {
    paid: { status: "berhasil", status_code: 1, transaction_status_code: 1, paid_off: 1 },
    pending: { status: "pending", status_code: 0, transaction_status_code: 0, paid_off: 0 },
    failed: { status: "gagal", status_code: -1, transaction_status_code: -1, paid_off: 0 },
    expired: { status: "expired", status_code: -2, transaction_status_code: -2, paid_off: 0 },
  },
  xendit: {
    paid: { status: "PAID" },
    pending: { status: "PENDING" },
    failed: { status: "FAILED" },
    expired: { status: "EXPIRED" },
  },
  doku: {
    paid: { transaction: { status: "SUCCESS" }, service: { id: "ONLINE_PAYMENT" } },
    pending: { transaction: { status: "PENDING" }, service: { id: "ONLINE_PAYMENT" } },
    failed: { transaction: { status: "FAILED" }, service: { id: "ONLINE_PAYMENT" } },
    expired: { transaction: { status: "EXPIRED" }, service: { id: "ONLINE_PAYMENT" } },
  },
  prismalink: {
    paid: { status: "SUCCESS", response_code: "00" },
    pending: { status: "PENDING", response_code: "01" },
    failed: { status: "FAILED", response_code: "02" },
    expired: { status: "EXPIRED", response_code: "03" },
  },
  faspay: {
    paid: { payment_status_code: "2", payment_status_desc: "Payment Success" },
    pending: { payment_status_code: "1", payment_status_desc: "Pending Payment" },
    failed: { payment_status_code: "8", payment_status_desc: "Payment Cancelled" },
    expired: { payment_status_code: "7", payment_status_desc: "Payment Expired" },
  },
  finpay: {
    paid: { payment_status: "PAID", response_code: "00" },
    pending: { payment_status: "PENDING", response_code: "01" },
    failed: { payment_status: "FAILED", response_code: "05" },
    expired: { payment_status: "EXPIRED", response_code: "06" },
  },
  nicepay: {
    paid: { status: "0" },
    pending: { status: "1" },
    failed: { status: "2" },
    expired: { status: "2" },
  },
  oy: {
    paid: { status: "SUCCESS" },
    pending: { status: "PENDING" },
    failed: { status: "FAILED" },
    expired: { status: "EXPIRED" },
  },
  stripe: {
    paid: { type: "payment_intent.succeeded", object_status: "succeeded" },
    pending: { type: "payment_intent.processing", object_status: "processing" },
    failed: { type: "payment_intent.payment_failed", object_status: "requires_payment_method" },
    expired: { type: "payment_intent.canceled", object_status: "canceled" },
  },
  paypal: {
    paid: { event_type: "PAYMENT.CAPTURE.COMPLETED", status: "COMPLETED" },
    pending: { event_type: "PAYMENT.CAPTURE.PENDING", status: "PENDING" },
    failed: { event_type: "PAYMENT.CAPTURE.DENIED", status: "DENIED" },
    expired: { event_type: "CHECKOUT.ORDER.VOIDED", status: "VOIDED" },
  },
  adyen: {
    paid: { eventCode: "AUTHORISATION", success: "true" },
    pending: { eventCode: "PENDING", success: "true" },
    failed: { eventCode: "AUTHORISATION", success: "false" },
    expired: { eventCode: "CANCEL_OR_REFUND", success: "true" },
  },
  checkoutcom: {
    paid: { type: "payment_captured" },
    pending: { type: "payment_pending" },
    failed: { type: "payment_declined" },
    expired: { type: "payment_expired" },
  },
  razorpay: {
    paid: { event: "payment.captured", status: "captured" },
    pending: { event: "payment.authorized", status: "authorized" },
    failed: { event: "payment.failed", status: "failed" },
    expired: { event: "payment_link.expired", status: "expired" },
  },
  square: {
    paid: { type: "payment.updated", status: "COMPLETED" },
    pending: { type: "payment.updated", status: "PENDING" },
    failed: { type: "payment.updated", status: "FAILED" },
    expired: { type: "payment.updated", status: "CANCELED" },
  },
  payu: {
    paid: { status: "COMPLETED" },
    pending: { status: "PENDING" },
    failed: { status: "CANCELED" },
    expired: { status: "REJECTED" },
  },
  braintree: {
    paid: { kind: "transaction_settled", status: "settled" },
    pending: { kind: "transaction_submitted_for_settlement", status: "submitted_for_settlement" },
    failed: { kind: "transaction_failed", status: "failed" },
    expired: { kind: "transaction_voided", status: "voided" },
  },
  twocheckout: {
    paid: { ORDERSTATUS: "COMPLETE" },
    pending: { ORDERSTATUS: "PENDING" },
    failed: { ORDERSTATUS: "INVALID" },
    expired: { ORDERSTATUS: "EXPIRED" },
  },
  sumopod: {
    paid: { event_type: "payment.completed", status: "completed" },
    pending: { event_type: "payment.created", status: "created" },
    failed: { event_type: "payment.failed", status: "failed" },
    expired: { event_type: "payment.expired", status: "expired" },
  },
};
