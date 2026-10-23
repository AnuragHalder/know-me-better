"use client";

import { MapView, type MapMark } from "@/components/map/MapView";
import { Sheet } from "@/components/ui/Sheet";
import { fillName } from "@/lib/quiz/build";
import { BULLSEYE_KM, formatKm, type MapScope } from "@/lib/map/geo";
import { formatRupees, PRODUCTS } from "@/lib/pricing";

export interface GuessMapItem {
  position: number;
  prompt: string;
  scope: MapScope;
  label: string;
  lat: number;
  lng: number;
  total: number;
  guesses: { player_name: string; lat: number; lng: number; distance_km: number }[];
}

const FULL_BOARD = PRODUCTS.find((p) => p.id === "full_board");

/** For the creator: where friends think their place is, closest first. */
export function GuessMap({ item, ownerName }: { item: GuessMapItem; ownerName: string }) {
  const shown = item.guesses;
  const hidden = Math.max(0, item.total - shown.length);
  const marks: MapMark[] = [
    ...shown.map((g, i) => ({
      lat: g.lat,
      lng: g.lng,
      tone: (i === 0 ? "best" : "friend") as MapMark["tone"],
      label: g.player_name,
    })),
    { lat: item.lat, lng: item.lng, tone: "answer", label: item.label },
  ];

  return (
    <Sheet>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {fillName(item.prompt, ownerName)}
        </span>
        <h2 className="font-bold">Where friends think: {item.label}</h2>
      </div>
      {shown.length === 0 ? (
        <p className="text-ink-soft">No pins yet. Friends&apos; guesses land here as they play.</p>
      ) : (
        <>
          <MapView
            scope={item.scope}
            label={`Friends' guesses around ${item.label}`}
            fit={[
              [item.lat, item.lng],
              ...shown.slice(0, 6).map((g) => [g.lat, g.lng] as [number, number]),
            ]}
            marks={marks}
            className="h-[280px]"
          />
          <ol className="flex flex-col">
            {shown.map((g, i) => (
              <li
                key={`${g.player_name}-${i}`}
                className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line py-2 first:border-t-0"
              >
                <span className="font-mono font-bold text-ink-soft tabular-nums">{i + 1}</span>
                <span className="truncate font-semibold">
                  {g.player_name}
                  {g.distance_km <= BULLSEYE_KM && (
                    <span className="ml-1.5 rounded-full bg-hi px-1.5 text-[0.68rem] font-bold text-on-hi">
                      Bullseye
                    </span>
                  )}
                </span>
                <span className="font-mono font-bold tabular-nums">{formatKm(g.distance_km)}</span>
              </li>
            ))}
          </ol>
          {hidden > 0 && (
            <p className="text-sm text-ink-soft">
              +{hidden} more {hidden === 1 ? "pin" : "pins"} with the full leaderboard (
              {FULL_BOARD ? formatRupees(FULL_BOARD.amountPaise) : ""}, coming soon).
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
