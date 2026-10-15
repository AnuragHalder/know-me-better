# Database

Supabase Postgres. Schema lives in `supabase/migrations/`, applied in filename order.
Merging to `main` applies new migrations automatically (`.github/workflows/db-migrate.yml`).

## Tables

| Table            | Holds                                                                     | Who can read directly |
| ---------------- | ------------------------------------------------------------------------- | --------------------- |
| `profiles`       | One row per account (creator or guest player)                             | The account itself    |
| `questions`      | The shared question bank (Friends edition: 44 questions)                  | Everyone              |
| `quizzes`        | A creator's quiz: code, display name, play count                          | Its owner             |
| `quiz_questions` | The 10 questions of a quiz, copied from the bank, with the correct answer | Its owner only        |
| `attempts`       | A friend's play: picks, right/wrong per question, score                   | The player themselves |
| `purchases`      | Razorpay orders and their status                                          | The buyer             |

Clients cannot insert or update any table, except a user editing their own profile; owners may delete their own quizzes. Every other write goes through a function.

## Functions the app calls

| Function                              | Who                             | What it does                                                                                   |
| ------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `create_quiz(owner_name, items)`      | Signed-in creator (not a guest) | Validates 10 distinct bank questions and answers, returns `{id, code}`                         |
| `get_quiz_for_play(code)`             | Anyone                          | Questions and options for a code, never the answers. `null` if no such code                    |
| `start_attempt(code, player_name)`    | Signed-in or guest              | Starts or resumes the caller's attempt. Errors: `already_played`, `own_quiz`, `quiz_not_found` |
| `answer_question(attempt_id, choice)` | The player                      | Scores the next question and only then returns its correct answer                              |
| `get_leaderboard(quiz_id)`            | Owner, or a friend who finished | Top 10 plus the caller's own row; owner sees everyone with a `full_board` unlock               |

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
