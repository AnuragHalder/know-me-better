import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export type Look = "notebook" | "clean";

/**
 * The page frame every screen shares: side gutters, header, one narrow column, footer.
 * `look` restyles everything inside, e.g. a quiz in its creator's chosen look.
 */
export function PageShell({ children, look }: { children: React.ReactNode; look?: Look }) {
  return (
    <div
      data-look={look === "clean" ? "clean" : undefined}
      className="min-h-dvh pt-5 pr-[max(16px,env(safe-area-inset-right))] pb-12 pl-[max(16px,env(safe-area-inset-left))]"
    >
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <SiteHeader />
        <main className="flex flex-col gap-5">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
