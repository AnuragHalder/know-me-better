import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Sheet } from "@/components/ui/Sheet";
import { loadStories } from "@/lib/road/stories";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Walk a story",
  description:
    "Play a short story and make 5 choices. Your friends walk it after you and guess every turn you took.",
};

export default async function RoadPickerPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), getServerSupabase()]);
  const stories = await loadStories(supabase);
  const firstName = user && !user.isGuest ? user.name?.split(" ")[0] : undefined;

  return (
    <PageShell>
      <Sheet ruled>
        <span className="font-mono text-xs tracking-widest text-pink uppercase">
          New · Story mode
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          {firstName ? `${firstName}'s Road` : "Walk your road"}
        </h1>
        <p className="text-lg text-ink-soft">
          Play a short story and make 5 choices. Your friends walk it after you and guess every turn
          you took. Then see where your roads split.
        </p>
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-ink px-3.5 py-2.5 text-sm font-semibold text-sheet">
          <span className="rounded-full bg-hi px-2 py-0.5 text-xs font-extrabold text-on-hi">
            Limited period
          </span>
          Every story is free for now.
        </p>
      </Sheet>

      {stories.length === 0 ? (
        <Sheet>
          <p className="text-ink-soft">Stories aren&apos;t available right now. Try again soon.</p>
        </Sheet>
      ) : (
        <ul className="flex flex-col gap-3">
          {stories.map((story, i) => (
            <li key={story.id}>
              <Link
                href={`/road/${story.id}`}
                className="flex flex-col gap-1.5 rounded-(--sheet-radius) border-2 border-line bg-sheet p-4 text-ink no-underline shadow-sheet transition-colors hover:border-ink"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-hi px-2 py-0.5 text-xs font-bold text-on-hi">
                    Free
                  </span>
                  <span className="font-mono text-xs text-ink-soft">
                    {story.turns.length} turns · 3 min
                  </span>
                </span>
                <span className={i === 0 ? "text-xl font-bold" : "text-lg font-bold"}>
                  {story.title}
                </span>
                <span className="text-sm text-ink-soft">{story.blurb}</span>
              </Link>
            </li>
          ))}
          <li className="rounded-(--sheet-radius) border-2 border-dashed border-line p-4 text-sm text-ink-soft">
            More stories on the way: shaadi season, office life, and a few surprises.
          </li>
        </ul>
      )}
    </PageShell>
  );
}
