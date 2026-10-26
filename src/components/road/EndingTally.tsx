import { findEnding, type Story } from "@/lib/road/story";

/** What get_road_reveal returns. */
export interface RoadRevealData {
  story_id: string;
  owner_name: string;
  owner_picks: number[];
  owner_ending: string | null;
  me: { picks: number[]; score: number; ending: string | null } | null;
  total: number;
  followed: number;
  tally: { ending: string; count: number; names: string[] }[];
  friends: { player_name: string; picks: number[]; score: number; ending: string | null }[] | null;
  hidden: number;
}

/**
 * How many friends ended the story where the creator did, and where everyone else
 * thought it would end.
 */
export function EndingTally({
  story,
  data,
  ownerName,
  viewer,
}: {
  story: Story;
  data: RoadRevealData;
  ownerName: string;
  viewer: "owner" | "friend";
}) {
  if (data.total === 0) {
    return <p className="text-ink-soft">No friend has finished yet.</p>;
  }
  const max = Math.max(...data.tally.map((t) => t.count), 1);
  const heading =
    viewer === "owner"
      ? `${data.followed} of ${data.total} ${data.total === 1 ? "friend" : "friends"} followed you to the end`
      : `${data.followed} of ${data.total} ${data.total === 1 ? "friend" : "friends"} followed ${ownerName} to the end`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{heading}</h2>
        <p className="text-sm text-ink-soft">
          Where everyone thought {viewer === "owner" ? "your" : `${ownerName}'s`} story would end
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {data.tally.map((t) => {
          const ending = findEnding(story, t.ending);
          const isOwners = t.ending === data.owner_ending;
          const more = t.count - t.names.length;
          return (
            <li key={t.ending} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold">
                  {ending?.title ?? t.ending}
                  {isOwners && (
                    <span className="ml-2 rounded-full bg-pink px-2 py-0.5 text-xs font-bold text-white dark:text-paper">
                      {viewer === "owner" ? "Yours" : `${ownerName}'s`}
                    </span>
                  )}
                </span>
                <span className="font-mono text-sm tabular-nums">{t.count}</span>
              </div>
              <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span
                  className={isOwners ? "block h-full bg-pink" : "block h-full bg-ink-soft"}
                  style={{ width: `${Math.round((t.count / max) * 100)}%` }}
                />
              </span>
              <span className="text-sm text-ink-soft">
                {t.names.join(", ")}
                {more > 0 && ` and ${more} more`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
