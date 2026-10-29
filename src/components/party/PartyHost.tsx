"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, cleanName, nameProblem } from "@/lib/names";
import { GAMES, roomPath, type PartyGame } from "@/lib/party/room";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/** The host picks a game, then gets a room code to share. */
export function PartyHost({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [game, setGame] = useState<PartyGame>("fake_it");
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open(e: React.FormEvent) {
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
      ? await supabase.rpc("create_room", { p_game: game, p_host_name: cleanName(name) })
      : { data: null, error: new Error("not configured") };
    if (rpcError || !data) {
      setBusy(false);
      setError(quizErrorMessage(rpcError?.message));
      return;
    }
    router.push(roomPath((data as { code: string }).code));
  }

  return (
    <Sheet ruled>
      <span className="font-mono text-xs tracking-widest text-pink uppercase">
        New · Party room · Free
      </span>
      <h1 className="font-hand text-4xl leading-tight font-bold">Play live with your group</h1>
      <p className="text-lg text-ink-soft">
        Open a room, share the code, and everyone plays on their own phone at the same time. Up to 8
        players, no sign-up for friends.
      </p>
      <form onSubmit={open} className="flex flex-col gap-4" noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-bold tracking-widest text-ink-soft uppercase">
            Pick a game
          </legend>
          <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2">
            {(Object.keys(GAMES) as PartyGame[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={game === g}
                onClick={() => setGame(g)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                  game === g
                    ? "border-ink bg-ink text-sheet"
                    : "border-line bg-sheet text-ink hover:border-ink",
                )}
              >
                <span className="text-lg font-extrabold">{GAMES[g].title}</span>
                <span className={cn("text-sm", game === g ? "opacity-80" : "text-ink-soft")}>
                  {GAMES[g].blurb}
                </span>
                <span className={cn("text-xs", game === g ? "opacity-70" : "text-ink-soft")}>
                  {GAMES[g].min}+ players
                </span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="host-name"
            className="text-xs font-bold tracking-widest text-ink-soft uppercase"
          >
            Your name in the room
          </label>
          <input
            id="host-name"
            type="text"
            autoComplete="given-name"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 text-base text-ink"
          />
        </div>
        <p aria-live="polite" className="text-sm font-semibold text-bad empty:hidden">
          {error}
        </p>
        <div>
          <Button type="submit" variant="pink" disabled={busy}>
            {busy ? "Opening…" : "Open a room"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
