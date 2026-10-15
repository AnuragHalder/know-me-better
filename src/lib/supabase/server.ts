import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * The Supabase client for server components, server actions and route handlers.
 * Acts as the signed-in visitor (their cookies), never with elevated rights.
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  // Read cookies first: this marks every page that checks the visitor as per-request,
  // even in builds without Supabase configured.
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) return null;
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only.
          // The middleware refreshes the session cookies instead.
        }
      },
    },
  });
}

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
}

/** The visitor's verified account, or null when signed out. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    id: u.id,
    email: u.email ?? null,
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
    isGuest: u.is_anonymous ?? false,
  };
}
