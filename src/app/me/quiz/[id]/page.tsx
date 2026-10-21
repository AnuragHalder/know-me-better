import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteQuizButton } from "@/components/DeleteQuizButton";
import { LiveLeaderboard } from "@/components/LiveLeaderboard";
import { PageShell } from "@/components/PageShell";
import { ShareBox } from "@/components/ShareBox";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { siteOrigin } from "@/lib/origin";
import { formatRupees, PRODUCTS } from "@/lib/pricing";
import type { Board } from "@/lib/quiz/board";
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

  const [{ data: boardData }, { data: statsData }, { data: lockData }] = await Promise.all([
    supabase.rpc("get_leaderboard", { p_quiz_id: quiz.id }),
    quiz.play_count > 0
      ? supabase.rpc("quiz_question_stats", { p_quiz_id: quiz.id })
      : Promise.resolve({ data: null }),
    supabase
      .from("purchases")
      .select("id")
      .eq("product", "lock_retries")
      .eq("quiz_id", quiz.id)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle(),
  ]);
  const retriesLocked = Boolean(lockData);
  const board = (boardData as Board | null) ?? null;
  const stats = new Map(
    ((statsData as QuestionStat[] | null) ?? []).map((st) => [st.position, st]),
  );
  // The question that fooled the most friends (only once a few have played).
  const hardest = [...stats.values()]
    .filter((st) => st.total >= 3)
    .sort((a, b) => a.right / a.total - b.right / b.total)[0];
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
        <LiveLeaderboard
          quizId={quiz.id}
          initial={board}
          title="Who knows you best"
          ownerName={quiz.owner_name}
          viewer="owner"
          emptyText="No one has played yet. The leaderboard shows up here as friends finish."
        />
      </Sheet>

      <RetriesCard locked={retriesLocked} />

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
              {stats.get(q.position) && (
                <StatBar stat={stats.get(q.position)!} hardest={hardest?.position === q.position} />
              )}
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

interface QuestionStat {
  position: number;
  right: number;
  total: number;
}

/** How many friends got one answer right, as a small bar. */
function StatBar({ stat, hardest }: { stat: QuestionStat; hardest: boolean }) {
  const pct = stat.total ? Math.round((stat.right / stat.total) * 100) : 0;
  return (
    <span className="flex items-center gap-2 text-xs text-ink-soft">
      <span
        className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-bad/30"
        aria-hidden="true"
      >
        <span className="block h-full bg-good" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">
        {stat.right} of {stat.total} got it
      </span>
      {hardest && stat.right < stat.total && (
        <span className="rounded-full bg-hi px-1.5 font-bold text-on-hi">Fooled most friends</span>
      )}
    </span>
  );
}

const SECOND_CHANCE = PRODUCTS.find((p) => p.id === "second_chance");
const LOCK_RETRIES = PRODUCTS.find((p) => p.id === "lock_retries");

/** Second chances are on by default; the creator can pay once to turn them off. */
function RetriesCard({ locked }: { locked: boolean }) {
  return (
    <Sheet>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-bold">Second chances</h2>
        <span className="text-sm font-semibold text-ink-soft">{locked ? "Off" : "On"}</span>
      </div>
      {locked ? (
        <p className="text-ink-soft">Retries are locked. Every friend gets one go only.</p>
      ) : (
        <>
          <p className="text-ink-soft">
            After playing, a friend can pay{" "}
            {SECOND_CHANCE ? formatRupees(SECOND_CHANCE.amountPaise) : ""} to replay your quiz;
            their best score counts. Want one go only?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" disabled>
              Lock retries for {LOCK_RETRIES ? formatRupees(LOCK_RETRIES.amountPaise) : ""}
            </Button>
            <span className="text-xs text-ink-soft">Payments open soon</span>
          </div>
        </>
      )}
    </Sheet>
  );
}
