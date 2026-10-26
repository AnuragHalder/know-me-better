import Link from "next/link";
import { Leaderboard, type LeaderboardRow } from "@/components/Leaderboard";
import { PageShell } from "@/components/PageShell";
import { buttonClasses } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";

/** Sample scores on the home page. Clearly labelled as an example. */
const EXAMPLE_ROWS: LeaderboardRow[] = [
  { id: "meera", name: "Meera", answers: [1, 1, 1, 1, 1, 1, 0, 1, 1, 1].map(Boolean) },
  { id: "kabir", name: "Kabir", answers: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1].map(Boolean) },
  { id: "ishaan", name: "Ishaan", answers: [0, 1, 1, 1, 0, 1, 1, 0, 1, 1].map(Boolean) },
  { id: "zoya", name: "Zoya", answers: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0].map(Boolean) },
];

/** The two ways to play, side by side at the top of the page. */
const MODES = [
  {
    href: "/create",
    tag: "Quiz",
    title: "Make my quiz",
    text: "Answer 10 questions about you: hot takes, money, travel, music. Friends guess each one.",
    cta: "Start a quiz",
    isNew: false,
  },
  {
    href: "/road",
    tag: "New · Free for now",
    title: "Walk a story",
    text: "Make 5 choices in a short story. Friends guess every turn you took and see where you split.",
    cta: "Pick a story",
    isNew: true,
  },
];

const STEPS = [
  "Answer 10 questions about you, or walk a short story.",
  "Share your link or 6-letter code.",
  "Friends guess. The leaderboard updates live.",
];

export default function Home() {
  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          The friendship game
        </span>
        <h1 className="font-hand text-[clamp(2rem,7vw,2.6rem)] leading-tight font-bold">
          Find out which friend <span className="highlight">actually</span> knows you.
        </h1>
        <p className="max-w-[42ch] text-lg text-ink-soft">
          Pick how you want to play, send the link, and watch your friends get ranked.
        </p>
        <ul aria-label="Ways to play" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
          {MODES.map((mode) => (
            <li key={mode.href} className="flex">
              <Link
                href={mode.href}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-xl border-2 bg-sheet p-4 text-ink no-underline transition-colors hover:border-ink",
                  mode.isNew ? "border-pink" : "border-line",
                )}
              >
                <span
                  className={cn(
                    "self-start rounded-full px-2 py-0.5 text-xs font-bold",
                    mode.isNew ? "bg-hi text-on-hi" : "bg-line text-ink",
                  )}
                >
                  {mode.tag}
                </span>
                <span className="text-xl font-bold">{mode.title}</span>
                <span className="text-sm text-ink-soft">{mode.text}</span>
                <span
                  className={cn("mt-auto pt-2 font-bold", mode.isNew ? "text-pink" : "text-ink")}
                >
                  {mode.cta} <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <form action="/play" className="flex flex-col gap-1.5">
          <label
            htmlFor="join-code"
            className="text-xs font-bold tracking-widest text-ink-soft uppercase"
          >
            Got a friend&apos;s code?
          </label>
          <div className="flex gap-2">
            <input
              id="join-code"
              name="code"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={9}
              placeholder="ABC123"
              required
              className="min-h-11 w-36 rounded-xl border-2 border-line bg-sheet px-3 font-mono text-base tracking-widest text-ink uppercase placeholder:text-ink-soft/60"
            />
            <button type="submit" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Play
            </button>
          </div>
        </form>
      </Sheet>

      <Sheet>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">
            Aarav&apos;s page{" "}
            <span className="ml-1 rounded-full bg-hi px-2 py-0.5 align-middle text-[0.68rem] tracking-wider text-on-hi uppercase">
              Example
            </span>
          </h2>
          <span className="text-sm text-ink-soft">10 questions</span>
        </div>
        <Leaderboard rows={EXAMPLE_ROWS} />
      </Sheet>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((text, i) => (
          <li key={text} className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
            <b className="w-6 shrink-0 font-hand text-3xl leading-none text-pink">{i + 1}</b>
            <span className="text-sm text-ink-soft">{text}</span>
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
