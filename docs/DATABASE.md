# Database

Supabase Postgres. Schema lives in `supabase/migrations/`, applied in filename order.
Merging to `main` applies new migrations automatically (`.github/workflows/db-migrate.yml`).

## Tables

| Table            | Holds                                                                                                                                                                                 | Who can read directly |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `profiles`       | One row per account (creator or guest player)                                                                                                                                         | The account itself    |
| `questions`      | The shared question bank (Friends edition: 44 questions)                                                                                                                              | Everyone              |
| `quizzes`        | A creator's quiz: code, display name, play count                                                                                                                                      | Its owner             |
| `quiz_questions` | The 10 questions of a quiz with the correct answer. Bank questions are copied; `source` is `bank`, `edited`, `custom` or `ai`; `prompt_self` keeps the creator's first-person wording | Its owner only        |
| `attempts`       | A friend's play: picks, right/wrong per question, score                                                                                                                               | The player themselves |
| `purchases`      | Razorpay orders and their status                                                                                                                                                      | The buyer             |
| `ad_sessions`    | Rewarded-ad views: started, completed (≥ 14 s later), consumed by an AI generation                                                                                                    | The viewer            |
| `ai_generations` | Each AI question request: topics, `pro` or `ad`, status `pending`/`ok`/`failed`                                                                                                       | The creator           |

Clients cannot insert or update any table, except a user editing their own profile; owners may delete their own quizzes. Every other write goes through a function.

## Functions the app calls

| Function                                          | Who                             | What it does                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create_quiz(owner_name, items)`                  | Signed-in creator (not a guest) | Validates 10 items (bank, edited bank, or own/AI questions with 4 distinct options) through `quiz_items_checked`, returns `{id, code}`. Errors: `invalid_text`, `invalid_options`, `invalid_questions` |
| `update_quiz(quiz_id, owner_name, items)`         | The quiz's owner                | Same checks as `create_quiz`; only before any friend has started (`quiz_has_plays`)                                                                                                                    |
| `get_quiz_for_play(code)`                         | Anyone                          | Questions and options for a code, never the answers. `null` if no such code                                                                                                                            |
| `start_attempt(code, player_name)`                | Signed-in or guest              | Starts or resumes the caller's attempt; starts round 2 after a paid `second_chance` for this quiz. Errors: `already_played`, `own_quiz`, `quiz_not_found`                                              |
| `answer_question(attempt_id, choice)`             | The player                      | Scores the next question; returns only right or wrong, never the owner's answer                                                                                                                        |
| `get_leaderboard(quiz_id)`                        | Owner, or a friend who finished | Top 10 plus the caller's own row; owner sees everyone with a `full_board` unlock                                                                                                                       |
| `get_quiz_for_play` also returns `retries_locked` | Anyone                          | True once the creator paid `lock_retries`; friends then aren't offered a second chance                                                                                                                 |
| `my_quizzes()`                                    | Signed-in creator               | The caller's quizzes with plays, last play time and current top scorer (dashboard)                                                                                                                     |
| `quiz_question_stats(quiz_id)`                    | The quiz's owner                | Per question: how many friends' first attempts got it right. Totals only, never who picked what                                                                                                        |
| `ai_status()`                                     | Signed-in creator               | `{pro, credits, ads_left}`: unused ad unlocks, and ads left today (3 a day, India time)                                                                                                                |
| `start_ad_session()`                              | Signed-in creator               | `{id, seconds: 15}`. Error `ad_limit` after 3 completed ads today                                                                                                                                      |
| `complete_ad_session(id)`                         | The viewer                      | Marks the ad watched if ≥ 14 s passed (`ad_too_short` otherwise); returns `ai_status()`                                                                                                                |
| `claim_ai_generation(topics)`                     | Signed-in creator               | Pro: allowed (20 a day). Otherwise uses one ad unlock; `{allowed:false, reason:'needs_unlock'}` if none                                                                                                |
| `finish_ai_generation(id, ok)`                    | The creator                     | Records the outcome; a failed generation gives the ad unlock back                                                                                                                                      |

Errors are raised with a short code as the message (`sign_in_required`, `invalid_questions`,
`attempt_finished`, `not_allowed`, …) so the app can show a friendly sentence for each.

## Rules

- `{name}` in a question's `prompt_other` is replaced with the creator's name by the app.
- Quiz questions copy the prompt and options at creation, so editing the bank never changes an
  existing quiz. Still, never reorder an existing question's options; add a new question instead.
- Paid unlocks are rows in `purchases` with `status = 'paid'`, written only with the service role
  key by the Razorpay webhook (Phase 8). `has_unlock()` checks them; Pro covers Reveal and Full board.

## Tests

`supabase/tests/database.test.ts` runs every migration on an in-memory Postgres (PGlite) with a
small stand-in for Supabase's auth (`supabase-shim.sql`), then checks the rules above as real
callers: visitor, guest player, creator, and the server. They run with `npm test` and in CI.
