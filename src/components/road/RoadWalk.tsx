"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PathProgress } from "@/components/road/PathProgress";
import { RouteMap } from "@/components/road/RouteMap";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, cleanName, nameProblem } from "@/lib/names";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { endingFor, findEnding, type Story } from "@/lib/road/story";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * The creator walks the story: one choice per turn, then a look at their road and
 * where it ends, then save. Choices stay in the browser until saved.
 */
export function RoadWalk({ story, initialName }: { story: Story; initialName: string }) {
  const router = useRouter();
  const total = story.turns.length;
  const [picks, setPicks] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const index = picks.length;
  const reviewing = index >= total;

  function lock() {
    if (selected === null) return;
    setPicks([...picks, selected]);
    setSelected(null);
  }

  function back() {
    if (index === 0) return;
    setSelected(picks[index - 1]);
    setPicks(picks.slice(0, -1));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = nameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    const supabase = getBrowserSupabase();
    const { data, error: rpcError } = supabase
      ? await supabase.rpc("create_road", {
          p_story_id: story.id,
          p_owner_name: cleanName(name),
          p_choices: picks,
        })
      : { data: null, error: new Error("not configured") };
    if (rpcError || !data) {
      setBusy(false);
      setError(quizErrorMessage(rpcError?.message));
      return;
    }
    router.push(`/me/quiz/${(data as { id: string }).id}?new=1`);
  }

  if (reviewing) {
    const ending = findEnding(story, endingFor(story, picks));
    return (
      <>
        <Sheet ruled>
          <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
            Your road
          </span>
          <h1 className="font-hand text-4xl leading-tight font-bold">
            {ending ? (
              <>
                You ended up: <span className="highlight">{ending.title}</span>
              </>
            ) : (
              "That's your road"
            )}
          </h1>
          {ending && <p className="text-ink-soft">{ending.line}</p>}
          <RouteMap story={story} owner={picks} ownerName="You" />
        </Sheet>
        <Sheet>
          <form onSubmit={save} className="flex flex-col gap-3" noValidate>
            <p className="text-ink-soft">
              Friends walk the same story and guess every turn you took. Your choices stay hidden
              until they finish.
            </p>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="owner-name"
                className="text-xs font-bold tracking-widest text-ink-soft uppercase"
              >
                Your name, as friends know you
              </label>
              <input
                id="owner-name"
                type="text"
                autoComplete="given-name"
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. Raj"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 text-base text-ink placeholder:text-ink-soft/70"
              />
            </div>
            <p aria-live="polite" className="text-sm font-semibold text-bad empty:hidden">
              {error}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="pink" disabled={busy}>
                {busy ? "Saving…" : "Save and get my link"}
              </Button>
              <Button variant="ghost" onClick={back} disabled={busy}>
                Change the last turn
              </Button>
            </div>
          </form>
        </Sheet>
      </>
    );
  }

  const turn = story.turns[index];
  return (
    <Sheet ruled>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-xs font-bold tracking-widest text-ink-soft uppercase">
          {story.title}
        </span>
        <span className="shrink-0 font-mono text-sm text-ink-soft tabular-nums">
          {index + 1}/{total}
        </span>
      </div>
      <PathProgress total={total} current={index} tone="owner" />
      <span className="font-mono text-xs tracking-widest text-pink uppercase">{turn.place}</span>
      <p className="text-xl leading-snug font-semibold" aria-live="polite">
        {turn.scene_self}
      </p>
      <h1 className="text-lg text-ink-soft">{turn.ask_self}</h1>
      <div role="group" aria-label="Choices" className="flex flex-col gap-2">
        {turn.options.map((option, o) => (
          <button
            key={`${index}-${o}`}
            type="button"
            aria-pressed={selected === o}
            onClick={() => setSelected(o)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border-2 px-3.5 py-2 text-left text-lg leading-snug font-semibold transition-colors",
              selected === o
                ? "border-pink bg-pink text-white dark:text-paper"
                : "border-line bg-sheet text-ink hover:border-ink",
            )}
          >
            <span aria-hidden="true" className="font-mono text-sm opacity-70">
              {String.fromCharCode(65 + o)}
            </span>
            {option.text}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-soft">
        Only you see this. Friends will have to guess which way you went.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ink" onClick={lock} disabled={selected === null}>
          {index + 1 === total ? "Lock it and see my road" : "Lock my choice"}
        </Button>
        {index > 0 && (
          <Button variant="ghost" onClick={back}>
            Back
          </Button>
        )}
      </div>
    </Sheet>
  );
}
