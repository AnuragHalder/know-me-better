/** What a Razorpay webhook asks us to do to a purchase, if anything. */
export type WebhookAction =
  | { type: "paid"; orderId: string; paymentId: string; amount: number }
  | { type: "failed"; orderId: string }
  | { type: "refunded"; paymentId: string };

interface Entity {
  id?: unknown;
  order_id?: unknown;
  payment_id?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

/** Read a (signature-checked) webhook body. Unknown or incomplete events give null. */
export function webhookAction(body: unknown): WebhookAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { event?: unknown; payload?: Record<string, { entity?: Entity }> };
  const payment = b.payload?.payment?.entity;
  const order = b.payload?.order?.entity;
  const refund = b.payload?.refund?.entity;

  switch (b.event) {
    case "order.paid": {
      const orderId = str(order?.id) ?? str(payment?.order_id);
      const paymentId = str(payment?.id);
      const amount = num(order?.amount_paid) ?? num(payment?.amount);
      return orderId && paymentId && amount !== null
        ? { type: "paid", orderId, paymentId, amount }
        : null;
    }
    case "payment.captured": {
      const orderId = str(payment?.order_id);
      const paymentId = str(payment?.id);
      const amount = num(payment?.amount);
      return orderId && paymentId && amount !== null
        ? { type: "paid", orderId, paymentId, amount }
        : null;
    }
    case "payment.failed": {
      const orderId = str(payment?.order_id);
      return orderId ? { type: "failed", orderId } : null;
    }
    case "refund.processed": {
      const paymentId = str(refund?.payment_id) ?? str(payment?.id);
      return paymentId ? { type: "refunded", paymentId } : null;
    }
    default:
      return null;
  }
}
