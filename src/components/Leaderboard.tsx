import { cn } from "@/lib/cn";
import { QUESTIONS_PER_QUIZ } from "@/lib/quiz/verdict";
import { ScoreGrid } from "./ui/ScoreGrid";

export interface LeaderboardRow {
  id: string;
  name: string;
  answers: boolean[];
  isMe?: boolean;
}

export function rankRows(rows: LeaderboardRow[]) {
  return rows
    .map((r) => ({ ...r, score: r.answers.filter(Boolean).length }))
    .sort((a, b) => b.score - a.score);
}

export function Leaderboard({
  rows,
  emptyText = "No one has played yet. Send your link to a friend.",
}: {
  rows: LeaderboardRow[];
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="py-2 text-ink-soft">{emptyText}</p>;

  return (
    <ol className="flex flex-col">
      {rankRows(rows).map((r, i) => (
        <li
          key={r.id}
          className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 border-t border-line py-2.5 first:border-t-0"
        >
          <span
            className={cn(
              "font-mono font-bold tabular-nums",
              i === 0 ? "text-pink" : "text-ink-soft",
            )}
          >
            {i + 1}
          </span>
          <span className={cn("truncate font-semibold", r.isMe && "text-pink-ink")}>
            {r.name}
            {r.isMe && <small className="ml-1.5 font-medium text-ink-soft">you</small>}
          </span>
          <span className="font-mono font-bold tabular-nums">
            {r.score}/{QUESTIONS_PER_QUIZ}
          </span>
          <ScoreGrid answers={r.answers} size="sm" className="col-start-2 col-end-4" />
        </li>
      ))}
    </ol>
  );
}
