import { Leaderboard, type LeaderboardRow } from "@/components/Leaderboard";
import { PageShell } from "@/components/PageShell";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

/** Sample scores on the home page. Clearly labelled as an example. */
const EXAMPLE_ROWS: LeaderboardRow[] = [
  { id: "meera", name: "Meera", answers: [1, 1, 1, 1, 1, 1, 0, 1, 1, 1].map(Boolean) },
  { id: "kabir", name: "Kabir", answers: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1].map(Boolean) },
  { id: "ishaan", name: "Ishaan", answers: [0, 1, 1, 1, 0, 1, 1, 0, 1, 1].map(Boolean) },
  { id: "zoya", name: "Zoya", answers: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0].map(Boolean) },
];

const STEPS = [
  "Pick your answers to 10 slam-book questions.",
  "Share your link or 6-letter code.",
  "Friends guess. The leaderboard updates live.",
];

export default function Home() {
  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          The friendship slam book
        </span>
        <h1 className="font-hand text-[clamp(2rem,7vw,2.6rem)] leading-tight font-bold">
          Fill in your page. See which friend <span className="highlight">really</span> knows you.
        </h1>
        <p className="max-w-[42ch] text-lg text-ink-soft">
          Answer 10 questions about yourself, send the link, and watch the scores come in.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <ButtonLink href="/create" variant="pink">
            Make my quiz
          </ButtonLink>
        </div>
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
