import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Sheet } from "@/components/ui/Sheet";
import { rankGames, shareHealth, type AdminStats, type KindStats } from "@/lib/admin/stats";
import { formatRupees, PRODUCTS } from "@/lib/pricing";
import { getCurrentUser, getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Usage", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Usage numbers for the team. Only people in app_admins see this page. */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.isGuest) redirect("/login?next=/admin");
  const supabase = await getServerSupabase();
  const { data } = supabase ? await supabase.rpc("admin_stats") : { data: null };
  if (!data) notFound();
  const s = data as AdminStats;
  const ranked = rankGames(s);
  const top = Math.max(...ranked.map((g) => g.total), 1);
  const updated = new Date(s.generated_at).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          Team only · updated {updated}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">How the app is doing</h1>
        <p className="text-sm text-ink-soft">
          Counts from the database. Page visits, countries and devices are in Vercel → Analytics.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Accounts" value={s.people.accounts} week={s.people.accounts_week} />
          <Tile label="Guest players" value={s.people.guests} week={s.people.guests_week} />
          <Tile label="Quizzes made" value={s.quiz.created} week={s.quiz.created_week} />
          <Tile label="Party rooms" value={s.party.rooms} week={s.party.rooms_week} />
        </div>
      </Sheet>

      <Sheet>
        <h2 className="text-lg font-bold">Most played</h2>
        <ul className="flex flex-col gap-3">
          {ranked.map((g) => (
            <li key={g.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{g.name}</span>
                <span className="font-mono text-sm tabular-nums">
                  {g.total} {g.unit}
                  <span className="text-ink-soft"> · {g.week} this week</span>
                </span>
              </div>
              <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span
                  className="block h-full bg-pink"
                  style={{ width: `${Math.round((g.total / top) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        {Object.keys(s.party.games).length > 0 && (
          <p className="text-sm text-ink-soft">
            Average players per party game:{" "}
            {Object.entries(s.party.games)
              .map(([k, v]) => `${PARTY_NAMES[k] ?? k} ${v?.avg_players}`)
              .join(" · ")}
          </p>
        )}
      </Sheet>

      <Sheet>
        <h2 className="text-lg font-bold">Is sharing working?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ShareCard title="Quizzes" k={s.quiz} unit="quizzes" />
          <ShareCard title="Story roads" k={s.road} unit="roads" />
        </div>
      </Sheet>

      <Sheet>
        <h2 className="text-lg font-bold">Last 14 days</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm tabular-nums">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-1.5 font-semibold">Day</th>
                <th className="py-1.5 text-right font-semibold">Quizzes</th>
                <th className="py-1.5 text-right font-semibold">Quiz plays</th>
                <th className="py-1.5 text-right font-semibold">Roads</th>
                <th className="py-1.5 text-right font-semibold">Road plays</th>
                <th className="py-1.5 text-right font-semibold">Party games</th>
              </tr>
            </thead>
            <tbody>
              {[...s.daily].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1.5">
                    {new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="py-1.5 text-right">{d.quizzes}</td>
                  <td className="py-1.5 text-right">{d.quiz_plays}</td>
                  <td className="py-1.5 text-right">{d.roads}</td>
                  <td className="py-1.5 text-right">{d.road_plays}</td>
                  <td className="py-1.5 text-right">{d.party_games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sheet>

      <Sheet>
        <h2 className="text-lg font-bold">Payments</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Paid" value={s.payments.paid} />
          <Tile label="Revenue" text={formatRupees(s.payments.paid_paise)} />
          <Tile label="Failed" value={s.payments.failed} />
          <Tile label="Left checkout" value={s.payments.abandoned} />
        </div>
        {Object.keys(s.payments.by_product).length > 0 && (
          <p className="text-sm text-ink-soft">
            {Object.entries(s.payments.by_product)
              .map(([id, n]) => `${PRODUCTS.find((p) => p.id === id)?.name ?? id}: ${n}`)
              .join(" · ")}
          </p>
        )}
        <p className="text-xs text-ink-soft">
          Includes test-mode payments while Razorpay test keys are in use.
        </p>
      </Sheet>
    </PageShell>
  );
}

const PARTY_NAMES: Record<string, string> = {
  fake_it: "Fake It",
  same_brain: "Same Brain",
  killer: "Killer",
};

function Tile({
  label,
  value,
  week,
  text,
}: {
  label: string;
  value?: number;
  week?: number;
  text?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-sheet p-3">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <span className="font-mono text-2xl font-bold tabular-nums">
        {text ?? value?.toLocaleString("en-IN")}
      </span>
      {week !== undefined && <span className="text-xs text-ink-soft">+{week} this week</span>}
    </div>
  );
}

function ShareCard({ title, k, unit }: { title: string; k: KindStats; unit: string }) {
  const h = shareHealth(k);
  const pct = (n: number | null) => (n === null ? "–" : `${n}%`);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-sheet p-4">
      <span className="font-bold">{title}</span>
      <span className="text-sm">
        <b>{pct(h.sharedAndPlayed)}</b> of {k.created} {unit} got at least one friend to finish
      </span>
      <span className="text-sm">
        <b>{h.playsPerPage ?? "–"}</b> finished plays per {unit.replace(/s$/, "")}
      </span>
      <span className="text-sm">
        <b>{pct(h.finishRate)}</b> of friends who started, finished ({k.players} different players)
      </span>
      <span className="text-sm text-ink-soft">{k.creators} different creators</span>
    </div>
  );
}
