"use server";

import { redirect } from "next/navigation";
import { aiConfigured, isFlagged } from "@/lib/ai/openai";
import { cleanName, nameProblem } from "@/lib/names";
import type { RpcItem } from "@/lib/quiz/build";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { QUESTIONS_PER_QUIZ } from "@/lib/quiz/verdict";
import { getServerSupabase } from "@/lib/supabase/server";

export interface SaveQuizInput {
  /** Set when editing an existing quiz. */
  quizId?: string;
  ownerName: string;
  items: RpcItem[];
  look?: "notebook" | "clean";
}

/**
 * Create or update a quiz. The database validates everything again; these checks
 * just give quicker, friendlier messages. On success this redirects.
 */
export async function saveQuiz(input: SaveQuizInput): Promise<{ error: string }> {
  const problem = nameProblem(input.ownerName ?? "");
  if (problem) return { error: problem };
  if (!Array.isArray(input.items) || input.items.length !== QUESTIONS_PER_QUIZ) {
    return { error: quizErrorMessage("need_10_questions") };
  }

  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Saving isn't set up on this copy of the app yet." };

  // Words the creator typed themselves are checked like AI output, when AI is set up.
  const ownWords = input.items.flatMap((i) =>
    "prompt_other" in i && i.prompt_other
      ? [
          i.prompt_other,
          ...(i.options ?? []),
          ...("prompt_self" in i && i.prompt_self ? [i.prompt_self] : []),
        ]
      : [],
  );
  if (ownWords.length > 0 && aiConfigured()) {
    try {
      if (await isFlagged([input.ownerName, ...ownWords])) {
        return { error: quizErrorMessage("text_not_allowed") };
      }
    } catch {
      // If the check is down, the quiz still saves; the database limits still apply.
    }
  }

  const ownerName = cleanName(input.ownerName);
  const { data, error } = input.quizId
    ? await supabase.rpc("update_quiz", {
        p_quiz_id: input.quizId,
        p_owner_name: ownerName,
        p_items: input.items,
      })
    : await supabase.rpc("create_quiz", { p_owner_name: ownerName, p_items: input.items });

  if (error || !data) return { error: quizErrorMessage(error?.message) };

  const { id } = data as { id: string; code: string };
  if (input.look) {
    // Cosmetic: if this fails the quiz is still saved, in the notebook look.
    await supabase.rpc("set_quiz_look", { p_quiz_id: id, p_look: input.look });
  }
  redirect(input.quizId ? `/me/quiz/${id}?saved=1` : `/me/quiz/${id}?new=1`);
}

/** Delete one of the signed-in creator's quizzes. Row-level security stops anyone else. */
export async function deleteQuiz(quizId: string): Promise<{ error: string }> {
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "Deleting isn't set up on this copy of the app yet." };
  const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
  if (error) return { error: quizErrorMessage(error.message) };
  redirect("/me?deleted=1");
}
