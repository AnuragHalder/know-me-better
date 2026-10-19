import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { getCurrentUser } from "@/lib/supabase/server";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const signedIn = user && !user.isGuest;
  const label = user?.name ?? user?.email ?? "Account";

  return (
    <header className="flex items-center justify-between gap-3">
      <Link href="/" className="font-hand text-2xl font-bold text-ink no-underline">
        <span className="highlight">{BRAND_NAME}</span>
      </Link>
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
    </header>
  );
}
