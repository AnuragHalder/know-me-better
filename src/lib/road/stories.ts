import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Story } from "./story";

const COLUMNS = "id, title, blurb, turns, endings";

/** Every active story, in display order. Empty when the database isn't reachable. */
export async function loadStories(supabase: SupabaseClient | null): Promise<Story[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stories")
    .select(COLUMNS)
    .eq("active", true)
    .order("sort");
  if (error) return [];
  return (data ?? []) as Story[];
}

export async function loadStory(
  supabase: SupabaseClient | null,
  id: string,
): Promise<Story | null> {
  if (!supabase || !/^[a-z0-9_]{2,40}$/.test(id)) return null;
  const { data, error } = await supabase.from("stories").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as Story;
}
