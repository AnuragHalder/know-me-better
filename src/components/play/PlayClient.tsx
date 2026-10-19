"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Leaderboard, type LeaderboardRow } from "@/components/Leaderboard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ScoreGrid } from "@/components/ui/ScoreGrid";
import { Sheet } from "@/components/ui/Sheet";
import { Stamp } from "@/components/ui/Stamp";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, cleanName, nameProblem } from "@/lib/names";
import { fillName } from "@/lib/quiz/build";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { resultText, whatsappHref } from "@/lib/quiz/share";
import { verdict } from "@/lib/quiz/verdict";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { ensureGuestSession } from "@/lib/supabase/guest";

export interface PlayQuestion {
  position: number;
  /** Friend-facing wording with {name}. Never includes the answer. */
  prompt: string;
  options: string[];
}

export interface PlayQuiz {
  id: string;
  code: string;
  ownerName: string;
  questions: PlayQuestion[];
}

/** Where the visitor stands with this quiz, worked out on the server. */
export type PlayStart =
  | { kind: "new"; suggestedName: string }
  | { kind: "resume"; attemptId: string; playerName: string; results: boolean[] }
  | { kind: "finished"; playerName: string; results: boolean[] };

interface Reveal {
  picked: number;
  correct: number;
}

type Board = {
  total: number;
  my_rank: number | null;
  rows: { rank: number; player_name: string; score: number; results: boolean[]; is_me: boolean }[];
};

const NAME_KEY = "wkmb:player-name";
const ADVANCE_MS = 1600;

function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function PlayClient({
  quiz,
  start,
  url,
}: {
  quiz: PlayQuiz;
  start: PlayStart;
  url: string;
}) {
  const router = useRouter();
  const total = quiz.questions.length;

  const [stage, setStage] = useState<"intro" | "playing" | "done">(
    start.kind === "new" ? "intro" : start.kind === "resume" ? "playing" : "done",
  );
  const [name, setName] = useState(start.kind === "new" ? start.suggestedName : start.playerName);
  const [attemptId, setAttemptId] = useState(start.kind === "resume" ? start.attemptId : "");
  const [results, setResults] = useState<boolean[]>(start.kind === "new" ? [] : start.results);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<boolean[]>([]);

  useEffect(() => {
    if (start.kind === "new" && !start.suggestedName) {
      const saved = rememberedName();
      if (saved) setName(saved);
    }
  }, [start]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const index = results.length;
  const question = quiz.questions[Math.min(index, total - 1)];
  const owner = quiz.ownerName;

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    const playerName = cleanName(name);
    try {
      localStorage.setItem(NAME_KEY, playerName);
    } catch {
      // Private mode; the name just isn't remembered.
    }
    setBusy(true);
    setError("");
    try {
      await ensureGuestSession();
      const supabase = getBrowserSupabase();
      if (!supabase) throw new Error("not configured");
      const { data, error: rpcError } = await supabase.rpc("start_attempt", {
        p_code: quiz.code,
        p_player_name: playerName,
      });
      if (rpcError) {
        if (/already_played|own_quiz/.test(rpcError.message)) {
          router.refresh();
          return;
        }
        throw rpcError;
      }
      const { attempt_id, answered } = data as { attempt_id: string; answered: number };
      if (answered > 0) {
        // Resumed on another tab; the server page has the answers so far.
        router.refresh();
        return;
      }
      setAttemptId(attempt_id);
      setName(playerName);
      setStage("playing");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /anonymous/i.test(message)
          ? "Playing isn't switched on yet. Try again later."
          : quizErrorMessage(message),
      );
    } finally {
      setBusy(false);
    }
  }

  function next(nextResults: boolean[]) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setReveal(null);
    setResults(nextResults);
    if (nextResults.length >= total) setStage("done");
  }

  async function pick(choice: number) {
    if (busy || reveal) return;
    setBusy(true);
    setError("");
    const supabase = getBrowserSupabase();
    const { data, error: rpcError } = supabase
      ? await supabase.rpc("answer_question", { p_attempt_id: attemptId, p_choice: choice })
      : { data: null, error: new Error("not configured") };
    setBusy(false);
    if (rpcError || !data) {
      if (rpcError && /attempt_finished/.test(rpcError.message)) {
        router.refresh();
        return;
      }
      setError(quizErrorMessage(rpcError?.message));
      return;
    }
    const res = data as { correct_option: number; is_correct: boolean };
    const nextResults = [...results, res.is_correct];
    setReveal({ picked: choice, correct: res.correct_option });
    timer.current = setTimeout(() => next(nextResults), ADVANCE_MS);
    // Keep the pending results so "Next" can skip the wait.
    pendingRef.current = nextResults;
  }

  if (stage === "intro") {
    return (
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {total} questions · Code {quiz.code}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          How well do you know <span className="highlight">{owner}</span>?
        </h1>
        <p className="text-ink-soft">
          Guess what {owner} answered about themselves. One go only, so no peeking.
        </p>
        <form onSubmit={begin} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="player-name"
              className="text-xs font-bold tracking-widest text-ink-soft uppercase"
            >
              Your name on {owner}&apos;s leaderboard
            </label>
            <input
              id="player-name"
              type="text"
              autoComplete="given-name"
              maxLength={MAX_NAME_LENGTH}
              placeholder="e.g. Meera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 text-base text-ink placeholder:text-ink-soft/70"
            />
          </div>
          <p aria-live="polite" className="text-sm font-semibold text-bad empty:hidden">
            {error}
          </p>
          <div>
            <Button type="submit" variant="pink" disabled={busy}>
              {busy ? "Starting…" : "Start the quiz"}
            </Button>
          </div>
        </form>
      </Sheet>
    );
  }

  if (stage === "playing") {
    const correctText = reveal ? question.options[reveal.correct] : "";
    return (
      <Sheet ruled>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
            {owner}&apos;s quiz
          </span>
          <span className="font-mono text-sm text-ink-soft tabular-nums">
            {Math.min(index + 1, total)}/{total}
          </span>
        </div>
        <ScoreGrid answers={results} className="min-h-3.5" />
        <h1 className="font-hand text-3xl leading-tight font-bold" aria-live="polite">
          {fillName(question.prompt, owner)}
        </h1>
        <div
          role="group"
          aria-label="Options"
          className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2"
        >
          {question.options.map((option, o) => {
            const isCorrect = reveal?.correct === o;
            const isWrongPick = reveal && reveal.picked === o && !isCorrect;
            return (
              <button
                key={`${question.position}-${o}`}
                type="button"
                onClick={() => pick(o)}
                disabled={busy || Boolean(reveal)}
                aria-pressed={reveal?.picked === o}
                className={cn(
                  "min-h-14 rounded-xl border-2 px-3.5 py-2 text-left text-lg leading-snug font-semibold break-words transition-colors",
                  !reveal && "border-line bg-sheet text-ink hover:border-ink",
                  isCorrect && "border-good bg-good-bg text-ink",
                  isWrongPick && "border-bad bg-bad-bg text-ink",
                  reveal && !isCorrect && !isWrongPick && "border-line bg-sheet text-ink-soft",
                  "disabled:cursor-default",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
        <div className="flex min-h-12 items-center justify-between gap-3" aria-live="polite">
          {reveal ? (
            <>
              <p
                className={cn(
                  "font-bold",
                  reveal.picked === reveal.correct ? "text-good" : "text-bad",
                )}
              >
                {reveal.picked === reveal.correct
                  ? `Yes! ${owner} picked that.`
                  : `Nope. ${owner} picked “${correctText}”.`}
              </p>
              <Button size="sm" onClick={() => next(pendingRef.current)}>
                {index + 1 >= total ? "See score" : "Next"}
              </Button>
            </>
          ) : (
            <p className="text-sm font-semibold text-bad">{error}</p>
          )}
        </div>
      </Sheet>
    );
  }

  return <PlayResult quiz={quiz} name={name} results={results} url={url} />;
}

function PlayResult({
  quiz,
  name,
  results,
  url,
}: {
  quiz: PlayQuiz;
  name: string;
  results: boolean[];
  url: string;
}) {
  const score = results.filter(Boolean).length;
  const [loaded, setBoard] = useState<Board | "failed" | null>(null);
  const board = loaded === "failed" ? null : loaded;
  const [note, setNote] = useState("");
  const text = resultText(quiz.ownerName, results, url);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setBoard("failed");
      return;
    }
    supabase.rpc("get_leaderboard", { p_quiz_id: quiz.id }).then(
      ({ data }) => setBoard(data ? (data as Board) : "failed"),
      () => setBoard("failed"),
    );
  }, [quiz.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. Paste it in the group chat.");
    } catch {
      setNote("Copy didn't work here. Use WhatsApp instead.");
    }
  }

  const rows: LeaderboardRow[] =
    board?.rows.map((r) => ({
      id: `${r.rank}-${r.player_name}`,
      name: r.player_name,
      answers: r.results,
      isMe: r.is_me,
      rank: r.rank,
    })) ?? [];

  return (
    <>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {name}, you know {quiz.ownerName}
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="font-hand text-6xl leading-none font-bold tabular-nums">
            {score}
            <span className="text-3xl text-ink-soft">/{results.length}</span>
          </p>
          <Stamp className="text-2xl">{verdict(score, results.length)}</Stamp>
        </div>
        <ScoreGrid answers={results} />
        {board?.my_rank && (
          <p className="text-ink-soft">
            You&apos;re <b className="text-ink">#{board.my_rank}</b> of {board.total} on{" "}
            {quiz.ownerName}&apos;s leaderboard.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <a
            href={whatsappHref(text)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-good bg-good px-4 text-sm font-bold text-white no-underline dark:text-paper"
          >
            Share on WhatsApp
          </a>
          <Button variant="ghost" size="sm" onClick={copy}>
            Copy result
          </Button>
        </div>
        <p aria-live="polite" className="text-sm text-ink-soft empty:hidden">
          {note}
        </p>
      </Sheet>

      <Sheet>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Who knows {quiz.ownerName} best</h2>
          {board && (
            <span className="font-mono text-sm text-ink-soft tabular-nums">
              {board.total} played
            </span>
          )}
        </div>
        {board ? (
          <Leaderboard rows={rows} />
        ) : (
          <p className="py-2 text-ink-soft">
            {loaded === "failed"
              ? "The leaderboard didn't load. Reload the page to see it."
              : "Loading the leaderboard…"}
          </p>
        )}
      </Sheet>

      <Sheet ruled>
        <h2 className="font-hand text-3xl leading-tight font-bold">Now it&apos;s your turn</h2>
        <p className="text-ink-soft">
          Make your own page in 2 minutes and find out who really knows you.
        </p>
        <div>
          <ButtonLink href="/create" variant="pink">
            Make your own quiz
          </ButtonLink>
        </div>
      </Sheet>
    </>
  );
}
