// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;
let bank: { id: string; options: string[] }[];

beforeAll(async () => {
  db = await freshDb();
  bank = (
    await db.query<{ id: string; options: string[] }>(
      "select id, options from public.questions where active order by sort",
    )
  ).rows;
}, 60_000);

/** Ten bank questions with the creator's answer = the given index (default 0). */
function items(answer: (i: number) => number = () => 0, offset = 0) {
  return bank
    .slice(offset, offset + 10)
    .map((q, i) => ({ question_id: q.id, correct_option: answer(i) }));
}

async function newQuiz(owner: TestUser, answer?: (i: number) => number) {
  return rpc<{ id: string; code: string }>(db, owner, "create_quiz", [
    "Riya",
    JSON.stringify(items(answer)),
  ]);
}

/** A guest friend plays the whole quiz, picking `pick(i)` for question i. */
async function play(code: string, name: string, pick: (i: number) => number) {
  const friend = await createUser(db, { anonymous: true });
  const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
    code,
    name,
  ]);
  let last: { score: number; finished: boolean } = { score: 0, finished: false };
  for (let i = 0; i < 10; i++) {
    last = await rpc(db, friend, "answer_question", [attempt_id, pick(i)]);
  }
  return { friend, attempt_id, ...last };
}

describe("question bank", () => {
  it("has at least 40 active questions with 4 options and a {name} slot", async () => {
    const rows = await as<{ prompt_other: string; options: string[] }>(
      db,
      "anon",
      "select prompt_other, options from public.questions",
    );
    expect(rows.length).toBeGreaterThanOrEqual(40);
    for (const r of rows) {
      expect(r.options).toHaveLength(4);
      expect(r.prompt_other).toContain("{name}");
    }
  });

  it("cannot be changed by visitors or users", async () => {
    const user = await createUser(db);
    await expect(as(db, user, "delete from public.questions")).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", "update public.questions set active = false")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("creating a quiz", () => {
  it("gives a signed-in creator a 6-character code without I, O, 0 or 1", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    expect(quiz.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const own = await as(db, owner, "select code from public.quizzes");
    expect(own).toEqual([{ code: quiz.code }]);
  });

  it("refuses guests (players) and visitors", async () => {
    const guest = await createUser(db, { anonymous: true });
    await expect(newQuiz(guest)).rejects.toThrow("sign_in_required");
    await expect(rpc(db, "anon", "create_quiz", ["Riya", JSON.stringify(items())])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("needs exactly 10 different, valid questions", async () => {
    const owner = await createUser(db);
    const nine = items().slice(0, 9);
    const dupes = [...items().slice(0, 9), items()[0]];
    const badOption = items((i) => (i === 3 ? 7 : 0));
    const unknown = [...items().slice(0, 9), { question_id: "nope", correct_option: 0 }];
    for (const bad of [nine]) {
      await expect(rpc(db, owner, "create_quiz", ["Riya", JSON.stringify(bad)])).rejects.toThrow(
        "need_10_questions",
      );
    }
    for (const bad of [dupes, badOption, unknown]) {
      await expect(rpc(db, owner, "create_quiz", ["Riya", JSON.stringify(bad)])).rejects.toThrow(
        "invalid_questions",
      );
    }
    await expect(rpc(db, owner, "create_quiz", ["  ", JSON.stringify(items())])).rejects.toThrow(
      "invalid_name",
    );
  });

  it("cannot be done by writing to the tables directly", async () => {
    const owner = await createUser(db);
    await expect(
      as(
        db,
        owner,
        "insert into public.quizzes (owner_id, code, owner_name) values ($1, 'ABCDEF', 'X')",
        [owner.id],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("keeping answers secret", () => {
  it("never shows a friend the correct answers before they answer", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner, (i) => i % 4);
    const friend = await createUser(db, { anonymous: true });

    const forPlay = await rpc<{ questions: unknown[]; owner_name: string }>(
      db,
      friend,
      "get_quiz_for_play",
      [quiz.code.toLowerCase()],
    );
    expect(forPlay.owner_name).toBe("Riya");
    expect(forPlay.questions).toHaveLength(10);
    expect(JSON.stringify(forPlay)).not.toContain("correct");

    expect(await as(db, friend, "select * from public.quiz_questions")).toEqual([]);
    expect(await as(db, friend, "select * from public.quizzes")).toEqual([]);
    expect(await as(db, "anon", "select public.get_quiz_for_play('ZZZZZZ') as q")).toEqual([
      { q: null },
    ]);
    await expect(as(db, "anon", "select * from public.quiz_questions")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("lets the owner see their own answers", async () => {
    const owner = await createUser(db);
    await newQuiz(owner, (i) => i % 4);
    const rows = await as<{ correct_option: number }>(
      db,
      owner,
      "select correct_option from public.quiz_questions order by position",
    );
    expect(rows.map((r) => r.correct_option)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });
});

describe("playing", () => {
  it("scores on the server and reveals each answer only after it is given", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner, (i) => i % 4);
    const friend = await createUser(db, { anonymous: true });
    const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
      quiz.code,
      "Meera",
    ]);

    const first = await rpc(db, friend, "answer_question", [attempt_id, 0]);
    expect(first).toMatchObject({ position: 0, correct_option: 0, is_correct: true, score: 1 });
    const second = await rpc(db, friend, "answer_question", [attempt_id, 0]);
    expect(second).toMatchObject({ position: 1, correct_option: 1, is_correct: false, score: 1 });
  });

  it("finishes after 10 answers and counts the play", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner, (i) => i % 4);
    const result = await play(quiz.code, "Meera", (i) => (i < 7 ? i % 4 : 3 - (i % 4)));
    expect(result).toMatchObject({ finished: true, score: 7 });

    await expect(rpc(db, result.friend, "answer_question", [result.attempt_id, 0])).rejects.toThrow(
      "attempt_finished",
    );
    const [row] = await as<{ play_count: number }>(
      db,
      owner,
      "select play_count from public.quizzes where id = $1",
      [quiz.id],
    );
    expect(row.play_count).toBe(1);
  });

  it("allows one attempt per friend, resuming an unfinished one", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    const a = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [quiz.code, "Kabir"]);
    await rpc(db, friend, "answer_question", [a.attempt_id, 0]);
    const resumed = await rpc(db, friend, "start_attempt", [quiz.code, "Kabir"]);
    expect(resumed).toEqual({ attempt_id: a.attempt_id, answered: 1 });

    for (let i = 1; i < 10; i++) await rpc(db, friend, "answer_question", [a.attempt_id, 0]);
    await expect(rpc(db, friend, "start_attempt", [quiz.code, "Kabir"])).rejects.toThrow(
      "already_played",
    );
  });

  it("stops the owner playing their own quiz and rejects bad input", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    await expect(rpc(db, owner, "start_attempt", [quiz.code, "Riya"])).rejects.toThrow("own_quiz");

    const friend = await createUser(db, { anonymous: true });
    await expect(rpc(db, friend, "start_attempt", ["ZZZZZZ", "Kabir"])).rejects.toThrow(
      "quiz_not_found",
    );
    const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
      quiz.code,
      "Kabir",
    ]);
    await expect(rpc(db, friend, "answer_question", [attempt_id, 4])).rejects.toThrow(
      "invalid_choice",
    );
  });

  it("does not let anyone answer or edit someone else's attempt", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    const intruder = await createUser(db, { anonymous: true });
    const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
      quiz.code,
      "Kabir",
    ]);

    await expect(rpc(db, intruder, "answer_question", [attempt_id, 0])).rejects.toThrow(
      "attempt_not_found",
    );
    await expect(
      as(db, friend, "update public.attempts set score = 10 where id = $1", [attempt_id]),
    ).rejects.toThrow(/permission denied/);
    expect(await as(db, intruder, "select * from public.attempts")).toEqual([]);
  });

  it("requires sign-in (a guest session) to play", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    await expect(rpc(db, "anon", "start_attempt", [quiz.code, "Kabir"])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("leaderboard", () => {
  type Board = {
    total: number;
    limit: number | null;
    my_rank: number | null;
    rows: { rank: number; player_name: string; score: number; is_me: boolean }[];
  };

  it("shows the owner the top 10 free and everyone after a paid unlock", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    // 12 friends; friend k gets k correct answers (capped at 10).
    for (let k = 0; k < 12; k++) {
      await play(quiz.code, `Friend ${k}`, (i) => (i < k ? 0 : 1));
    }

    const free = await rpc<Board>(db, owner, "get_leaderboard", [quiz.id]);
    expect(free.total).toBe(12);
    expect(free.limit).toBe(10);
    expect(free.rows).toHaveLength(10);
    expect(free.rows[0]).toMatchObject({ rank: 1, score: 10 });

    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status)
       values ($1, 'full_board', $2, 4900, 'paid')`,
      [owner.id, quiz.id],
    );
    const paid = await rpc<Board>(db, owner, "get_leaderboard", [quiz.id]);
    expect(paid.limit).toBeNull();
    expect(paid.rows).toHaveLength(12);
  });

  it("shows a friend the top 10 plus their own row, and hides it from strangers", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    for (let k = 0; k < 10; k++) await play(quiz.code, `Friend ${k}`, () => 0);
    const last = await play(quiz.code, "Last place", () => 1);

    const board = await rpc<Board>(db, last.friend, "get_leaderboard", [quiz.id]);
    expect(board.my_rank).toBe(11);
    expect(board.rows).toHaveLength(11);
    expect(board.rows.at(-1)).toMatchObject({ player_name: "Last place", is_me: true, score: 0 });

    const stranger = await createUser(db, { anonymous: true });
    await expect(rpc(db, stranger, "get_leaderboard", [quiz.id])).rejects.toThrow("not_allowed");
  });

  it("does not let a user grant themselves a purchase", async () => {
    const user = await createUser(db);
    await expect(
      as(
        db,
        user,
        `insert into public.purchases (user_id, product, amount_paise, status)
         values ($1, 'pro_yearly', 0, 'paid')`,
        [user.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, user, "select public.has_unlock($1, 'full_board', null)", [user.id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("accounts", () => {
  it("creates a private profile for every new account", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const seen = await as<{ id: string }>(db, a, "select id from public.profiles");
    expect(seen).toEqual([{ id: a.id }]);
    expect(seen).not.toContainEqual({ id: b.id });
  });
});
