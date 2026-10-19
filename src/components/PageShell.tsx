import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** The page frame every screen shares: side gutters, header, one narrow column, footer. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-5 pr-[max(16px,env(safe-area-inset-right))] pb-12 pl-[max(16px,env(safe-area-inset-left))]">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <SiteHeader />
        <main className="flex flex-col gap-5">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
