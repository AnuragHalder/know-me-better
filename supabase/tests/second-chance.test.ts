// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;
let bankIds: string[];

beforeAll(async () => {
  db = await freshDb();
  bankIds = (
    await db.query<{ id: string }>("select id from public.questions where active order by sort")
  ).rows.map((r) => r.id);
}, 60_000);

async function newQuiz(owner: TestUser) {
  const items = bankIds.slice(0, 10).map((id) => ({ question_id: id, correct_option: 0 }));
  return rpc<{ id: string; code: string }>(db, owner, "create_quiz", [
    "Riya",
    JSON.stringify(items),
  ]);
}

async function playRound(friend: TestUser, code: string, right: number) {
  const start = await rpc<{ attempt_id: string; attempt_no: number }>(db, friend, "start_attempt", [
    code,
    "Meera",
  ]);
  const answers = [];
  for (let i = 0; i < 10; i++) {
    answers.push(
      await rpc<Record<string, unknown>>(db, friend, "answer_question", [
        start.attempt_id,
        i < right ? 0 : 1,
      ]),
    );
  }
  return { start, answers };
}

async function buySecondChance(user: TestUser, quizId: string, status = "paid") {
  await as(
    db,
    "service_role",
    `insert into public.purchases (user_id, product, quiz_id, amount_paise, status)
     values ($1, 'second_chance', $2, 900, $3)`,
    [user.id, quizId, status],
  );
}

describe("hidden answers", () => {
  it("tells a friend only right or wrong, never the owner's answer", async () => {
    const quiz = await newQuiz(await createUser(db));
    const friend = await createUser(db, { anonymous: true });
    const { answers } = await playRound(friend, quiz.code, 3);
    expect(answers[0]).toMatchObject({ is_correct: true, position: 0 });
    expect(answers[5]).toMatchObject({ is_correct: false });
    for (const a of answers) expect(a).not.toHaveProperty("correct_option");
  });
});

describe("second chance", () => {
  it("needs a paid second chance for this quiz", async () => {
    const quiz = await newQuiz(await createUser(db));
    const other = await newQuiz(await createUser(db));
    const friend = await createUser(db, { anonymous: true });
    await playRound(friend, quiz.code, 2);

    await expect(rpc(db, friend, "start_attempt", [quiz.code, "Meera"])).rejects.toThrow(
      "already_played",
    );
    await buySecondChance(friend, quiz.id, "created");
    await buySecondChance(friend, other.id);
    await expect(rpc(db, friend, "start_attempt", [quiz.code, "Meera"])).rejects.toThrow(
      "already_played",
    );
  });

  it("gives one more round, and the leaderboard keeps the best score", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    await playRound(friend, quiz.code, 4);
    await buySecondChance(friend, quiz.id);

    const second = await playRound(friend, quiz.code, 8);
    expect(second.start.attempt_no).toBe(2);
    const board = await rpc<{ total: number; rows: { score: number }[] }>(
      db,
      owner,
      "get_leaderboard",
      [quiz.id],
    );
    expect(board.total).toBe(1);
    expect(board.rows[0].score).toBe(8);
    const [{ play_count }] = await as<{ play_count: number }>(
      db,
      owner,
      "select play_count from public.quizzes where id = $1",
      [quiz.id],
    );
    expect(play_count).toBe(1);

    await expect(rpc(db, friend, "start_attempt", [quiz.code, "Meera"])).rejects.toThrow(
      "already_played",
    );
  });

  it("keeps the better first score if the second round goes worse", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    await playRound(friend, quiz.code, 7);
    await buySecondChance(friend, quiz.id);
    await playRound(friend, quiz.code, 2);
    const board = await rpc<{ rows: { score: number }[] }>(db, owner, "get_leaderboard", [quiz.id]);
    expect(board.rows[0].score).toBe(7);
  });

  it("can't be called directly by players", async () => {
    const friend = await createUser(db, { anonymous: true });
    await expect(
      as(db, friend, "select public.has_second_chance($1, gen_random_uuid())", [friend.id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("lock retries", () => {
  async function lock(owner: TestUser, quizId: string) {
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'lock_retries', $2, 2900, 'paid', now())`,
      [owner.id, quizId],
    );
  }

  it("stops friends who buy after the lock, and tells the play page", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    await playRound(friend, quiz.code, 3);
    const before = await rpc<{ retries_locked: boolean }>(db, friend, "get_quiz_for_play", [
      quiz.code,
    ]);
    expect(before.retries_locked).toBe(false);

    await lock(owner, quiz.id);
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'second_chance', $2, 900, 'paid', now() + interval '1 minute')`,
      [friend.id, quiz.id],
    );
    expect(
      (await rpc<{ retries_locked: boolean }>(db, friend, "get_quiz_for_play", [quiz.code]))
        .retries_locked,
    ).toBe(true);
    await expect(rpc(db, friend, "start_attempt", [quiz.code, "Meera"])).rejects.toThrow(
      "already_played",
    );
  });

  it("keeps a second round a friend paid for before the lock", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    await playRound(friend, quiz.code, 3);
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'second_chance', $2, 900, 'paid', now() - interval '1 hour')`,
      [friend.id, quiz.id],
    );
    await lock(owner, quiz.id);
    const again = await rpc<{ attempt_no: number }>(db, friend, "start_attempt", [
      quiz.code,
      "Meera",
    ]);
    expect(again.attempt_no).toBe(2);
  });

  it("only counts a lock bought by the quiz's owner", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const stranger = await createUser(db);
    await lock(stranger, quiz.id);
    const q = await rpc<{ retries_locked: boolean }>(db, stranger, "get_quiz_for_play", [
      quiz.code,
    ]);
    expect(q.retries_locked).toBe(false);
  });
});
