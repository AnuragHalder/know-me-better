# Roadmap

Each phase is one branch and one pull request. A phase merges only when CI is green and it has
been tried on the Vercel preview link. The next phase branches from the updated `main`.

| #   | Phase                  | Scope                                                                                       | Done when                                |
| --- | ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Foundation             | Next.js, TypeScript, Tailwind, slam-book design system, CI, Vercel deploy                   | Styled home page live; CI passes on a PR |
| 2   | Database               | Supabase schema: profiles, quizzes, attempts, purchases; row-level security; question bank  | Migrations apply cleanly; RLS tests pass |
| 3   | Login                  | Google sign-in and phone OTP for creators; guest name for players                           | Sign-in works on a phone                 |
| 4   | Create quiz            | Pick 10 answers, swap questions, edit, get code and link                                    | A real quiz can be made                  |
| 5   | Play quiz              | Join by link or code, one question at a time, server-side scoring, one attempt per person   | A friend can play from their phone       |
| 6   | Dashboard, leaderboard | Live scores, top 10 free, blurred rows past 10                                              | Scores appear live                       |
| 7   | Sharing                | Result image card, WhatsApp share, link previews                                            | Shared links show a preview card         |
| —   | **Free launch**        | Privacy, terms and refund pages; analytics; custom domain                                   | Live on the domain                       |
| 8   | Payments               | Razorpay checkout, verified webhook, unlocks: Reveal ₹29, Full board ₹49, Second chance ₹10 | Test payments unlock features            |
| 9   | Pro and editions       | UPI AutoPay subscription, Couples and Birthday packs                                        | Test subscription works                  |
| 10  | Ads and polish         | Rewarded ads, admin view, performance and accessibility pass                                | Ready to scale                           |

## Rules that hold across phases

- Correct answers never reach a player's browser before they answer. Scoring happens on the server.
- Paid unlocks are granted only by the verified Razorpay webhook, never by the browser.
- Schema changes go in a new migration file. Old migrations are never edited.
