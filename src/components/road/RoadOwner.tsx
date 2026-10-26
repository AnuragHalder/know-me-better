"use client";

import { useState } from "react";
import type { RoadRevealData } from "@/components/road/EndingTally";
import { RouteMap } from "@/components/road/RouteMap";
import { cn } from "@/lib/cn";
import { formatRupees, PRODUCTS } from "@/lib/pricing";
import { compareRoads, findEnding, type Story } from "@/lib/road/story";

const FULL_BOARD = PRODUCTS.find((p) => p.id === "full_board");

/**
 * The creator's road, with any friend's guesses laid over it: tap a friend to see
 * exactly where they split from you.
 */
export function RoadOwner({ story, data }: { story: Story; data: RoadRevealData }) {
  const friends = data.friends ?? [];
  const [selected, setSelected] = useState<number | null>(friends.length > 0 ? 0 : null);
  const friend = selected !== null ? friends[selected] : null;
  const ending = findEnding(story, data.owner_ending);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">Where every friend split from you</h2>
        {ending && (
          <p className="text-sm text-ink-soft">
            Your ending: <b className="text-ink">{ending.title}</b>
          </p>
        )}
      </div>
      {friends.length > 0 && (
        <div role="group" aria-label="Friends" className="flex flex-wrap gap-2">
          {friends.map((f, i) => {
            const split = compareRoads(data.owner_picks, f.picks);
            return (
              <button
                key={`${f.player_name}-${i}`}
                type="button"
                aria-pressed={selected === i}
                onClick={() => setSelected(selected === i ? null : i)}
                className={cn(
                  "min-h-11 rounded-full border-2 px-3.5 text-sm font-semibold",
                  selected === i ? "border-ink bg-hi text-on-hi" : "border-line bg-sheet text-ink",
                )}
              >
                {f.player_name}{" "}
                <span className="font-mono tabular-nums opacity-75">
                  {split.together}/{split.total}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <RouteMap
        story={story}
        owner={data.owner_picks}
        other={friend?.picks ?? null}
        ownerName="You"
        otherName={friend?.player_name}
      />
      {friend && (
        <p className="text-sm text-ink-soft">
          {friend.player_name} thought you&apos;d end with{" "}
          <b className="text-ink">{findEnding(story, friend.ending)?.title ?? "something else"}</b>.
        </p>
      )}
      {friends.length === 0 && (
        <p className="text-sm text-ink-soft">
          When friends finish, tap a name to see where they split from you.
        </p>
      )}
      {data.hidden > 0 && (
        <p className="rounded-xl border-2 border-dashed border-line p-3 text-sm text-ink-soft">
          +{data.hidden} more {data.hidden === 1 ? "friend" : "friends"} walked your road. See every
          path with the full board
          {FULL_BOARD ? ` (${formatRupees(FULL_BOARD.amountPaise)})` : ""}. Payments open soon.
        </p>
      )}
    </div>
  );
}
