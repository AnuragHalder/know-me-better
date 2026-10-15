import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { QuizBuilder } from "@/components/QuizBuilder";
import { loadBank } from "@/lib/quiz/bank";
import { loadOwnerQuiz } from "@/lib/quiz/owner";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit your quiz · Know Me Better" };

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect(`/login?next=/me/quiz/${id}/edit`);

  const supabase = await getServerSupabase();
  if (!supabase) notFound();

  const quiz = await loadOwnerQuiz(supabase, id);
  if (!quiz) notFound();
  // Answers lock once friends have played; the quiz page explains why.
  if (quiz.play_count > 0) redirect(`/me/quiz/${id}`);

  const bank = await loadBank(supabase);
  const inBank = new Set(bank.map((q) => q.id));
  const initialItems = quiz.questions
    .filter((q) => q.question_id && inBank.has(q.question_id))
    .map((q) => ({ questionId: q.question_id as string, answer: q.correct_option }));

  return (
    <PageShell>
      <QuizBuilder
        bank={bank}
        initialItems={initialItems}
        initialName={quiz.owner_name}
        quizId={quiz.id}
      />
    </PageShell>
  );
}
