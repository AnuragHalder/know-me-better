import { cn } from "@/lib/cn";
import { ROUTE, routeHeight, routePoint, type Story } from "@/lib/road/story";

interface RouteMapProps {
  story: Story;
  /** The creator's path (option index per turn). */
  owner: readonly number[];
  /** A friend's guesses, drawn alongside. Omit to show the creator's path alone. */
  other?: readonly number[] | null;
  ownerName: string;
  /** Legend name for the other path, e.g. "You" or "Meera". */
  otherName?: string;
  className?: string;
}

/**
 * A subway-style map of a road: one row per turn, one stop per option. The creator's
 * line is in the accent colour, the friend's in highlighter; where they picked the
 * same stop it's drawn as one shared station.
 */
export function RouteMap({ story, owner, other, ownerName, otherName, className }: RouteMapProps) {
  const turns = story.turns;
  const height = routeHeight(turns.length);
  const offset = other ? 4 : 0;
  const line = (picks: readonly number[], dx: number) =>
    picks
      .slice(0, turns.length)
      .map((p, row) => {
        const { x, y } = routePoint(row, p, turns[row].options.length);
        return `${x + dx},${y}`;
      })
      .join(" ");

  const together = other ? owner.filter((p, i) => other[i] === p).length : 0;
  const description = other
    ? `Route map. ${ownerName} and ${otherName ?? "the friend"} took the same turn ${together} of ${turns.length} times.`
    : `Route map of ${ownerName}'s choices.`;

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-5 rounded-full bg-pink" />
          {ownerName}
        </span>
        {other && (
          <>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-5 rounded-full border border-ink bg-hi" />
              {otherName ?? "Friend"}
            </span>
            <span className="flex items-center gap-1.5 text-ink-soft">
              <span aria-hidden="true" className="size-3 rounded-full border-[3px] border-ink" />
              Together
            </span>
          </>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${ROUTE.width} ${height}`}
        role="img"
        aria-label={description}
        className="mx-auto block h-auto w-full max-w-[400px]"
      >
        <polyline
          points={line(owner, -offset)}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-pink"
        />
        {other && (
          <>
            <polyline
              points={line(other, offset)}
              fill="none"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-ink"
            />
            <polyline
              points={line(other, offset)}
              fill="none"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-hi"
            />
          </>
        )}

        {turns.map((turn, row) =>
          turn.options.map((_, col) => {
            const { x, y } = routePoint(row, col, turn.options.length);
            const isOwner = owner[row] === col;
            const isOther = other?.[row] === col;
            const key = `${row}-${col}`;
            if (isOwner && isOther) {
              return (
                <circle
                  key={key}
                  cx={x}
                  cy={y}
                  r={11}
                  strokeWidth={3}
                  className="fill-sheet stroke-ink"
                />
              );
            }
            if (isOwner) return <circle key={key} cx={x} cy={y} r={8} className="fill-pink" />;
            if (isOther) {
              return (
                <circle
                  key={key}
                  cx={x}
                  cy={y}
                  r={8}
                  strokeWidth={2}
                  className="fill-hi stroke-ink"
                />
              );
            }
            return <circle key={key} cx={x} cy={y} r={4} className="fill-line" />;
          }),
        )}

        {/* Labels last, with a halo so the lines never hide them. */}
        <g
          strokeWidth={4}
          paintOrder="stroke"
          strokeLinejoin="round"
          className="stroke-sheet font-mono"
          fontSize={10}
          letterSpacing="0.06em"
        >
          {turns.map((turn, row) => (
            <text key={row} x={8} y={routePoint(row, 0, 1).y - 26} className="fill-pink">
              {`${row + 1} · ${turn.place.toUpperCase()}`}
            </text>
          ))}
        </g>
        <g
          strokeWidth={4}
          paintOrder="stroke"
          strokeLinejoin="round"
          className="stroke-sheet"
          fontSize={11}
          textAnchor="middle"
        >
          {turns.map((turn, row) =>
            turn.options.map((option, col) => {
              const { x, y } = routePoint(row, col, turn.options.length);
              const chosen = owner[row] === col || other?.[row] === col;
              return (
                <text
                  key={`${row}-${col}`}
                  x={x}
                  y={y + 24}
                  fontWeight={chosen ? 700 : 400}
                  className={chosen ? "fill-ink" : "fill-ink-soft"}
                >
                  {option.short}
                </text>
              );
            }),
          )}
        </g>
      </svg>
    </figure>
  );
}
