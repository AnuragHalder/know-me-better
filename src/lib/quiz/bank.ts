import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BankQuestion } from "./build";

/** The active question bank, in display order. */
export async function loadBank(supabase: SupabaseClient): Promise<BankQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, prompt_self, options")
    .eq("active", true)
    .order("sort");
  if (error) throw new Error(`Could not load questions: ${error.message}`);
  return data ?? [];
}
