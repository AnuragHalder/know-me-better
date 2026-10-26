import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { RoadWalk } from "@/components/road/RoadWalk";
import { loadStory } from "@/lib/road/stories";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Walk your road" };

export default async function RoadWalkPage({ params }: { params: Promise<{ story: string }> }) {
  const { story: id } = await params;
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect(`/login?next=/road/${encodeURIComponent(id)}`);

  const story = await loadStory(await getServerSupabase(), id);
  if (!story) notFound();

  return (
    <PageShell>
      <RoadWalk story={story} initialName={user.name?.split(" ")[0] ?? ""} />
    </PageShell>
  );
}
