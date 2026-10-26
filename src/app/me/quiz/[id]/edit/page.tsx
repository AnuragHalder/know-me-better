import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { QuizBuilder } from "@/components/QuizBuilder";
import { getAiStatus } from "@/app/create/ai-actions";
import { loadBank } from "@/lib/quiz/bank";
import { draftFromSaved } from "@/lib/quiz/build";
import { loadOwnerQuiz } from "@/lib/quiz/owner";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit your quiz" };

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect(`/login?next=/me/quiz/${id}/edit`);

  const supabase = await getServerSupabase();
  if (!supabase) notFound();

  const quiz = await loadOwnerQuiz(supabase, id);
  if (!quiz) notFound();
  // Answers lock once friends have played; the quiz page explains why.
  // Roads keep their story; friends' guesses are scored against it.
  if (quiz.play_count > 0 || quiz.kind === "road") redirect(`/me/quiz/${id}`);

  const [bank, aiStatus] = await Promise.all([loadBank(supabase), getAiStatus()]);
  const initialItems = draftFromSaved(quiz.questions, new Map(bank.map((q) => [q.id, q])));

  return (
    <PageShell>
      <QuizBuilder
        bank={bank}
        initialItems={initialItems}
        initialName={quiz.owner_name}
        quizId={quiz.id}
        aiStatus={aiStatus}
        initialLook={quiz.look}
      />
    </PageShell>
  );
}
