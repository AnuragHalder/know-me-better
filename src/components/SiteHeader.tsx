import Link from "next/link";
import { LookToggle } from "@/components/LookToggle";
import { BRAND_NAME } from "@/lib/brand";
import type { Look } from "@/lib/look";
import { getCurrentUser } from "@/lib/supabase/server";

export async function SiteHeader({ look }: { look: Look }) {
  const user = await getCurrentUser();
  const signedIn = user && !user.isGuest;
  const label = user?.name ?? user?.email ?? "Account";

  return (
    <header className="flex items-center justify-between gap-2">
      <Link
        href="/"
        className="min-w-0 font-hand text-lg font-bold whitespace-nowrap text-ink no-underline min-[400px]:text-2xl"
      >
        <span className="highlight">{BRAND_NAME}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <LookToggle current={look} />
        {signedIn ? (
          <Link
            href="/me"
            aria-label={`Your account: ${label}`}
            className="flex size-11 items-center justify-center rounded-full bg-ink font-bold text-sheet no-underline"
          >
            {label.charAt(0).toUpperCase()}
          </Link>
        ) : (
          <Link href="/login" className="min-h-11 content-center text-sm font-semibold text-ink">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
