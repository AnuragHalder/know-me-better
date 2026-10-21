import type { LeaderboardRow } from "@/components/Leaderboard";

/** What get_leaderboard returns. */
export interface Board {
  total: number;
  /** null when the owner has unlocked the full board. */
  limit: number | null;
  my_rank: number | null;
  rows: { rank: number; player_name: string; score: number; results: boolean[]; is_me: boolean }[];
}

export function boardRows(board: Board): LeaderboardRow[] {
  return board.rows.map((r) => ({
    id: `${r.rank}-${r.player_name}`,
    name: r.player_name,
    answers: r.results,
    isMe: r.is_me,
    rank: r.rank,
  }));
}

/** Friends who played but aren't shown, because the free board stops at 10. */
export function hiddenCount(board: Board): number {
  return Math.max(0, board.total - board.rows.length);
}

/** Row ids that weren't on the previous board: friends who just finished. */
export function newRowIds(before: Board | null, after: Board): Set<string> {
  if (!before) return new Set();
  const seen = new Set(boardRows(before).map((r) => r.id));
  return new Set(
    boardRows(after)
      .map((r) => r.id)
      .filter((id) => !seen.has(id)),
  );
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", else a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(iso));
}
