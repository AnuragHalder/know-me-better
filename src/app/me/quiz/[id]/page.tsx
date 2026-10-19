import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteQuizButton } from "@/components/DeleteQuizButton";
import { Leaderboard, type LeaderboardRow } from "@/components/Leaderboard";
import { PageShell } from "@/components/PageShell";
import { ShareBox } from "@/components/ShareBox";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { siteOrigin } from "@/lib/origin";
import { fillName } from "@/lib/quiz/build";
import { loadOwnerQuiz } from "@/lib/quiz/owner";
import { playPath } from "@/lib/quiz/share";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your quiz" };

export default async function OwnerQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; saved?: string }>;
}) {
  const [{ id }, { new: isNew, saved }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect(`/login?next=/me/quiz/${id}`);

  const supabase = await getServerSupabase();
  if (!supabase) notFound();
  const quiz = await loadOwnerQuiz(supabase, id);
  if (!quiz) notFound();

  const url = `${await siteOrigin()}${playPath(quiz.code)}`;

  let rows: LeaderboardRow[] = [];
  let hidden = 0;
  if (quiz.play_count > 0) {
    const { data } = await supabase.rpc("get_leaderboard", { p_quiz_id: quiz.id });
    const board = data as {
      total: number;
      rows: { rank: number; player_name: string; results: boolean[] }[];
    } | null;
    rows = (board?.rows ?? []).map((r) => ({
      id: `${r.rank}-${r.player_name}`,
      name: r.player_name,
      answers: r.results,
      rank: r.rank,
    }));
    hidden = Math.max(0, (board?.total ?? 0) - rows.length);
  }
  const locked = quiz.play_count > 0;

  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {isNew ? "Your page is ready" : saved ? "Changes saved" : `${quiz.owner_name}'s page`}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          Send this to <span className="highlight">your friends</span>
        </h1>
        <ShareBox url={url} code={quiz.code} />
      </Sheet>

      <Sheet>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Who knows you best</h2>
          <span className="font-mono text-sm text-ink-soft tabular-nums">
            {quiz.play_count} played
          </span>
        </div>
        <Leaderboard
          rows={rows}
          emptyText="No one has played yet. The leaderboard shows up here as friends finish."
        />
        {hidden > 0 && (
          <p className="text-sm text-ink-soft">
            {hidden} more {hidden === 1 ? "friend" : "friends"} played. The full leaderboard is
            coming soon.
          </p>
        )}
      </Sheet>

      <Sheet>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Your answers</h2>
          {!locked && (
            <Link href={`/me/quiz/${quiz.id}/edit`} className="min-h-11 content-center text-sm">
              Edit
            </Link>
          )}
        </div>
        {locked && (
          <p className="text-sm text-ink-soft">
            Answers are locked because friends have played. Changing them would make their scores
            wrong.
          </p>
        )}
        <ol className="flex flex-col">
          {quiz.questions.map((q) => (
            <li
              key={q.position}
              className="flex flex-col gap-1 border-t border-line py-2.5 first:border-t-0"
            >
              <span className="text-sm text-ink-soft">
                <span className="mr-1.5 font-mono">{String(q.position + 1).padStart(2, "0")}</span>
                {fillName(q.prompt, quiz.owner_name)}
              </span>
              <span className="font-semibold">{q.options[q.correct_option]}</span>
            </li>
          ))}
        </ol>
      </Sheet>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <ButtonLink href="/me" variant="ghost" size="sm">
          All my quizzes
        </ButtonLink>
        <DeleteQuizButton quizId={quiz.id} plays={quiz.play_count} />
      </div>
    </PageShell>
  );
}
