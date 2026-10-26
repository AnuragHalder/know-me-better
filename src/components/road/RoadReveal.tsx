"use client";

import { useEffect, useState } from "react";
import { LiveLeaderboard } from "@/components/LiveLeaderboard";
import { EndingTally, type RoadRevealData } from "@/components/road/EndingTally";
import type { RoadQuiz } from "@/components/road/RoadPlay";
import { RouteMap } from "@/components/road/RouteMap";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Stamp } from "@/components/ui/Stamp";
import { quizErrorMessage } from "@/lib/quiz/errors";
import { whatsappHref } from "@/lib/quiz/share";
import {
  compareRoads,
  findEnding,
  roadResultText,
  roadVerdict,
  splitSentence,
} from "@/lib/road/story";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "open"; data: RoadRevealData };

/** After the last turn: the creator's real path next to the friend's, and the endings. */
export function RoadReveal({
  road,
  playerName,
  results,
  url,
}: {
  road: RoadQuiz;
  playerName: string;
  results: boolean[];
  url: string;
}) {
  const { story, ownerName: owner } = road;
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setState({ kind: "error", message: "The reveal isn't available right now." });
      return;
    }
    supabase.rpc("get_road_reveal", { p_quiz_id: road.id }).then(({ data, error }) => {
      if (error || !data) setState({ kind: "error", message: quizErrorMessage(error?.message) });
      else setState({ kind: "open", data: data as RoadRevealData });
    });
  }, [road.id]);

  const score = results.filter(Boolean).length;
  const total = results.length || story.turns.length;
  const data = state.kind === "open" ? state.data : null;
  const myEnding = findEnding(story, data?.me?.ending);
  const ownerEnding = findEnding(story, data?.owner_ending);
  const text = roadResultText(owner, results, myEnding?.title ?? null, url);

  return (
    <>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {playerName} on {owner}&apos;s road
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="font-hand text-6xl leading-none font-bold tabular-nums">
            {score}
            <span className="text-3xl text-ink-soft">/{total}</span>
          </p>
          <Stamp className="text-2xl">{roadVerdict(score, total)}</Stamp>
        </div>
        {data?.me && (
          <p className="text-lg">
            {splitSentence(compareRoads(data.owner_picks, data.me.picks), story, owner)}
          </p>
        )}
        {state.kind === "error" && <p className="text-ink-soft">{state.message}</p>}
        {data?.me && (
          <RouteMap
            story={story}
            owner={data.owner_picks}
            other={data.me.picks}
            ownerName={owner}
            otherName="You"
          />
        )}
      </Sheet>

      {data && (ownerEnding || myEnding) && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {ownerEnding && (
            <div className="flex flex-col gap-1 rounded-(--sheet-radius) bg-pink p-4 text-white dark:text-paper">
              <span className="text-xs font-semibold opacity-85">{owner}&apos;s ending</span>
              <span className="text-lg leading-tight font-extrabold">{ownerEnding.title}</span>
              <span className="text-sm opacity-90">{ownerEnding.line}</span>
            </div>
          )}
          {myEnding && (
            <div className="flex flex-col gap-1 rounded-(--sheet-radius) border-2 border-ink bg-hi p-4 text-on-hi">
              <span className="text-xs font-semibold">Where you thought {owner} would end</span>
              <span className="text-lg leading-tight font-extrabold">{myEnding.title}</span>
              <span className="text-sm">
                {myEnding.key === ownerEnding?.key ? "Spot on." : myEnding.line}
              </span>
            </div>
          )}
        </div>
      )}

      {data && (
        <Sheet>
          <EndingTally story={story} data={data} ownerName={owner} viewer="friend" />
        </Sheet>
      )}

      <Sheet>
        <div className="flex flex-wrap gap-2">
          <a
            href={whatsappHref(text)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-good bg-good px-4 text-sm font-bold text-white no-underline dark:text-paper"
          >
            Share on WhatsApp
          </a>
        </div>
        <LiveLeaderboard
          quizId={road.id}
          title={`Who knows ${owner}'s road best`}
          ownerName={owner}
          viewer="friend"
        />
      </Sheet>

      <Sheet ruled>
        <h2 className="font-hand text-3xl leading-tight font-bold">Now walk your own road</h2>
        <p className="text-ink-soft">
          Pick a story, make your choices, and see which friend can follow you.
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/road" variant="pink">
            Make my own road
          </ButtonLink>
          <ButtonLink href="/create" variant="ghost">
            Make a quiz instead
          </ButtonLink>
        </div>
      </Sheet>
    </>
  );
}
