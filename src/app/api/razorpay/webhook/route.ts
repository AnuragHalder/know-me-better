import { NextResponse, type NextRequest } from "next/server";
import { adminSupabase, paymentConfig } from "@/lib/razorpay/server";
import { webhookSignatureValid } from "@/lib/razorpay/signature";
import { webhookAction } from "@/lib/razorpay/webhook";

export const runtime = "nodejs";

/**
 * Razorpay calls this when a payment succeeds, fails or is refunded. It is the
 * only thing that grants an unlock. Every request must carry a valid signature
 * made with RAZORPAY_WEBHOOK_SECRET; repeats are harmless.
 */
export async function POST(request: NextRequest) {
  const config = paymentConfig();
  if (!config) return NextResponse.json({ error: "payments_off" }, { status: 503 });

  const raw = await request.text();
  if (
    !webhookSignatureValid(raw, request.headers.get("x-razorpay-signature"), config.webhookSecret)
  ) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const action = webhookAction(body);
  if (!action) return NextResponse.json({ ok: true, ignored: true });

  const admin = adminSupabase(config);
  const { error } =
    action.type === "paid"
      ? await admin.rpc("mark_purchase_paid", {
          p_order_id: action.orderId,
          p_payment_id: action.paymentId,
          p_amount: action.amount,
        })
      : action.type === "failed"
        ? await admin.rpc("mark_purchase_failed", { p_order_id: action.orderId })
        : await admin.rpc("mark_purchase_refunded", { p_payment_id: action.paymentId });

  if (error) {
    // Orders from another app on the same Razorpay account aren't ours: acknowledge
    // them so Razorpay stops retrying. Anything else is logged for a look.
    if (/order_not_found/.test(error.message)) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    console.error("Razorpay webhook", action, error.message);
    if (/amount_mismatch/.test(error.message)) return NextResponse.json({ ok: false });
    // Temporary trouble (database unreachable): let Razorpay retry later.
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
