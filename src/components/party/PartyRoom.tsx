"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PartyRound, Scoreboard } from "@/components/party/PartyRound";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, cleanName, nameProblem } from "@/lib/names";
import {
  GAMES,
  awardsText,
  formatPoints,
  roomInviteText,
  type PartyGame,
  type RoomPreview,
  type RoomView,
} from "@/lib/party/room";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { whatsappHref } from "@/lib/quiz/share";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { ensureGuestSession } from "@/lib/supabase/guest";

const POLL_MS = 1500;
const NAME_KEY = "wkmb:player-name";

/**
 * A live party room. Polls the room every 1.5 s while the tab is visible; the
 * database moves the game on, so every phone shows the same thing.
 */
export function PartyRoom({
  preview,
  url,
  suggestedName,
}: {
  preview: RoomPreview;
  url: string;
  suggestedName: string;
}) {
  const [joined, setJoined] = useState(preview.joined);
  const [view, setView] = useState<RoomView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadline = useRef<number | null>(null);

  const show = useCallback((next: RoomView) => {
    setView(next);
    deadline.current = next.seconds_left === null ? null : Date.now() + next.seconds_left * 1000;
    setSecondsLeft(next.seconds_left);
  }, []);

  // Poll while joined.
  useEffect(() => {
    if (!joined) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        const { data, error: rpcError } = await supabase!.rpc("room_state", {
          p_code: preview.code,
        });
        if (stopped) return;
        if (data) show(data as RoomView);
        else if (rpcError && /not_in_room/.test(rpcError.message)) setJoined(false);
      }
      timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [joined, preview.code, show]);

  // Count the timer down between polls.
  useEffect(() => {
    const id = setInterval(() => {
      if (deadline.current !== null) {
        setSecondsLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  async function act(fn: string, args: Record<string, unknown>) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(fn, { p_code: preview.code, ...args });
    setBusy(false);
    if (rpcError || !data) {
      setError(quizErrorMessage(rpcError?.message));
      return;
    }
    show(data as RoomView);
  }

  if (!joined) {
    return (
      <JoinCard preview={preview} suggestedName={suggestedName} onJoined={() => setJoined(true)} />
    );
  }

  if (!view) {
    return (
      <Sheet>
        <p className="text-ink-soft">Getting the room…</p>
      </Sheet>
    );
  }

  const errorLine = error && (
    <p role="alert" className="text-sm font-semibold text-bad">
      {error}
    </p>
  );

  if (view.status === "playing") {
    return (
      <>
        {errorLine}
        <PartyRound
          view={view}
          secondsLeft={secondsLeft}
          busy={busy}
          onAnswer={(text) => act("submit_room_answer", { p_text: text })}
          onVote={(index) => act("submit_room_vote", { p_index: index })}
          onNext={() => act("next_room_round", {})}
          onKill={(name) => act("killer_kill", { p_target: name })}
          onAccuse={(name) => act("killer_accuse", { p_target: name })}
          onSuspect={(name) => act("killer_suspect", { p_target: name })}
        />
      </>
    );
  }

  if (view.status === "done") {
    return (
      <>
        <Awards view={view} url={url} />
        {errorLine}
        <HostControls
          view={view}
          busy={busy}
          start={(game) => act("start_room", { p_game: game })}
          again
        />
        <Sheet ruled>
          <h2 className="font-hand text-3xl leading-tight font-bold">Keep it going</h2>
          <p className="text-ink-soft">
            Find out who really knows you: make a quiz or walk a story and send it to the group.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/create" variant="ghost" size="sm">
              Make a quiz
            </ButtonLink>
            <ButtonLink href="/road" variant="ghost" size="sm">
              Walk a story
            </ButtonLink>
            {!view.is_host && (
              <ButtonLink href="/party" variant="ghost" size="sm">
                Host your own room
              </ButtonLink>
            )}
          </div>
        </Sheet>
      </>
    );
  }

  return <Lobby view={view} url={url} busy={busy} error={errorLine} act={act} />;
}

function JoinCard({
  preview,
  suggestedName,
  onJoined,
}: {
  preview: RoomPreview;
  suggestedName: string;
  onJoined: () => void;
}) {
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (suggestedName) return;
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setName(saved);
    } catch {
      // Private mode.
    }
  }, [suggestedName]);

  const closed = preview.status !== "lobby";
  const full = preview.players >= preview.max_players;

  async function join(e: React.FormEvent) {
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
      // Private mode.
    }
    setBusy(true);
    setError("");
    try {
      await ensureGuestSession();
      const supabase = getBrowserSupabase();
      if (!supabase) throw new Error("not configured");
      const { error: rpcError } = await supabase.rpc("join_room", {
        p_code: preview.code,
        p_name: playerName,
      });
      if (rpcError) throw rpcError;
      onJoined();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /anonymous/i.test(message)
          ? "Joining isn't switched on yet. Try again later."
          : quizErrorMessage(message),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet ruled>
      <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
        Party room · Code {preview.code}
      </span>
      <h1 className="font-hand text-4xl leading-tight font-bold">
        {preview.host_name} invited you to{" "}
        <span className="highlight">{GAMES[preview.game].title}</span>
      </h1>
      <p className="text-ink-soft">{GAMES[preview.game].blurb}</p>
      {closed || full ? (
        <p className="font-semibold text-bad">
          {closed
            ? "This game has already started. Ask the host to start a new one."
            : "This room is full. Free rooms hold 8 players."}
        </p>
      ) : (
        <form onSubmit={join} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="player-name"
              className="text-xs font-bold tracking-widest text-ink-soft uppercase"
            >
              Your name in the room
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
              {busy ? "Joining…" : "Join the room"}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function Lobby({
  view,
  url,
  busy,
  error,
  act,
}: {
  view: RoomView;
  url: string;
  busy: boolean;
  error: React.ReactNode;
  act: (fn: string, args: Record<string, unknown>) => void;
}) {
  const invite = roomInviteText(view.game, url, view.code);
  return (
    <>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          Party room · {GAMES[view.game].title}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          {view.is_host ? "Get your friends in" : "You're in! Waiting for the host"}
        </h1>
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-ink bg-sheet p-4">
          <span className="text-sm text-ink-soft">Friends join with code</span>
          <span
            className="font-mono text-4xl font-bold tracking-[0.18em]"
            aria-label={`Code ${view.code.split("").join(" ")}`}
          >
            {view.code}
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            <a
              href={whatsappHref(invite)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-good bg-good px-4 text-sm font-bold text-white no-underline dark:text-paper"
            >
              Send on WhatsApp
            </a>
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">In the room</h2>
          <span className="font-mono text-sm text-ink-soft">
            {view.players.length} / {view.max_players} free
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {view.players.map((p) => (
            <li key={p.name} className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-hi text-sm font-extrabold text-on-hi"
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              {p.name}
              {p.is_host && <small className="font-medium text-ink-soft">host</small>}
              {p.is_me && <small className="font-medium text-ink-soft">you</small>}
            </li>
          ))}
        </ul>
        {view.players.length >= view.max_players && (
          <p className="text-sm text-ink-soft">
            Room full. Bigger rooms with the Party pass are coming soon.
          </p>
        )}
      </Sheet>
      {error}
      <HostControls view={view} busy={busy} start={(game) => act("start_room", { p_game: game })} />
    </>
  );
}

/** The host picks the game and starts; everyone else waits. */
function HostControls({
  view,
  busy,
  start,
  again = false,
}: {
  view: RoomView;
  busy: boolean;
  start: (game: PartyGame) => void;
  again?: boolean;
}) {
  const [game, setGame] = useState<PartyGame>(view.game);
  if (!view.is_host) {
    return (
      <Sheet>
        <p className="text-ink-soft">
          {again
            ? "The host can start another game. Stay here."
            : "The game starts when the host is ready."}
        </p>
      </Sheet>
    );
  }
  const min = GAMES[game].min;
  const enough = view.players.length >= min;
  return (
    <Sheet>
      <h2 className="font-bold">{again ? "Play again" : "Game"}</h2>
      <div role="group" aria-label="Game" className="flex flex-wrap gap-2">
        {(Object.keys(GAMES) as PartyGame[]).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={game === g}
            onClick={() => setGame(g)}
            className={cn(
              "min-h-11 rounded-full border-2 px-4 text-sm font-bold",
              game === g ? "border-ink bg-ink text-sheet" : "border-line bg-sheet text-ink",
            )}
          >
            {GAMES[g].title}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="pink" onClick={() => start(game)} disabled={busy || !enough}>
          Start {GAMES[game].title} · {view.players.length} players
        </Button>
        {!enough && (
          <span className="text-sm text-ink-soft">
            {GAMES[game].title} needs at least {min} players.
          </span>
        )}
      </div>
    </Sheet>
  );
}

function Awards({ view, url }: { view: RoomView; url: string }) {
  const winner = view.players[0];
  const text = awardsText(view, url);
  return (
    <>
      <section
        aria-label="Group awards"
        className="flex flex-col gap-4 rounded-(--sheet-radius) bg-ink p-5 text-sheet"
      >
        <span className="text-xs font-bold tracking-widest text-hi uppercase">
          {GAMES[view.game].title} · The group awards
        </span>
        {winner && (
          <div className="flex flex-col gap-0.5 rounded-xl bg-hi p-4 text-on-hi">
            <span className="text-xs font-bold tracking-widest uppercase">Winner</span>
            <span className="text-2xl font-extrabold">{winner.name}</span>
            <span className="text-sm">{formatPoints(winner.score)} points</span>
          </div>
        )}
        <ul className="flex flex-col gap-3">
          {(view.awards ?? []).map((a) => (
            <li
              key={a.title}
              className="flex flex-col gap-0.5 border-b border-sheet/20 pb-3 last:border-b-0"
            >
              <span className="text-sm opacity-75">{a.title}</span>
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-lg font-extrabold break-words">{a.name}</span>
                <span className="font-mono text-sm text-hi">{a.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <a
          href={whatsappHref(text)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-good bg-good px-4 font-bold text-white no-underline"
        >
          Share the awards on WhatsApp
        </a>
      </section>
      <Scoreboard players={view.players} showDone={false} />
    </>
  );
}
