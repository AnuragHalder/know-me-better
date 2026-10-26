"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PathProgress } from "@/components/road/PathProgress";
import { RoadReveal } from "@/components/road/RoadReveal";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, cleanName, nameProblem } from "@/lib/names";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { forFriend, type Story } from "@/lib/road/story";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { ensureGuestSession } from "@/lib/supabase/guest";

export interface RoadQuiz {
  id: string;
  code: string;
  ownerName: string;
  story: Story;
}

/** Where the visitor stands with this road, worked out on the server. */
export type RoadStart =
  | { kind: "new"; suggestedName: string }
  | { kind: "resume"; attemptId: string; playerName: string; results: boolean[] }
  | { kind: "finished"; playerName: string; results: boolean[] };

const NAME_KEY = "wkmb:player-name";

/**
 * A friend walks the creator's road, guessing each turn. After each guess they learn
 * only "together" or "split"; the creator's path shows once they finish.
 */
export function RoadPlay({ road, start, url }: { road: RoadQuiz; start: RoadStart; url: string }) {
  const router = useRouter();
  const { story, ownerName: owner } = road;
  const total = story.turns.length;

  const [stage, setStage] = useState<"intro" | "walking" | "done">(
    start.kind === "new" ? "intro" : start.kind === "resume" ? "walking" : "done",
  );
  const [name, setName] = useState(start.kind === "new" ? start.suggestedName : start.playerName);
  const [attemptId, setAttemptId] = useState(start.kind === "resume" ? start.attemptId : "");
  const [results, setResults] = useState<boolean[]>(start.kind === "new" ? [] : start.results);
  const [answer, setAnswer] = useState<{ picked: number; together: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (start.kind === "new" && !start.suggestedName) {
      try {
        const saved = localStorage.getItem(NAME_KEY);
        if (saved) setName(saved);
      } catch {
        // Private mode.
      }
    }
  }, [start]);

  const index = results.length;
  const turn = story.turns[Math.min(index, total - 1)];

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
        p_code: road.code,
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
        router.refresh();
        return;
      }
      setAttemptId(attempt_id);
      setName(playerName);
      setResults([]);
      setStage("walking");
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

  async function pick(choice: number) {
    if (busy || answer) return;
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
    setAnswer({ picked: choice, together: (data as { is_correct: boolean }).is_correct });
  }

  function next() {
    if (!answer) return;
    const nextResults = [...results, answer.together];
    setAnswer(null);
    setResults(nextResults);
    if (nextResults.length >= total) setStage("done");
  }

  if (stage === "intro") {
    return (
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {owner}&apos;s road · {total} turns · Code {road.code}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          Can you guess every turn <span className="highlight">{owner}</span> took?
        </h1>
        <p className="text-ink-soft">
          {owner} played &ldquo;{story.title}&rdquo; and made {total} choices. Walk the same story
          and guess each one. You&apos;ll see where {owner} really went at the end.
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
              {busy ? "Starting…" : "Start walking"}
            </Button>
          </div>
        </form>
      </Sheet>
    );
  }

  if (stage === "walking") {
    const together = results.filter(Boolean).length;
    return (
      <Sheet ruled>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-xs font-bold tracking-widest text-ink-soft uppercase">
            {owner}&apos;s road · {name}
          </span>
          <span className="shrink-0 font-mono text-sm text-ink-soft tabular-nums">
            {index + 1}/{total}
          </span>
        </div>
        <PathProgress total={total} current={index} results={results} tone="friend" />
        {index > 0 && (
          <p className="text-sm text-ink-soft">
            {together} of {index} together so far.
          </p>
        )}
        <span className="font-mono text-xs tracking-widest text-pink uppercase">{turn.place}</span>
        <p className="text-xl leading-snug font-semibold">{forFriend(turn.scene_other, owner)}</p>
        <h1 className="text-lg text-ink-soft">{forFriend(turn.ask_other, owner)}</h1>
        <div role="group" aria-label="Choices" className="flex flex-col gap-2">
          {turn.options.map((option, o) => {
            const isPicked = answer?.picked === o;
            return (
              <button
                key={`${index}-${o}`}
                type="button"
                aria-pressed={isPicked}
                onClick={() => pick(o)}
                disabled={busy || Boolean(answer)}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border-2 px-3.5 py-2 text-left text-lg leading-snug font-semibold transition-colors disabled:cursor-default",
                  isPicked
                    ? "border-ink bg-hi text-on-hi"
                    : answer
                      ? "border-line bg-sheet text-ink-soft"
                      : "border-line bg-sheet text-ink hover:border-ink",
                )}
              >
                <span aria-hidden="true" className="font-mono text-sm opacity-70">
                  {String.fromCharCode(65 + o)}
                </span>
                {option.text}
              </button>
            );
          })}
        </div>
        <div aria-live="polite" className="flex flex-col gap-3">
          {answer ? (
            <>
              <div className="rounded-xl bg-ink p-4 text-sheet">
                <p className="font-bold">
                  {answer.together ? `Same turn as ${owner}.` : `${owner} went another way.`}
                </p>
                <p className="text-sm opacity-80">
                  {answer.together
                    ? "Still walking together."
                    : `Your roads split here. Where ${owner} went stays hidden till the end.`}
                </p>
              </div>
              <div>
                <Button onClick={next}>
                  {index + 1 >= total ? "See where we ended up" : "Next turn"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-bad empty:hidden">{error}</p>
          )}
        </div>
      </Sheet>
    );
  }

  return <RoadReveal road={road} playerName={name} results={results} url={url} />;
}
