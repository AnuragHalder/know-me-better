import { effectiveLook, type Look } from "@/lib/look";
import { visitorLook } from "@/lib/look-server";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export type { Look } from "@/lib/look";

/**
 * The page frame every screen shares: side gutters, header, one narrow column, footer.
 * `look` is a quiz's look, used unless the visitor picked their own in the header.
 */
export async function PageShell({ children, look }: { children: React.ReactNode; look?: Look }) {
  const visitor = await visitorLook();
  const shown = effectiveLook(visitor, look);
  return (
    <div
      // <html> already carries the visitor's look; only a quiz's own look needs a wrapper.
      data-look={!visitor && look ? look : undefined}
      className="min-h-dvh pt-5 pr-[max(16px,env(safe-area-inset-right))] pb-12 pl-[max(16px,env(safe-area-inset-left))]"
    >
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <SiteHeader look={shown} />
        <main className="flex flex-col gap-5">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
