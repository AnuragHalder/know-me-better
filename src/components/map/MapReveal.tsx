"use client";

import { useEffect, useState } from "react";
import { MapView } from "@/components/map/MapView";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { fillName } from "@/lib/quiz/build";
import { formatKm, type MapScope } from "@/lib/map/geo";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { getBrowserSupabase } from "@/lib/supabase/browser";

interface RevealItem {
  position: number;
  prompt: string;
  scope: MapScope;
  label: string;
  lat: number;
  lng: number;
  guess_lat: number | null;
  guess_lng: number | null;
  distance_km: number | null;
}

type RevealState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "locked"; maps: number }
  | { kind: "open"; items: RevealItem[] };

interface MapRevealProps {
  quizId: string;
  ownerName: string;
  /** A paid second round is waiting: don't offer to give it up. */
  retryReady: boolean;
  /** Called once the friend chooses to see the places (their retry is gone). */
  onRevealed: () => void;
}

/**
 * Where the creator's map answers really were. Shown once the friend can't play
 * again; before that they can choose to see it, giving up their second round.
 */
export function MapReveal({ quizId, ownerName, retryReady, onRevealed }: MapRevealProps) {
  const [state, setState] = useState<RevealState>({ kind: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function apply(data: unknown) {
    const d = data as { allowed: boolean; maps?: number; items?: RevealItem[] };
    if (d.allowed) setState({ kind: "open", items: d.items ?? [] });
    else setState({ kind: "locked", maps: d.maps ?? 1 });
  }

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setState({ kind: "error", message: "The map reveal isn't available right now." });
      return;
    }
    supabase.rpc("get_my_map_reveal", { p_quiz_id: quizId }).then(({ data, error }) => {
      if (error || !data) setState({ kind: "error", message: quizErrorMessage(error?.message) });
      else apply(data);
    });
  }, [quizId]);

  async function revealNow() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reveal_my_map", { p_quiz_id: quizId });
    setBusy(false);
    if (error || !data) {
      setState({ kind: "error", message: quizErrorMessage(error?.message) });
      return;
    }
    apply(data);
    onRevealed();
  }

  if (state.kind === "loading") return null;
  if (state.kind === "error") {
    return (
      <Sheet>
        <p className="text-ink-soft">{state.message}</p>
      </Sheet>
    );
  }

  if (state.kind === "locked") {
    return (
      <Sheet>
        <h2 className="font-bold">Map reveal</h2>
        <p className="text-ink-soft">
          {retryReady
            ? "Play your second round first. The real spots show after it."
            : `Where ${ownerName}'s ${state.maps === 1 ? "place really is" : "places really are"} shows after your last round.`}
        </p>
        {!retryReady &&
          (confirming ? (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-ink p-3">
              <p className="text-sm font-semibold">
                Seeing it now ends your chance to try again. Sure?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={revealNow} disabled={busy}>
                  {busy ? "Opening…" : "Yes, show me"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Not yet
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Show me the spot (no more retries)
              </Button>
            </div>
          ))}
      </Sheet>
    );
  }

  return (
    <>
      {state.items.map((item) => {
        const hasGuess = item.guess_lat != null && item.guess_lng != null;
        const guess: [number, number] | null = hasGuess
          ? [item.guess_lat as number, item.guess_lng as number]
          : null;
        return (
          <Sheet key={item.position}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="font-bold">Map reveal</h2>
              <span className="text-sm text-ink-soft">{fillName(item.prompt, ownerName)}</span>
            </div>
            <MapView
              scope={item.scope}
              label={`${ownerName}'s answer: ${item.label}`}
              fit={guess ? [guess, [item.lat, item.lng]] : [[item.lat, item.lng]]}
              lines={guess ? [[guess, [item.lat, item.lng]]] : []}
              marks={[
                ...(guess
                  ? [{ lat: guess[0], lng: guess[1], tone: "guess" as const, label: "You" }]
                  : []),
                { lat: item.lat, lng: item.lng, tone: "answer" as const, label: item.label },
              ]}
              className="h-[260px]"
            />
            <p className="text-ink-soft">
              {ownerName}: <b className="text-ink">{item.label}</b>
              {item.distance_km != null && (
                <>
                  {" "}
                  · you were <b className="font-mono text-ink">{formatKm(item.distance_km)}</b> off
                </>
              )}
            </p>
          </Sheet>
        );
      })}
    </>
  );
}
