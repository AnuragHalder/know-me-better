import { cn } from "@/lib/cn";

/** A rubber-stamp verdict, tilted like it was pressed by hand. */
export function Stamp({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block -rotate-4 rounded-lg border-[3px] border-current px-3 font-hand text-xl font-bold text-pink-ink",
        "motion-safe:animate-[stamp_.45s_cubic-bezier(.2,1.6,.4,1)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
