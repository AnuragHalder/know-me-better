# Roadmap

Each phase is one branch and one pull request. A phase merges only when CI is green and it has
been tried on the Vercel preview link. The next phase branches from the updated `main`.

| #   | Phase                  | Scope                                                                                                                                     | Done when                                |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Foundation             | Next.js, TypeScript, Tailwind, slam-book design system, CI, Vercel deploy                                                                 | Styled home page live; CI passes on a PR |
| 2   | Database               | Supabase schema: profiles, quizzes, attempts, purchases; row-level security; question bank                                                | Migrations apply cleanly; RLS tests pass |
| 3   | Login                  | Google sign-in and phone OTP for creators; guest name for players                                                                         | Sign-in works on a phone                 |
| 4   | Create quiz            | Pick 10 answers, swap questions, edit, get code and link                                                                                  | A real quiz can be made                  |
| 5   | Play quiz              | Join by link or code, one question at a time, server-side scoring, one attempt per person, result + share (shipped with 5b)               | A friend can play from their phone       |
| 5b  | Custom & AI questions  | Edit any question and options (free); AI-written questions (Pro, or unlock by watching an ad; placeholder ad until a network is approved) | Edited and AI quizzes play correctly     |
| 6   | Dashboard, leaderboard | Live scores (refresh every 10 s), top 10 free, blurred rows past 10, per-question "got it" stats, dashboard with top scorer               | Scores appear live                       |
| 7   | Sharing                | Result image card, WhatsApp share, link previews                                                                                          | Shared links show a preview card         |
| —   | **Free launch**        | Policy pages ✅, domain whoknowsmebetter.in, analytics, real ads                                                                          | Live on the domain                       |
| 8   | Payments               | Razorpay checkout, verified webhook, unlocks: Reveal ₹29, Full board ₹49, Second chance ₹9, Lock retries ₹29                              | Test payments unlock features            |
| 9   | Pro and editions       | UPI AutoPay subscription, Couples and Birthday packs                                                                                      | Test subscription works                  |
| 10  | Ads and polish         | Rewarded ads, admin view, performance and accessibility pass                                                                              | Ready to scale                           |

## Rules that hold across phases

- Correct answers never reach a player's browser before they answer. Scoring happens on the server.
- Paid unlocks are granted only by the verified Razorpay webhook, never by the browser.
- Schema changes go in a new migration file. Old migrations are never edited.

## Map questions

Questions can be map questions ("Where was I born?", "My dream destination", …): the creator
answers with a place, friends drop a pin and score by distance. Map data is built by
`scripts/build-map-data.mjs` into `public/maps/` (Natural Earth with India's official
boundaries; GeoNames place names, CC BY 4.0, credited on the About page). Later: multi-stop
"journey", "long-distance bestie", a daily map game.
