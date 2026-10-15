import { SiteHeader } from "./SiteHeader";

/** The page frame every screen shares: side gutters, header, one narrow column. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-5 pr-[max(16px,env(safe-area-inset-right))] pb-12 pl-[max(16px,env(safe-area-inset-left))]">
      <main className="mx-auto flex max-w-[560px] flex-col gap-5">
        <SiteHeader />
        {children}
      </main>
    </div>
  );
}
