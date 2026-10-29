"use client";

import { useEffect, useRef, useState } from "react";
import { Scoreboard } from "@/components/party/PartyRound";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import {
  ROLE_INFO,
  formatClock,
  formatPoints,
  killerOutcome,
  type KillerRole,
  type RoomView,
} from "@/lib/party/room";

interface KillerRoundProps {
  view: RoomView;
  secondsLeft: number | null;
  busy: boolean;
  onKill: (name: string) => void;
  onAccuse: (name: string) => void;
  onSuspect: (name: string | null) => void;
  onNext: () => void;
}

const ROLE_LABEL: Record<KillerRole, string> = {
  killer: "Killer",
  police: "Police",
  villager: "Villager",
};

/**
 * One Killer round. The role card stays covered until the player shows it, so a
 * friend glancing at the phone across the table learns nothing.
 */
export function KillerRound(props: KillerRoundProps) {
  const { view, secondsLeft, busy, onNext } = props;
  const k = view.killer;
  if (!k) return null;
  const night = view.phase === "night";

  return (
    <>
      <Sheet ruled>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
            Killer · Round {view.round} of {view.total_rounds}
          </span>
          {night && secondsLeft !== null && (
            <span
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                secondsLeft <= 20 ? "text-bad" : "text-ink",
              )}
              aria-label={`${secondsLeft} seconds left`}
            >
              {formatClock(secondsLeft)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-extrabold">
            {night
              ? "Someone here is the killer"
              : k.result?.winner === "killer"
                ? "The killer wins"
                : "The village wins"}
          </h1>
          <span className="font-mono text-sm font-bold text-ink-soft">
            Kills {k.kills} of {k.kills_needed}
          </span>
        </div>

        {k.deaths.length > 0 && (
          <ul aria-label="Killed" className="flex flex-col gap-1">
            {k.deaths.map((d) => (
              <li key={d.name} className="font-semibold text-bad">
                {d.name} was killed{" "}
                <span className="font-normal text-ink-soft">at {formatClock(d.after_seconds)}</span>
              </li>
            ))}
          </ul>
        )}

        {night ? <Night {...props} /> : <Result view={view} />}

        {!night && (
          <div className="flex flex-wrap items-center gap-3">
            {view.is_host ? (
              <Button variant="pink" onClick={onNext} disabled={busy}>
                {view.round >= view.total_rounds ? "See the awards" : "Deal new roles"}
              </Button>
            ) : (
              <p className="text-sm text-ink-soft">
                New roles in {secondsLeft ?? 0}s, or when the host deals.
              </p>
            )}
          </div>
        )}
      </Sheet>
      <Scoreboard players={view.players} showDone={false} />
    </>
  );
}

function Night({ view, busy, onKill, onAccuse, onSuspect }: KillerRoundProps) {
  const k = view.killer!;
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [readyIn, setReadyIn] = useState(k.kill_ready_in ?? 0);
  const readyAt = useRef(0);

  // Cover the card and clear any pick when a new round is dealt.
  useEffect(() => {
    setShown(false);
    setPicked(null);
  }, [view.round, view.game_no]);

  useEffect(() => {
    readyAt.current = Date.now() + (k.kill_ready_in ?? 0) * 1000;
    setReadyIn(k.kill_ready_in ?? 0);
    const id = setInterval(
      () => setReadyIn(Math.max(0, Math.ceil((readyAt.current - Date.now()) / 1000))),
      250,
    );
    return () => clearInterval(id);
  }, [k.kill_ready_in]);

  if (!k.role) return null;
  const others = view.players.filter((p) => !p.is_me && p.alive !== false);
  const info = ROLE_INFO[k.role];

  if (!shown) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-ink-soft bg-paper p-6 text-center">
        <p className="font-semibold">Your role is hidden.</p>
        <p className="text-sm text-ink-soft">Keep your screen to yourself, then take a look.</p>
        <Button variant="ink" onClick={() => setShown(true)}>
          Show my role
        </Button>
      </div>
    );
  }

  if (!k.alive) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-bad-bg p-4">
        <p className="text-lg font-extrabold">You were killed.</p>
        <p className="text-sm">
          Stay quiet and don&apos;t give it away. Watch how the rest of the round plays out.
        </p>
        <HideButton onHide={() => setShown(false)} />
      </div>
    );
  }

  const suspectCount = (name: string) => k.suspects?.find((s) => s.name === name)?.count ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex flex-col gap-1 rounded-xl p-4",
          k.role === "killer"
            ? "bg-ink text-sheet"
            : k.role === "police"
              ? "bg-pink text-white dark:text-paper"
              : "border-2 border-ink bg-hi text-on-hi",
        )}
      >
        <span className="text-xs font-bold tracking-widest uppercase opacity-80">
          {ROLE_LABEL[k.role]}
        </span>
        <span className="text-2xl font-extrabold">{info.title}</span>
        <span className="text-sm opacity-90">{info.goal}</span>
      </div>

      <div role="group" aria-label="Players" className="flex flex-col gap-2">
        {others.map((p) => {
          const active = k.role === "villager" ? k.my_suspect === p.name : picked === p.name;
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() =>
                k.role === "villager"
                  ? onSuspect(active ? null : p.name)
                  : setPicked(active ? null : p.name)
              }
              className={cn(
                "flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 px-4 text-left font-bold",
                active
                  ? "border-ink bg-ink text-sheet"
                  : "border-line bg-sheet text-ink hover:border-ink",
              )}
            >
              {p.name}
              {k.role === "police" && suspectCount(p.name) > 0 && (
                <span className="shrink-0 text-sm font-semibold opacity-80">
                  suspected by {suspectCount(p.name)}
                </span>
              )}
              {k.role === "villager" && active && (
                <span className="shrink-0 text-sm font-semibold opacity-80">your suspect</span>
              )}
            </button>
          );
        })}
      </div>

      {k.role === "killer" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ink"
            disabled={busy || !picked || readyIn > 0}
            onClick={() => picked && onKill(picked)}
          >
            {readyIn > 0 ? `Next kill in ${readyIn}s` : picked ? `Kill ${picked}` : "Pick a victim"}
          </Button>
          <span className="text-sm text-ink-soft">
            {k.kills_needed - k.kills} more to win. Pick the police and you&apos;re caught.
          </span>
        </div>
      )}
      {k.role === "police" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="pink"
            disabled={busy || !picked}
            onClick={() => picked && onAccuse(picked)}
          >
            {picked ? `Accuse ${picked}` : "Pick who to accuse"}
          </Button>
          <span className="text-sm text-ink-soft">One shot. Wrong, and the killer wins.</span>
        </div>
      )}
      {k.role === "villager" && (
        <p className="text-sm text-ink-soft">
          {k.my_suspect
            ? `You suspect ${k.my_suspect}. Tap again to clear.`
            : "Tap who you suspect. Only the police sees how many suspect each person."}
        </p>
      )}
      <HideButton onHide={() => setShown(false)} />
    </div>
  );
}

function HideButton({ onHide }: { onHide: () => void }) {
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onHide}>
        Hide my role
      </Button>
    </div>
  );
}

function Result({ view }: { view: RoomView }) {
  const result = view.killer?.result;
  if (!result) return null;
  return (
    <div className="flex flex-col gap-3">
      <p
        className={cn(
          "rounded-xl p-4 text-lg font-bold",
          result.winner === "killer" ? "bg-ink text-sheet" : "border-2 border-ink bg-hi text-on-hi",
        )}
      >
        {killerOutcome(result)}
      </p>
      <ul aria-label="Roles" className="flex flex-col gap-2">
        {result.roles.map((r) => (
          <li
            key={r.name}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sheet px-4 py-2.5"
          >
            <span className="flex flex-col">
              <span className={cn("font-bold", !r.alive && "text-ink-soft line-through")}>
                {r.name}
                {r.is_me && <small className="ml-1.5 font-medium text-ink-soft">you</small>}
              </span>
              <span className="text-sm text-ink-soft">
                {ROLE_LABEL[r.role]}
                {r.suspect && ` · suspected ${r.suspect}`}
              </span>
            </span>
            <span className={cn("font-mono font-bold", r.points ? "text-pink" : "text-ink-soft")}>
              {r.points ? `+${formatPoints(r.points)}` : "0"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
