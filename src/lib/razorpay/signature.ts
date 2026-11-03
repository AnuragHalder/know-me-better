import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** A webhook body really came from Razorpay (X-Razorpay-Signature over the raw body). */
export function webhookSignatureValid(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  return sameHex(hmacHex(secret, rawBody), signature);
}

/** Checkout's success signature: HMAC of "order_id|payment_id" with the key secret. */
export function paymentSignatureValid(
  orderId: string,
  paymentId: string,
  signature: string | null | undefined,
  keySecret: string,
): boolean {
  if (!signature || !keySecret) return false;
  return sameHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature);
}
