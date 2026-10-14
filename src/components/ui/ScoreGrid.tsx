import { cn } from "@/lib/cn";

interface ScoreGridProps {
  /** One entry per question, in order: true when the player guessed right. */
  answers: boolean[];
  size?: "sm" | "md";
  className?: string;
}

/** The green/red row of squares a player shares after finishing a quiz. */
export function ScoreGrid({ answers, size = "md", className }: ScoreGridProps) {
  const right = answers.filter(Boolean).length;
  return (
    <div
      role="img"
      aria-label={`${right} of ${answers.length} right`}
      className={cn("flex flex-wrap", size === "sm" ? "gap-0.5" : "gap-[3px]", className)}
    >
      {answers.map((ok, i) => (
        <i
          key={i}
          data-correct={ok}
          className={cn(
            "block rounded-[3px]",
            size === "sm" ? "size-2" : "size-3.5",
            ok ? "bg-good" : "bg-bad",
          )}
        />
      ))}
    </div>
  );
}
