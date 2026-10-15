import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your page · Know Me Better" };

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/login?next=/me");

  const firstName = user.name?.split(" ")[0];

  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">Signed in</span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          {firstName ? (
            <>
              Hi, <span className="highlight">{firstName}</span>
            </>
          ) : (
            "You're in"
          )}
        </h1>
        <p className="text-ink-soft">
          Signed in as <b className="break-all text-ink">{user.email ?? user.name}</b>.
        </p>
        <p className="rounded-lg bg-hi/40 px-3 py-2 text-ink">
          Making your quiz opens in the next update. Your account is ready for it.
        </p>
      </Sheet>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </PageShell>
  );
}
