import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface SheetProps extends ComponentProps<"section"> {
  /** Draw notebook ruling, the red margin and punch holes. Plain sheets are for dense content. */
  ruled?: boolean;
}

/** A page torn from the slam book. The main container for every screen section. */
export function Sheet({ ruled = false, className, children, ...props }: SheetProps) {
  return (
    <section
      className={cn(
        "relative rounded-md bg-sheet shadow-sheet",
        ruled ? "ruled py-6 pr-5 pl-12" : "p-5",
        className,
      )}
      {...props}
    >
      {ruled && (
        <>
          <span aria-hidden="true" className="absolute inset-y-0 left-[30px] w-0.5 bg-margin" />
          <span aria-hidden="true" className="absolute top-6 left-2 flex flex-col gap-14">
            {[0, 1, 2].map((i) => (
              <i
                key={i}
                className="block size-[11px] rounded-full bg-paper shadow-[inset_0_1px_2px_rgb(0_0_0/0.15)]"
              />
            ))}
          </span>
        </>
      )}
      <div className="relative flex flex-col gap-4">{children}</div>
    </section>
  );
}
