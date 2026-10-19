# Who Knows Me Better

A slam-book friendship quiz. You answer 10 questions about yourself, share a link, and friends
compete on a live leaderboard to prove who knows you best.

Stack: Next.js (App Router) · TypeScript · Tailwind CSS · Supabase · Razorpay · Vercel.
Live at https://whoknowsmebetter.in (once the domain is connected).

| Doc                                  | What it covers                                    |
| ------------------------------------ | ------------------------------------------------- |
| [docs/ROADMAP.md](docs/ROADMAP.md)   | The build plan, phase by phase                    |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, functions and security rules              |
| [docs/LAUNCH.md](docs/LAUNCH.md)     | Domain, Vercel, Supabase, Google and email setup  |
| [docs/RAZORPAY.md](docs/RAZORPAY.md) | Taking payments, from website review to live mode |

Business details shown on the policy pages live in `src/lib/business.ts`; prices in
`src/lib/pricing.ts`.

## Run it locally

Needs Node 22 (see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # fill in values as phases add them
npm run dev                  # http://localhost:3000
```

## Checks

| Command            | What it does                               |
| ------------------ | ------------------------------------------ |
| `npm run check`    | Typecheck, lint, formatting and unit tests |
| `npm run build`    | Production build                           |
| `npm run test:e2e` | Browser tests against a production build   |
| `npm run format`   | Fix formatting                             |

CI runs all of these on every pull request.

## How we work

1. Branch from `main` for each phase: `phase-2-database`, `phase-3-login`, …
2. Open a pull request. Vercel posts a preview link on it.
3. Merge only when CI is green and the preview has been tried on a phone.
