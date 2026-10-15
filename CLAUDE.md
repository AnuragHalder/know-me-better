# Know Me Better: working notes

Read `docs/ROADMAP.md` first. Work one phase at a time, on its own branch, and open a PR.

## Conventions

- **Styling:** use the design tokens from `src/app/globals.css` through Tailwind names
  (`bg-sheet`, `text-ink`, `text-ink-soft`, `bg-hi`, `text-pink`, `font-hand`, `font-mono`).
  Never hard-code hex colors in components. Every screen must work at 360px wide and in dark mode.
- **Components:** shared primitives live in `src/components/ui/` (`Button`, `ButtonLink`, `Sheet`,
  `ScoreGrid`, `Stamp`). Reuse them before writing new ones.
- **Fonts** are bundled through `@fontsource` packages in `src/app/layout.tsx`. Do not add
  `next/font/google`.
- **Logic** that can be pure (scoring, codes, verdicts) goes in `src/lib/` with a `*.test.ts` beside it.
- **Security:** correct answers are never sent to a player's browser before they answer; scoring and
  paid unlocks are decided on the server only. Secrets never use the `NEXT_PUBLIC_` prefix.
- **Database:** every schema change is a new file in `supabase/migrations/` named
  `YYYYMMDDHHMMSS_what.sql`. Never edit a migration that is on `main`; it has already run in
  production. Read `docs/DATABASE.md` before touching the schema.
- **Database rules:** clients never write tables directly; add a `security definer` function with
  `set search_path = ''`, revoke it from `public, anon, authenticated`, then grant only who needs it.
  Every new rule gets a test in `supabase/tests/database.test.ts`.

## Before pushing

Run `npm run check && npm run build && npm run test:e2e`. All must pass.
