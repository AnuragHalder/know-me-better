import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PartyHost } from "@/components/party/PartyHost";
import { PageShell } from "@/components/PageShell";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Party room",
  description:
    "Fake It and Same Brain: live party games for your friend group. Share a code, play on your phones.",
};

export default async function PartyPage() {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/login?next=/party");
  return (
    <PageShell>
      <PartyHost initialName={user.name?.split(" ")[0] ?? ""} />
    </PageShell>
  );
}
