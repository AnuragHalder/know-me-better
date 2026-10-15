"use client";

import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./browser";

/**
 * Make sure a friend who opens a quiz link has a session, without asking them to
 * sign up. Reuses any existing session (guest or real account); otherwise creates
 * an anonymous guest account, which the database treats as one player.
 * Used by the play flow (Phase 5).
 */
export async function ensureGuestSession(): Promise<User> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;

  const { data: created, error } = await supabase.auth.signInAnonymously();
  if (error || !created.user) throw error ?? new Error("Could not start a guest session");
  return created.user;
}
