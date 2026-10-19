import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Sheet } from "@/components/ui/Sheet";
import { safeNextPath } from "@/lib/redirects";
import { getCurrentUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  callback:
    "That sign-in didn't finish. The link may have expired or been opened in a different browser. Try again from this page.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNextPath(rawNext);

  const user = await getCurrentUser();
  if (user && !user.isGuest) redirect(next);

  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          Make your page
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">Sign in to make your quiz</h1>
        <p className="text-ink-soft">
          Friends who play don&apos;t need an account. You do, so your quiz stays yours.
        </p>
        <LoginForm next={next} initialError={error ? ERRORS[error] : undefined} />
      </Sheet>
    </PageShell>
  );
}
