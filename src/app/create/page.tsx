import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { QuizBuilder } from "@/components/QuizBuilder";
import { loadBank } from "@/lib/quiz/bank";
import { startDraft } from "@/lib/quiz/build";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Make your quiz · Know Me Better" };

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/login?next=/create");

  const supabase = await getServerSupabase();
  if (!supabase) redirect("/login?next=/create");

  const bank = await loadBank(supabase);
  // Picked on the server so the page renders the same on first paint.
  const initialItems = startDraft(bank);
  const initialName = user.name?.split(" ")[0] ?? "";

  return (
    <PageShell>
      <QuizBuilder bank={bank} initialItems={initialItems} initialName={initialName} />
    </PageShell>
  );
}
