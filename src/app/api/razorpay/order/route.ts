import { NextResponse, type NextRequest } from "next/server";
import { BRAND_NAME } from "@/lib/brand";
import { PRODUCTS } from "@/lib/pricing";
import { adminSupabase, createRazorpayOrder, paymentConfig } from "@/lib/razorpay/server";
import { getServerSupabase } from "@/lib/supabase/server";

/** Products checkout can sell today. The database checks again. */
const ON_SALE = new Set(["second_chance", "lock_retries", "full_board"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Start a purchase: check the buyer may buy it, create a Razorpay order for the
 * price from our own price list (never one sent by the browser), and record it.
 * Nothing is unlocked here; the verified webhook does that once Razorpay says paid.
 */
export async function POST(request: NextRequest) {
  const config = paymentConfig();
  if (!config) return fail("payments_off", 503);

  const body = (await request.json().catch(() => null)) as {
    product?: unknown;
    quizId?: unknown;
  } | null;
  const product = typeof body?.product === "string" ? body.product : "";
  const quizId = typeof body?.quizId === "string" ? body.quizId : "";
  if (!ON_SALE.has(product) || !UUID.test(quizId)) return fail("not_for_sale", 400);

  const supabase = await getServerSupabase();
  const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = userData.user;
  if (!supabase || !user) return fail("sign_in_required", 401);

  // As the buyer: may they buy this, and at what price?
  const { data: ok, error } = await supabase.rpc("purchase_eligibility", {
    p_product: product,
    p_quiz_id: quizId,
  });
  if (error || !ok) return fail(error?.message ?? "not_for_sale", 400);
  const amount = (ok as { amount_paise: number }).amount_paise;
  const listed = PRODUCTS.find((p) => p.id === product);
  if (!listed || listed.amountPaise !== amount) return fail("not_for_sale", 400);

  let order: { id: string; amount: number; currency: string };
  try {
    order = await createRazorpayOrder(config, amount, {
      product,
      quiz_id: quizId,
      user_id: user.id,
    });
  } catch (e) {
    console.error(e);
    return fail("payment_unavailable", 502);
  }

  const { error: recordError } = await adminSupabase(config).rpc("record_purchase_order", {
    p_user: user.id,
    p_product: product,
    p_quiz_id: quizId,
    p_amount: amount,
    p_order_id: order.id,
  });
  if (recordError) {
    console.error(recordError);
    return fail("payment_unavailable", 502);
  }

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: config.keyId,
    name: BRAND_NAME,
    description: listed.name,
  });
}
