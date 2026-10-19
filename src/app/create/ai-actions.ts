"use server";

import { aiConfigured, isFlagged, questionTexts, writeQuestions } from "@/lib/ai/openai";
import { topicsProblem, type GeneratedQuestion } from "@/lib/ai/questions";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * AI-written questions. Who may generate is decided in the database
 * (claim_ai_generation): Pro members, or one completed ad per generation.
 * These actions run as the signed-in creator, never with elevated rights.
 */

export interface AiStatus {
  /** False when OPENAI_API_KEY isn't set on this deployment. */
  available: boolean;
  pro: boolean;
  credits: number;
  adsLeft: number;
}

type DbStatus = { pro: boolean; credits: number; ads_left: number };

const toStatus = (s: DbStatus): AiStatus => ({
  available: aiConfigured(),
  pro: s.pro,
  credits: s.credits,
  adsLeft: s.ads_left,
});

export async function getAiStatus(): Promise<AiStatus | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ai_status");
  if (error || !data) return null;
  return toStatus(data as DbStatus);
}

export async function startAd(): Promise<{ id: string; seconds: number } | { error: string }> {
  const supabase = await getServerSupabase();
  if (!supabase) return { error: quizErrorMessage("ai_unavailable") };
  const { data, error } = await supabase.rpc("start_ad_session");
  if (error || !data) return { error: quizErrorMessage(error?.message) };
  return data as { id: string; seconds: number };
}

export async function finishAd(id: string): Promise<{ status: AiStatus } | { error: string }> {
  const supabase = await getServerSupabase();
  if (!supabase) return { error: quizErrorMessage("ai_unavailable") };
  const { data, error } = await supabase.rpc("complete_ad_session", { p_id: id });
  if (error || !data) return { error: quizErrorMessage(error?.message) };
  return { status: toStatus(data as DbStatus) };
}

export type GenerateResult =
  | { ok: true; questions: GeneratedQuestion[]; status: AiStatus | null }
  | { ok: false; needsUnlock: true; status: AiStatus }
  | { ok: false; needsUnlock?: false; error: string; status?: AiStatus | null };

export async function generateAiQuestions(topics: string): Promise<GenerateResult> {
  const problem = topicsProblem(topics ?? "");
  if (problem) return { ok: false, error: problem };
  if (!aiConfigured()) return { ok: false, error: quizErrorMessage("ai_unavailable") };

  const supabase = await getServerSupabase();
  if (!supabase) return { ok: false, error: quizErrorMessage("ai_unavailable") };

  // Check the topics before spending the creator's credit.
  try {
    if (await isFlagged([topics]))
      return { ok: false, error: quizErrorMessage("text_not_allowed") };
  } catch {
    return { ok: false, error: quizErrorMessage("ai_unavailable") };
  }

  const { data: claimData, error: claimError } = await supabase.rpc("claim_ai_generation", {
    p_topics: topics.trim(),
  });
  if (claimError || !claimData) return { ok: false, error: quizErrorMessage(claimError?.message) };
  const claim = claimData as
    | { allowed: true; id: string; via: "pro" | "ad" }
    | ({ allowed: false; reason: "needs_unlock" | "daily_limit" } & DbStatus);

  if (!claim.allowed) {
    if (claim.reason === "needs_unlock") {
      return { ok: false, needsUnlock: true, status: toStatus(claim) };
    }
    return { ok: false, error: quizErrorMessage(claim.reason), status: await getAiStatus() };
  }

  let questions: GeneratedQuestion[] = [];
  try {
    questions = await writeQuestions(topics);
    if (questions.length > 0 && (await isFlagged(questionTexts(questions)))) questions = [];
  } catch (e) {
    console.error("AI generation failed:", e instanceof Error ? e.message : e);
    questions = [];
  }

  const ok = questions.length > 0;
  // A failed generation gives the ad credit back.
  await supabase.rpc("finish_ai_generation", { p_id: claim.id, p_ok: ok });
  const status = await getAiStatus();
  if (!ok) {
    return {
      ok: false,
      error: "The AI couldn't write questions on that. Try different topics; your unlock is kept.",
      status,
    };
  }
  return { ok: true, questions, status };
}
