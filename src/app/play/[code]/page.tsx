import type { Metadata } from "next";
import { cache } from "react";
import { PageShell } from "@/components/PageShell";
import { PlayClient, type PlayQuiz, type PlayStart } from "@/components/play/PlayClient";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { BRAND_NAME } from "@/lib/brand";
import { siteOrigin } from "@/lib/origin";
import { playPath } from "@/lib/quiz/share";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

type Params = { params: Promise<{ code: string }> };

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

/** The quiz as friends may see it: wording and options, never the answers. */
const loadQuiz = cache(async (raw: string): Promise<PlayQuiz | null> => {
  const code = raw.toUpperCase();
  if (!CODE.test(code)) return null;
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.rpc("get_quiz_for_play", { p_code: code });
  const q = data as {
    id: string;
    code: string;
    owner_name: string;
    look?: string;
    retries_locked?: boolean;
    questions: PlayQuiz["questions"] | null;
  } | null;
  if (!q?.questions?.length) return null;
  return {
    id: q.id,
    code: q.code,
    ownerName: q.owner_name,
    retriesLocked: Boolean(q.retries_locked),
    look: q.look === "clean" ? "clean" : "notebook",
    questions: q.questions,
  };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const quiz = await loadQuiz(code);
  if (!quiz) return { title: "Play" };
  const title = `How well do you know ${quiz.ownerName}?`;
  const description = `Take ${quiz.ownerName}'s ${quiz.questions.length}-question quiz on ${BRAND_NAME} and see where you land on the leaderboard.`;
  return { title, description, openGraph: { title, description } };
}

export default async function PlayPage({ params }: Params) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const quiz = await loadQuiz(code);

  if (!quiz) {
    return (
      <PageShell>
        <Sheet ruled>
          <h1 className="font-hand text-4xl leading-tight font-bold">No quiz with code {code}</h1>
          <p className="text-ink-soft">
            Check the code with your friend. Codes have 6 letters and numbers, without O, I, 0 or 1.
          </p>
          <div>
            <ButtonLink href="/create" variant="pink">
              Make your own quiz
            </ButtonLink>
          </div>
        </Sheet>
      </PageShell>
    );
  }

  const [user, supabase] = await Promise.all([getCurrentUser(), getServerSupabase()]);
  let start: PlayStart = { kind: "new", suggestedName: user?.name?.split(" ")[0] ?? "" };

  if (user && supabase) {
    // Row-level security: the owner can read their own quiz, a player their own attempts.
    const [{ data: own }, { data: attempt }, { data: chance }] = await Promise.all([
      supabase.from("quizzes").select("id").eq("id", quiz.id).maybeSingle(),
      supabase
        .from("attempts")
        .select("id, attempt_no, player_name, results, finished_at")
        .eq("quiz_id", quiz.id)
        .eq("player_id", user.id)
        .order("attempt_no", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // A paid second chance for this quiz (buyers can read their own purchases).
      supabase
        .from("purchases")
        .select("id")
        .eq("user_id", user.id)
        .eq("product", "second_chance")
        .eq("quiz_id", quiz.id)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle(),
    ]);

    if (own) {
      return (
        <PageShell look={quiz.look}>
          <Sheet ruled>
            <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
              Code {quiz.code}
            </span>
            <h1 className="font-hand text-4xl leading-tight font-bold">
              This is <span className="highlight">your</span> quiz
            </h1>
            <p className="text-ink-soft">
              You can&apos;t play your own page. Send the link to friends and watch their scores.
            </p>
            <div>
              <ButtonLink href={`/me/quiz/${quiz.id}`} variant="pink">
                See scores and share
              </ButtonLink>
            </div>
          </Sheet>
        </PageShell>
      );
    }

    if (attempt) {
      const a = attempt as {
        id: string;
        attempt_no: number;
        player_name: string;
        results: boolean[] | null;
        finished_at: string | null;
      };
      start = a.finished_at
        ? {
            kind: "finished",
            playerName: a.player_name,
            results: a.results ?? [],
            // The database decides for real in start_attempt; this only picks what to show.
            retry:
              a.attempt_no >= 2
                ? "used"
                : chance
                  ? "ready"
                  : quiz.retriesLocked
                    ? "locked"
                    : "offer",
          }
        : {
            kind: "resume",
            attemptId: a.id,
            attemptNo: a.attempt_no,
            playerName: a.player_name,
            results: a.results ?? [],
          };
    }
  }

  const url = `${await siteOrigin()}${playPath(quiz.code)}`;

  return (
    <PageShell look={quiz.look}>
      <PlayClient key={start.kind} quiz={quiz} start={start} url={url} />
    </PageShell>
  );
}
