"use client";

import { useEffect, useRef, useState } from "react";
import { Leaderboard } from "@/components/Leaderboard";
import { boardRows, hiddenCount, newRowIds, type Board } from "@/lib/quiz/board";
import { formatRupees, PRODUCTS } from "@/lib/pricing";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const POLL_MS = 10_000;
const FULL_BOARD = PRODUCTS.find((p) => p.id === "full_board");

interface LiveLeaderboardProps {
  quizId: string;
  /** Board rendered on the server, so the first paint is complete. Omit to load it here. */
  initial?: Board | null;
  title: string;
  ownerName: string;
  /** The quiz owner sees the unlock offer; friends see who else played. */
  viewer: "owner" | "friend";
  emptyText?: string;
  /** Called with each new board, e.g. to update a play count. */
  onBoard?: (board: Board) => void;
}

/**
 * The leaderboard, refreshed every 10 seconds while the page is visible. Rows
 * past the free top 10 are shown blurred: placeholders only, no real names.
 */
export function LiveLeaderboard({
  quizId,
  initial,
  title,
  ownerName,
  viewer,
  emptyText,
  onBoard,
}: LiveLeaderboardProps) {
  const [board, setBoard] = useState<Board | null | undefined>(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const latest = useRef<Board | null>(initial ?? null);
  const onBoardRef = useRef(onBoard);
  const loadNow = initial === undefined;

  useEffect(() => {
    onBoardRef.current = onBoard;
  }, [onBoard]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        const { data } = await supabase!.rpc("get_leaderboard", { p_quiz_id: quizId });
        if (stopped) return;
        if (data) {
          const next = data as Board;
          setFresh(newRowIds(latest.current, next));
          latest.current = next;
          setBoard(next);
          onBoardRef.current?.(next);
        } else if (!latest.current) {
          setBoard(null);
        }
      }
      timer = setTimeout(poll, POLL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        poll();
      }
    };
    timer = setTimeout(poll, loadNow ? 0 : POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [quizId, loadNow]);

  const header = (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-bold">{title}</h2>
      {board && (
        <span className="font-mono text-sm text-ink-soft tabular-nums">{board.total} played</span>
      )}
    </div>
  );

  if (!board) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <p className="py-2 text-ink-soft">
          {board === undefined
            ? "Loading the leaderboard…"
            : "The leaderboard didn't load. Reload the page to see it."}
        </p>
      </div>
    );
  }

  const hidden = hiddenCount(board);

  return (
    <div className="flex flex-col gap-2">
      {header}
      <Leaderboard rows={boardRows(board)} emptyText={emptyText} fresh={fresh} />
      {hidden > 0 && (
        <div className="relative">
          <ol aria-hidden="true" className="flex flex-col blur-[5px] select-none">
            {Array.from({ length: Math.min(hidden, 3) }, (_, i) => (
              <li
                key={i}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-t border-line py-2.5"
              >
                <span className="font-mono font-bold text-ink-soft">{11 + i}</span>
                <span className="h-3 w-24 rounded bg-ink-soft/40" />
                <span className="font-mono font-bold">?/10</span>
              </li>
            ))}
          </ol>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-sheet/70 px-3 text-center">
            <p className="font-bold">
              +{hidden} more {hidden === 1 ? "friend" : "friends"} played
            </p>
            <p className="text-sm text-ink-soft">
              {viewer === "owner"
                ? `Full leaderboard ${FULL_BOARD ? formatRupees(FULL_BOARD.amountPaise) : ""} · coming soon`
                : `Only ${ownerName} can see the full leaderboard.`}
            </p>
          </div>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-ink-soft">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full rounded-full bg-good opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-good" />
        </span>
        Live: updates as friends finish
      </p>
    </div>
  );
}
