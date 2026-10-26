import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OwnerQuiz {
  id: string;
  code: string;
  owner_name: string;
  play_count: number;
  created_at: string;
  look: "notebook" | "clean";
  kind: "quiz" | "road";
  story_id: string | null;
  questions: {
    position: number;
    question_id: string | null;
    prompt: string;
    prompt_self: string | null;
    options: string[];
    correct_option: number;
    source: "bank" | "edited" | "custom" | "ai";
    kind: "choice" | "pin";
    map_scope: "india" | "world" | null;
    answer_lat: number | null;
    answer_lng: number | null;
    answer_label: string | null;
  }[];
}

/**
 * One of the signed-in creator's quizzes with its answers. Row-level security means
 * this returns null for anyone else's quiz, exactly as if it didn't exist.
 */
export async function loadOwnerQuiz(
  supabase: SupabaseClient,
  quizId: string,
): Promise<OwnerQuiz | null> {
  if (!/^[0-9a-f-]{36}$/i.test(quizId)) return null;
  const { data, error } = await supabase
    .from("quizzes")
    .select(
      "id, code, owner_name, play_count, created_at, look, kind, story_id, questions:quiz_questions(position, question_id, prompt, prompt_self, options, correct_option, source, kind, map_scope, answer_lat, answer_lng, answer_label)",
    )
    .eq("id", quizId)
    .maybeSingle();
  if (error || !data) return null;
  const quiz = data as OwnerQuiz;
  quiz.questions = [...quiz.questions].sort((a, b) => a.position - b.position);
  return quiz;
}
