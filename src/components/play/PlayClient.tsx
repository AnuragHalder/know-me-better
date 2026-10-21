"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LiveLeaderboard } from "@/components/LiveLeaderboard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ScoreGrid } from "@/components/ui/ScoreGrid";
import { Sheet } from "@/components/ui/Sheet";
import { Stamp } from "@/components/ui/Stamp";
import { StickyNote } from "@/components/ui/StickyNote";
import { cn } from "@/lib/cn";
import type { Board } from "@/lib/quiz/board";
import { MAX_NAME_LENGTH, cleanName, nameProblem } from "@/lib/names";
import { formatRupees, PRODUCTS } from "@/lib/pricing";
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
  /** The creator paid to turn off second chances. */
  retriesLocked?: boolean;
  questions: PlayQuestion[];
}

/**
 * Second round for a friend who finished: "offer" (they can buy one), "ready"
 * (paid, not played yet), "used" (already had their second round) or "locked"
 * (the creator turned retries off).
 */
export type Retry = "offer" | "ready" | "used" | "locked";

/** Where the visitor stands with this quiz, worked out on the server. */
export type PlayStart =
  | { kind: "new"; suggestedName: string }
  | { kind: "resume"; attemptId: string; attemptNo: number; playerName: string; results: boolean[] }
  | { kind: "finished"; playerName: string; results: boolean[]; retry: Retry };

/** The friend's guess and whether it matched. The owner's answer is never sent. */
interface Reveal {
  picked: number;
  correct: boolean;
}

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
  const [attemptNo, setAttemptNo] = useState(start.kind === "resume" ? start.attemptNo : 1);
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

  async function begin(e?: React.FormEvent) {
    e?.preventDefault();
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
      const { attempt_id, answered, attempt_no } = data as {
        attempt_id: string;
        answered: number;
        attempt_no: number;
      };
      if (answered > 0) {
        // Resumed on another tab; the server page has the answers so far.
        router.refresh();
        return;
      }
      setAttemptId(attempt_id);
      setAttemptNo(attempt_no ?? 1);
      setName(playerName);
      setResults([]);
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
    const res = data as { is_correct: boolean };
    const nextResults = [...results, res.is_correct];
    setReveal({ picked: choice, correct: res.is_correct });
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
          Guess what {owner} answered about themselves. You&apos;ll see right or wrong after each
          guess, never {owner}&apos;s answer.
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
            const isPicked = reveal?.picked === o;
            const isCorrect = isPicked && reveal?.correct;
            const isWrongPick = isPicked && !reveal?.correct;
            return (
              <button
                key={`${question.position}-${o}`}
                type="button"
                onClick={() => pick(o)}
                disabled={busy || Boolean(reveal)}
                aria-pressed={isPicked}
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
              <p className={cn("font-bold", reveal.correct ? "text-good" : "text-bad")}>
                {reveal.correct
                  ? `Yes! ${owner} picked that.`
                  : `Not quite. That's not ${owner}'s answer.`}
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

  const retry: Retry =
    start.kind === "finished" && results === start.results
      ? start.retry
      : attemptNo >= 2
        ? "used"
        : quiz.retriesLocked
          ? "locked"
          : "offer";

  return (
    <PlayResult
      quiz={quiz}
      name={name}
      results={results}
      url={url}
      retry={retry}
      onPlayAgain={() => begin()}
      busy={busy}
      error={error}
    />
  );
}

function PlayResult({
  quiz,
  name,
  results,
  url,
  retry,
  onPlayAgain,
  busy,
  error,
}: {
  quiz: PlayQuiz;
  name: string;
  results: boolean[];
  url: string;
  retry: Retry;
  onPlayAgain: () => void;
  busy: boolean;
  error: string;
}) {
  const score = results.filter(Boolean).length;
  const [board, setBoard] = useState<Board | null>(null);
  const [note, setNote] = useState("");
  const text = resultText(quiz.ownerName, results, url);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. Paste it in the group chat.");
    } catch {
      setNote("Copy didn't work here. Use WhatsApp instead.");
    }
  }

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

      {(retry === "offer" || retry === "ready") && (
        <SecondChance
          ownerName={quiz.ownerName}
          ready={retry === "ready"}
          onPlayAgain={onPlayAgain}
          busy={busy}
          error={error}
        />
      )}

      <Sheet>
        <LiveLeaderboard
          quizId={quiz.id}
          title={`Who knows ${quiz.ownerName} best`}
          ownerName={quiz.ownerName}
          viewer="friend"
          onBoard={setBoard}
        />
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

const SECOND_CHANCE = PRODUCTS.find((p) => p.id === "second_chance");

/** "Try again": replay all questions; the best round counts on the leaderboard. */
function SecondChance({
  ownerName,
  ready,
  onPlayAgain,
  busy,
  error,
}: {
  ownerName: string;
  ready: boolean;
  onPlayAgain: () => void;
  busy: boolean;
  error: string;
}) {
  const price = SECOND_CHANCE ? formatRupees(SECOND_CHANCE.amountPaise) : "";
  return (
    <StickyNote>
      <h2 className="font-hand text-2xl leading-tight font-bold">Think you can do better?</h2>
      <p className="text-sm text-on-note-soft">
        Play all the questions again. Your best score counts on {ownerName}&apos;s leaderboard.
      </p>
      {ready ? (
        <div>
          <button
            type="button"
            onClick={onPlayAgain}
            disabled={busy}
            className="min-h-11 rounded-full border-2 border-on-note bg-on-note px-4 text-sm font-bold text-note disabled:opacity-50"
          >
            {busy ? "Starting…" : "Play again"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            className="min-h-11 rounded-full border-2 border-on-note bg-on-note px-4 text-sm font-bold text-note disabled:cursor-not-allowed disabled:opacity-60"
          >
            Try again for {price}
          </button>
          <span className="text-xs font-semibold text-on-note-soft">Payments open soon</span>
        </div>
      )}
      <p aria-live="polite" className="text-sm font-semibold empty:hidden">
        {error}
      </p>
    </StickyNote>
  );
}
