"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { KillerRound } from "@/components/party/KillerRound";
import {
  ANSWER_MAX,
  GAMES,
  formatClock,
  formatPoints,
  type RoomPlayer,
  type RoomView,
} from "@/lib/party/room";

interface RoundProps {
  view: RoomView;
  secondsLeft: number | null;
  busy: boolean;
  onAnswer: (text: string) => void;
  onVote: (index: number) => void;
  onNext: () => void;
  onKill?: (name: string) => void;
  onAccuse?: (name: string) => void;
  onSuspect?: (name: string | null) => void;
}

/** One round of Fake It or Same Brain, whichever phase it's in. */
export function PartyRound(props: RoundProps) {
  const { view, secondsLeft, busy, onAnswer, onVote, onNext } = props;
  if (view.game === "killer") {
    return (
      <KillerRound
        view={view}
        secondsLeft={secondsLeft}
        busy={busy}
        onKill={props.onKill ?? (() => {})}
        onAccuse={props.onAccuse ?? (() => {})}
        onSuspect={props.onSuspect ?? (() => {})}
        onNext={onNext}
      />
    );
  }
  const writing = view.phase === "write" || view.phase === "answer";
  return (
    <>
      <Sheet ruled>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
            {GAMES[view.game].title} · Round {view.round} of {view.total_rounds}
          </span>
          {secondsLeft !== null && view.phase !== "reveal" && (
            <span
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                secondsLeft <= 5 ? "text-bad" : "text-ink",
              )}
              aria-label={`${secondsLeft} seconds left`}
            >
              {formatClock(secondsLeft)}
            </span>
          )}
        </div>
        {view.game === "fake_it" && view.subject && (
          <span className="font-mono text-xs tracking-widest text-pink uppercase">
            About {view.is_subject ? "you" : view.subject}
          </span>
        )}
        <h1 className="text-2xl leading-snug font-extrabold">{view.prompt}</h1>

        {writing && <AnswerBox view={view} busy={busy} onAnswer={onAnswer} />}
        {view.phase === "vote" && <VoteBox view={view} busy={busy} onVote={onVote} />}
        {view.phase === "reveal" && view.game === "fake_it" && <FakeItResult view={view} />}
        {view.phase === "reveal" && view.game === "same_brain" && <SameBrainResult view={view} />}

        {view.phase === "reveal" && (
          <div className="flex flex-wrap items-center gap-3">
            {view.is_host ? (
              <Button variant="pink" onClick={onNext} disabled={busy}>
                {view.round >= view.total_rounds ? "See the awards" : "Next round"}
              </Button>
            ) : (
              <p className="text-sm text-ink-soft">
                {view.round >= view.total_rounds ? "Awards" : "Next round"} in {secondsLeft ?? 0}s,
                or when the host taps next.
              </p>
            )}
          </div>
        )}
      </Sheet>
      <Scoreboard players={view.players} showDone={view.phase !== "reveal"} />
    </>
  );
}

function AnswerBox({
  view,
  busy,
  onAnswer,
}: {
  view: RoomView;
  busy: boolean;
  onAnswer: (text: string) => void;
}) {
  const [text, setText] = useState(view.my_answer ?? "");
  const [editing, setEditing] = useState(!view.my_answer);
  // A new round clears the box.
  useEffect(() => {
    setText(view.my_answer ?? "");
    setEditing(!view.my_answer);
  }, [view.round, view.game_no, view.my_answer]);

  const help =
    view.game === "same_brain"
      ? "One or two words. Don't be clever: think what everyone else will think."
      : view.is_subject
        ? "This one's about you. Type the real answer. Friends will try to find it."
        : `Write a fake answer that sounds true enough to fool everyone. Short and boring beats funny.`;
  const label =
    view.game === "same_brain" ? "Your answer" : view.is_subject ? "The truth" : "Your fake answer";

  if (!editing && view.my_answer) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-paper p-4">
        <p className="text-sm text-ink-soft">Locked in</p>
        <p className="text-xl font-extrabold break-words">{view.my_answer}</p>
        <p className="text-sm text-ink-soft">Waiting for the others…</p>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Change it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAnswer(text.trim());
      }}
    >
      <label
        htmlFor="room-answer"
        className="text-xs font-bold tracking-widest text-ink-soft uppercase"
      >
        {label}
      </label>
      <input
        id="room-answer"
        type="text"
        autoComplete="off"
        maxLength={ANSWER_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-14 rounded-xl border-2 border-ink bg-sheet px-4 text-xl font-bold text-ink"
      />
      <p className="text-sm text-ink-soft">{help}</p>
      <div>
        <Button type="submit" variant="pink" disabled={busy || !text.trim()}>
          {view.game === "fake_it" && !view.is_subject ? "Submit my fake" : "Lock it in"}
        </Button>
      </div>
    </form>
  );
}

function VoteBox({
  view,
  busy,
  onVote,
}: {
  view: RoomView;
  busy: boolean;
  onVote: (index: number) => void;
}) {
  if (view.is_subject) {
    return (
      <p className="rounded-xl bg-paper p-4 text-ink-soft">
        Your friends are hunting for your answer. Sit tight.
      </p>
    );
  }
  if (view.wrote_truth) {
    return (
      <p className="rounded-xl bg-hi p-4 font-semibold text-on-hi">
        Spooky: your &ldquo;fake&rdquo; was the real answer. That counts as finding it.
      </p>
    );
  }
  if (view.my_vote_done) {
    return (
      <p className="rounded-xl bg-paper p-4 text-ink-soft">Vote in. Waiting for the others…</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold">Which one is real?</p>
      <div role="group" aria-label="Answers" className="flex flex-col gap-2">
        {(view.options ?? []).map((o) => (
          <button
            key={o.index}
            type="button"
            onClick={() => onVote(o.index)}
            disabled={busy || o.mine}
            className={cn(
              "flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 px-4 text-left text-lg font-bold break-words",
              o.mine
                ? "cursor-not-allowed border-dashed border-line bg-paper text-ink-soft"
                : "border-line bg-sheet text-ink hover:border-ink",
            )}
          >
            {o.text}
            {o.mine && <span className="shrink-0 text-xs font-semibold">your fake</span>}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-soft">
        +500 for finding the truth. +500 for every friend your fake fools.
      </p>
    </div>
  );
}

function FakeItResult({ view }: { view: RoomView }) {
  const r = view.reveal;
  if (!r) return null;
  if (r.skipped && !r.truth) {
    return (
      <p className="rounded-xl bg-paper p-4 text-ink-soft">
        {view.subject} didn&apos;t answer in time, so this round is skipped.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-xl border-2 border-ink bg-hi p-4 text-on-hi">
        <span className="text-xs font-bold tracking-widest uppercase">The truth</span>
        <span className="text-2xl font-extrabold break-words">{r.truth}</span>
        <span className="text-sm">
          {r.finders.length
            ? `Found by ${r.finders.join(", ")}`
            : `Nobody found it. ${view.subject} is hard to read.`}
        </span>
      </div>
      {r.fakes.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="The fakes">
          {r.fakes.map((f) => (
            <li
              key={f.text}
              className="flex flex-col gap-0.5 rounded-xl border border-line bg-sheet px-4 py-3"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-extrabold break-words">{f.text}</span>
                <span
                  className={cn(
                    "shrink-0 font-mono font-bold",
                    f.points ? "text-pink" : "text-ink-soft",
                  )}
                >
                  {f.points ? `+${formatPoints(f.points)}` : "0"}
                </span>
              </span>
              <span className="text-sm text-ink-soft">
                {f.mine ? "Your fake" : `${f.authors.join(" & ")}'s fake`} ·{" "}
                {f.fooled.length ? `fooled ${f.fooled.join(", ")}` : "fooled nobody"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SameBrainResult({ view }: { view: RoomView }) {
  const groups = view.reveal?.groups ?? [];
  if (groups.length === 0) {
    return <p className="rounded-xl bg-paper p-4 text-ink-soft">Nobody answered in time.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Answers">
      {groups.map((g) => (
        <li
          key={g.text}
          className={cn(
            "flex flex-col gap-0.5 rounded-xl px-4 py-3",
            g.n > 1 ? "border-2 border-ink bg-hi text-on-hi" : "border border-line bg-sheet",
          )}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-xl font-extrabold break-words">{g.text}</span>
            <span className="shrink-0 font-mono font-bold">×{g.n}</span>
          </span>
          <span className={cn("text-sm", g.n > 1 ? "" : "text-ink-soft")}>
            {g.names.join(", ")}
            {g.n > 1 ? ` · +${formatPoints(g.points)} each` : " · on their own"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Scoreboard({ players, showDone }: { players: RoomPlayer[]; showDone: boolean }) {
  return (
    <Sheet>
      <h2 className="text-sm font-bold tracking-widest text-ink-soft uppercase">Scores</h2>
      <ol className="flex flex-col">
        {players.map((p, i) => (
          <li
            key={p.name}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t border-line py-2 first:border-t-0"
          >
            <span className="font-mono font-bold text-ink-soft">{i + 1}</span>
            <span
              className={cn(
                "truncate font-semibold",
                p.is_me && "text-pink-ink",
                p.alive === false && "text-ink-soft line-through",
              )}
            >
              {p.name}
              {p.is_me && <small className="ml-1.5 font-medium text-ink-soft">you</small>}
              {showDone && (
                <small className={cn("ml-2 font-semibold", p.done ? "text-good" : "text-ink-soft")}>
                  {p.done ? "✓ in" : "…"}
                </small>
              )}
            </span>
            <span className="font-mono font-bold tabular-nums">{formatPoints(p.score)}</span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
