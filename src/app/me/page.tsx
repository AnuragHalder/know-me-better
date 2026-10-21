import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { PageShell } from "@/components/PageShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { timeAgo } from "@/lib/quiz/board";
import { QUESTIONS_PER_QUIZ } from "@/lib/quiz/verdict";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your quizzes" };

interface QuizRow {
  id: string;
  code: string;
  owner_name: string;
  play_count: number;
  created_at: string;
  last_played_at: string | null;
  top: { player_name: string; score: number } | null;
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/login?next=/me");

  const supabase = await getServerSupabase();
  const { data } = supabase ? await supabase.rpc("my_quizzes") : { data: [] };
  const quizzes = (data ?? []) as QuizRow[];
  const firstName = user.name?.split(" ")[0];

  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {deleted ? "Quiz deleted" : "Signed in"}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          {firstName ? (
            <>
              Hi, <span className="highlight">{firstName}</span>
            </>
          ) : (
            "Your quizzes"
          )}
        </h1>
        {quizzes.length === 0 ? (
          <>
            <p className="text-ink-soft">
              Fill in your slam-book page: 10 questions about you. Then send the link and see which
              friend knows you best.
            </p>
            <div>
              <ButtonLink href="/create" variant="pink">
                Make my quiz
              </ButtonLink>
            </div>
          </>
        ) : (
          <p className="text-ink-soft">Tap a quiz to share it or check who has played.</p>
        )}
      </Sheet>

      {quizzes.length > 0 && (
        <Sheet>
          <ul className="flex flex-col">
            {quizzes.map((q) => (
              <li key={q.id} className="border-t border-line first:border-t-0">
                <Link
                  href={`/me/quiz/${q.id}`}
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 text-ink no-underline"
                >
                  <span className="truncate font-semibold">{q.owner_name}&apos;s page</span>
                  <span className="font-mono text-sm font-bold tracking-widest">{q.code}</span>
                  <span className="truncate text-sm text-ink-soft">
                    {q.top ? (
                      <>
                        <b className="text-ink">{q.top.player_name}</b> leads, {q.top.score}/
                        {QUESTIONS_PER_QUIZ}
                      </>
                    ) : (
                      `Made ${dateFormat.format(new Date(q.created_at))}`
                    )}
                  </span>
                  <span className="text-right text-sm text-ink-soft tabular-nums">
                    {q.play_count} played
                    {q.last_played_at && (
                      <span className="block text-xs">last {timeAgo(q.last_played_at)}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div>
            <ButtonLink href="/create" variant="ghost" size="sm">
              Make another quiz
            </ButtonLink>
          </div>
        </Sheet>
      )}

      <p className="text-sm text-ink-soft">
        Signed in as <b className="break-all text-ink">{user.email ?? user.name}</b>.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </PageShell>
  );
}
