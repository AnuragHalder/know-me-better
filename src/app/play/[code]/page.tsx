import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { ButtonLink } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Play" };

/** Placeholder until Phase 5: confirms the link works and whose quiz it is. */
export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const supabase = await getServerSupabase();

  let ownerName: string | null = null;
  if (supabase && /^[A-Z0-9]{6}$/.test(code)) {
    const { data } = await supabase.rpc("get_quiz_for_play", { p_code: code });
    ownerName = (data as { owner_name?: string } | null)?.owner_name ?? null;
  }

  return (
    <PageShell>
      <Sheet ruled>
        {ownerName ? (
          <>
            <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
              Code {code}
            </span>
            <h1 className="font-hand text-4xl leading-tight font-bold">
              How well do you know <span className="highlight">{ownerName}</span>?
            </h1>
            <p className="text-ink-soft">
              Playing opens in the next update. Keep this link; it will work then.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-hand text-4xl leading-tight font-bold">No quiz with code {code}</h1>
            <p className="text-ink-soft">
              Check the code with your friend. Codes have 6 letters and numbers, without O, I, 0 or
              1.
            </p>
          </>
        )}
        <div>
          <ButtonLink href="/create" variant="pink">
            Make your own quiz
          </ButtonLink>
        </div>
      </Sheet>
    </PageShell>
  );
}
