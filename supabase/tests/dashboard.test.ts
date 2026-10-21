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

async function newQuiz(owner: TestUser, name = "Riya") {
  const items = bankIds.slice(0, 10).map((id) => ({ question_id: id, correct_option: 0 }));
  return rpc<{ id: string; code: string }>(db, owner, "create_quiz", [name, JSON.stringify(items)]);
}

/** A guest plays; `right(i)` decides whether question i is answered correctly. */
async function play(code: string, name: string, right: (i: number) => boolean) {
  const friend = await createUser(db, { anonymous: true });
  const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
    code,
    name,
  ]);
  for (let i = 0; i < 10; i++)
    await rpc(db, friend, "answer_question", [attempt_id, right(i) ? 0 : 1]);
  return friend;
}

type Summary = {
  id: string;
  play_count: number;
  last_played_at: string | null;
  top: { player_name: string; score: number } | null;
};

describe("dashboard", () => {
  it("lists only the caller's quizzes, with plays and the top scorer", async () => {
    const owner = await createUser(db);
    const other = await createUser(db);
    const empty = await newQuiz(owner, "Riya");
    const busy = await newQuiz(owner, "Riya B");
    await newQuiz(other, "Kabir");

    await play(busy.code, "Meera", (i) => i < 6);
    await play(busy.code, "Zoya", (i) => i < 9);

    const list = await rpc<Summary[]>(db, owner, "my_quizzes");
    expect(list.map((q) => q.id)).toEqual([busy.id, empty.id]);
    expect(list[0]).toMatchObject({ play_count: 2, top: { player_name: "Zoya", score: 9 } });
    expect(list[0].last_played_at).not.toBeNull();
    expect(list[1]).toMatchObject({ play_count: 0, top: null, last_played_at: null });
  });

  it("counts how many friends got each question right, for the owner only", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    await play(quiz.code, "A", (i) => i === 0 || i === 1);
    const b = await play(quiz.code, "B", (i) => i === 0);

    const stats = await rpc<{ position: number; right: number; total: number }[]>(
      db,
      owner,
      "quiz_question_stats",
      [quiz.id],
    );
    expect(stats).toHaveLength(10);
    expect(stats.slice(0, 3)).toEqual([
      { position: 0, right: 2, total: 2 },
      { position: 1, right: 1, total: 2 },
      { position: 2, right: 0, total: 2 },
    ]);

    await expect(rpc(db, b, "quiz_question_stats", [quiz.id])).rejects.toThrow("quiz_not_found");
    const stranger = await createUser(db);
    expect(await rpc(db, stranger, "my_quizzes")).toEqual([]);
  });

  it("is not callable without signing in", async () => {
    await expect(as(db, "anon", "select public.my_quizzes()")).rejects.toThrow(/permission denied/);
    await expect(
      as(db, "anon", "select public.quiz_question_stats(gen_random_uuid())"),
    ).rejects.toThrow(/permission denied/);
  });
});
