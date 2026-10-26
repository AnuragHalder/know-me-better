import { fillName } from "@/lib/quiz/build";

/** One option at a turn. `ending` is the ending this choice votes for. */
export interface RoadOption {
  text: string;
  /** One or two words for the route map, e.g. "Shared cab". */
  short: string;
  ending: string;
}

export interface RoadTurn {
  /** Short place or moment, e.g. "First night". */
  place: string;
  /** What the creator reads ("Your train is cancelled…"). */
  scene_self: string;
  /** What friends read, with {name} ("{name}'s train is cancelled…"). */
  scene_other: string;
  ask_self: string;
  ask_other: string;
  options: RoadOption[];
}

export interface RoadEnding {
  key: string;
  title: string;
  line: string;
}

export interface Story {
  id: string;
  title: string;
  blurb: string;
  turns: RoadTurn[];
  endings: RoadEnding[];
}

/** Stories are free for a limited period; shown on the story picker. */
export const STORIES_FREE_FOR_NOW = true;

/** Friend-facing text with the creator's name filled in. */
export function forFriend(text: string, ownerName: string): string {
  return fillName(text, ownerName);
}

export function findEnding(story: Story, key: string | null | undefined): RoadEnding | null {
  return story.endings.find((e) => e.key === key) ?? null;
}

/**
 * The ending a path leads to: each picked option votes for an ending, the most votes
 * wins, a tie goes to the most recent vote. Mirrors public.road_ending in the
 * database, which decides for real; this is for the creator's own preview.
 */
export function endingFor(story: Story, picks: readonly number[]): string | null {
  const votes = new Map<string, { count: number; last: number }>();
  picks.forEach((p, i) => {
    const key = story.turns[i]?.options[p]?.ending;
    if (!key) return;
    const v = votes.get(key) ?? { count: 0, last: -1 };
    votes.set(key, { count: v.count + 1, last: i });
  });
  let best: string | null = null;
  let bestVote = { count: 0, last: -1 };
  for (const [key, v] of votes) {
    if (v.count > bestVote.count || (v.count === bestVote.count && v.last > bestVote.last)) {
      best = key;
      bestVote = v;
    }
  }
  return best;
}

export interface Split {
  /** Turns where both picked the same. */
  together: number;
  total: number;
  /** First turn (0-based) where they went different ways, or null if never. */
  firstSplit: number | null;
  /** They split and then picked the same again later. */
  metAgain: boolean;
}

/** How a friend's guesses line up with the creator's path. */
export function compareRoads(owner: readonly number[], friend: readonly number[]): Split {
  const total = Math.min(owner.length, friend.length);
  let together = 0;
  let firstSplit: number | null = null;
  let metAgain = false;
  for (let i = 0; i < total; i++) {
    if (owner[i] === friend[i]) {
      together++;
      if (firstSplit !== null) metAgain = true;
    } else if (firstSplit === null) {
      firstSplit = i;
    }
  }
  return { together, total, firstSplit, metAgain };
}

/** One line on the reveal, e.g. "You walked with Raj for 2 turns, then split on the first night." */
export function splitSentence(split: Split, story: Story, ownerName: string): string {
  if (split.firstSplit === null)
    return `You walked every step with ${ownerName}. Same road, start to finish.`;
  if (split.together === 0) return `You and ${ownerName} never once took the same turn.`;
  const where = story.turns[split.firstSplit]?.place.toLowerCase() ?? "the way";
  const before =
    split.firstSplit === 0
      ? `You split from ${ownerName} right at the start (${where})`
      : `You walked with ${ownerName} for ${split.firstSplit} ${split.firstSplit === 1 ? "turn" : "turns"}, then split at ${where}`;
  return split.metAgain ? `${before}, and found each other again later.` : `${before}.`;
}

/** The stamp on a road result. */
export function roadVerdict(score: number, total: number): string {
  if (total <= 0) throw new RangeError("total must be positive");
  const ratio = Math.min(Math.max(score, 0), total) / total;
  if (ratio === 1) return "Same road, every turn";
  if (ratio >= 0.6) return "Same road, different stops";
  if (ratio >= 0.4) return "Crossed paths";
  if (ratio > 0) return "Different maps";
  return "Different planet";
}

/** What a friend shares after walking a road. */
export function roadResultText(
  ownerName: string,
  results: readonly boolean[],
  endingTitle: string | null,
  url: string,
): string {
  const score = results.filter(Boolean).length;
  return [
    `I walked ${ownerName}'s road and matched ${score}/${results.length} turns: ${roadVerdict(score, results.length)}`,
    results.map((r) => (r ? "🟣" : "⚪")).join(""),
    endingTitle ? `I thought it'd end with "${endingTitle}".` : "",
    `Can you guess ${ownerName}'s turns? ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The invite a creator sends after walking a road. */
export function roadInviteText(story: Story, url: string, code: string): string {
  return [
    `I just played "${story.title}". Guess every turn I took and see if we end up in the same place.`,
    url,
    `Code: ${code}`,
  ].join("\n");
}

/** Layout of the route map: one row per turn, one column per option. */
export const ROUTE = { width: 342, rowGap: 96, top: 40, pad: 57 } as const;

/** The (x, y) of option `col` (of `cols`) at turn `row` on the route map. */
export function routePoint(row: number, col: number, cols: number): { x: number; y: number } {
  const span = ROUTE.width - ROUTE.pad * 2;
  const x = cols <= 1 ? ROUTE.width / 2 : ROUTE.pad + (span * col) / (cols - 1);
  return { x, y: ROUTE.top + row * ROUTE.rowGap };
}

/** Height of the route map for a story with `turns` turns. */
export function routeHeight(turns: number): number {
  return ROUTE.top + (turns - 1) * ROUTE.rowGap + 34;
}
