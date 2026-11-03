import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Razorpay and the Supabase service role, read on the server only. Never give
 * these the NEXT_PUBLIC_ prefix: the key secret, the webhook secret and the
 * service role key must never reach a browser.
 */
export interface PaymentConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

export function paymentConfig(): PaymentConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = supabaseEnv()?.url;
  if (!keyId || !keySecret || !webhookSecret || !serviceRoleKey || !supabaseUrl) return null;
  return { keyId, keySecret, webhookSecret, serviceRoleKey, supabaseUrl };
}

/** True when checkout can open. Pages show "Payments open soon" otherwise. */
export function paymentsEnabled(): boolean {
  return paymentConfig() !== null;
}

/** Supabase as the server itself. Only for the payment functions granted to service_role. */
export function adminSupabase(config: PaymentConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Create a Razorpay order. Amount in paise. */
export async function createRazorpayOrder(
  config: PaymentConfig,
  amountPaise: number,
  notes: Record<string, string>,
): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: `wkmb_${Date.now().toString(36)}`,
      notes,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
  const order = (await res.json()) as { id: string; amount: number; currency: string };
  return order;
}
