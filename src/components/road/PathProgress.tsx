import { cn } from "@/lib/cn";

/**
 * Turns as stops on a line. Done stops are filled; for a friend, a stop where they
 * split from the creator is drawn hollow. The current stop is a ring.
 */
export function PathProgress({
  total,
  current,
  results,
  tone,
}: {
  total: number;
  current: number;
  /** Friend's results so far (together / split). Omit for the creator's own walk. */
  results?: readonly boolean[];
  tone: "owner" | "friend";
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      role="img"
      aria-label={`Turn ${Math.min(current + 1, total)} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => {
        const done = i < current;
        const split = done && results ? results[i] === false : false;
        return (
          <div key={i} className="contents">
            {i > 0 && (
              <span
                className={cn(
                  "h-1 grow rounded-full",
                  done || i === current ? (tone === "owner" ? "bg-pink" : "bg-ink") : "bg-line",
                )}
              />
            )}
            <span
              className={cn(
                "shrink-0 rounded-full",
                i === current
                  ? cn(
                      "size-[18px] border-4 bg-sheet",
                      tone === "owner" ? "border-pink" : "border-ink",
                    )
                  : done
                    ? tone === "owner"
                      ? "size-3.5 bg-pink"
                      : split
                        ? "size-3.5 border-2 border-dashed border-ink bg-sheet"
                        : "size-3.5 border-2 border-ink bg-hi"
                    : "size-3.5 bg-line",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
