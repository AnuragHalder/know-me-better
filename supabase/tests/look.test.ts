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

describe("quiz look", () => {
  it("starts as the notebook, and the owner can switch it", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    expect((await rpc<{ look: string }>(db, friend, "get_quiz_for_play", [quiz.code])).look).toBe(
      "notebook",
    );
    await rpc(db, owner, "set_quiz_look", [quiz.id, "clean"]);
    const after = await rpc<{ look: string; retries_locked: boolean }>(
      db,
      friend,
      "get_quiz_for_play",
      [quiz.code],
    );
    expect(after).toMatchObject({ look: "clean", retries_locked: false });
  });

  it("only the owner can change it, and only to a known look", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const other = await createUser(db);
    await expect(rpc(db, other, "set_quiz_look", [quiz.id, "clean"])).rejects.toThrow(
      "quiz_not_found",
    );
    await expect(rpc(db, owner, "set_quiz_look", [quiz.id, "neon"])).rejects.toThrow(
      "invalid_look",
    );
    await expect(
      as(db, "anon", "select public.set_quiz_look(gen_random_uuid(), 'clean')"),
    ).rejects.toThrow(/permission denied/);
  });
});
