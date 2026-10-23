import { cn } from "@/lib/cn";

/**
 * A yellow sticky note taped to the page, slightly crooked. It stays yellow with
 * dark ink in both themes, so whatever sits on it is the brightest thing on screen.
 */
export function StickyNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "note relative mt-3 flex rotate-(--note-tilt) flex-col gap-2.5 rounded-[3px] bg-note px-4 pt-6 pb-4 text-on-note",
        "shadow-[0_10px_18px_-10px_rgb(0_0_0/0.5)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -top-[11px] left-1/2 h-[22px] w-[84px] -translate-x-1/2 rotate-3 bg-tape"
      />
      {children}
    </div>
  );
}
