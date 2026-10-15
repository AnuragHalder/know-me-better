"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/** The Supabase client for client components. Null when Supabase isn't configured. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (client) return client;
  const env = supabaseEnv();
  if (!env) return null;
  client = createBrowserClient(env.url, env.key);
  return client;
}
