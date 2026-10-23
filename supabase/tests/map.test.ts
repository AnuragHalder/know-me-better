// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;
let choiceIds: string[];

const KOLKATA = { lat: 22.5726, lng: 88.3639 };
const PATNA = { lat: 25.594, lng: 85.1376 };
const HOWRAH = { lat: 22.5958, lng: 88.2636 };

beforeAll(async () => {
  db = await freshDb();
  choiceIds = (
    await db.query<{ id: string }>(
      "select id from public.questions where active and kind = 'choice' order by sort",
    )
  ).rows.map((r) => r.id);
}, 60_000);

/** 10 items with a map question at position 1 ("Where was I born?" = Kolkata). */
function items(extra: Record<string, unknown>[] = []) {
  const map = { question_id: "map_born", ...KOLKATA, label: "Kolkata" };
  const choices = choiceIds
    .slice(0, 9 - extra.length)
    .map((id) => ({ question_id: id, correct_option: 0 }));
  return [choices[0], map, ...extra, ...choices.slice(1)];
}

async function newQuiz(owner: TestUser, list = items()) {
  return rpc<{ id: string; code: string }>(db, owner, "create_quiz", [
    "Riya",
    JSON.stringify(list),
  ]);
}

/** A friend plays: right on every choice question, pins the map question at `pin`. */
async function play(code: string, name: string, pin: { lat: number; lng: number }) {
  const friend = await createUser(db, { anonymous: true });
  const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
    code,
    name,
  ]);
  let pinResult: Record<string, unknown> = {};
  for (let i = 0; i < 10; i++) {
    if (i === 1) pinResult = await rpc(db, friend, "answer_pin", [attempt_id, pin.lat, pin.lng]);
    else await rpc(db, friend, "answer_question", [attempt_id, 0]);
  }
  return { friend, attempt_id, pinResult };
}

describe("map questions", () => {
  it("saves the place on the server and never sends it to players", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const [row] = await as<Record<string, unknown>>(
      db,
      owner,
      "select kind, map_scope, answer_lat, answer_lng, answer_label from public.quiz_questions where quiz_id = $1 and position = 1",
      [quiz.id],
    );
    expect(row).toEqual({
      kind: "pin",
      map_scope: "india",
      answer_lat: 22.57,
      answer_lng: 88.36,
      answer_label: "Kolkata",
    });

    const friend = await createUser(db, { anonymous: true });
    const forPlay = await rpc<{ questions: Record<string, unknown>[] }>(
      db,
      friend,
      "get_quiz_for_play",
      [quiz.code],
    );
    expect(forPlay.questions[1]).toMatchObject({ kind: "pin", scope: "india", options: [] });
    expect(JSON.stringify(forPlay)).not.toMatch(/22\.57|88\.36|Kolkata/);
  });

  it.each([
    [
      "a place outside India on an India map",
      { question_id: "map_born", lat: 51.5, lng: -0.12, label: "London" },
      "invalid_place",
    ],
    ["no coordinates", { question_id: "map_born", label: "Kolkata" }, "invalid_place"],
    ["no label", { question_id: "map_born", ...KOLKATA, label: " " }, "invalid_place"],
  ])("rejects %s", async (_label, bad, error) => {
    const owner = await createUser(db);
    const list = items();
    list[1] = bad;
    await expect(newQuiz(owner, list)).rejects.toThrow(error as string);
  });

  it("allows at most two map questions", async () => {
    const owner = await createUser(db);
    const three = items([
      { question_id: "map_dream", lat: 48.85, lng: 2.35, label: "Paris" },
      { question_id: "map_college", lat: 18.52, lng: 73.86, label: "Pune" },
    ]);
    await expect(newQuiz(owner, three)).rejects.toThrow("too_many_maps");
    const two = items([{ question_id: "map_dream", lat: 48.85, lng: 2.35, label: "Paris" }]);
    await expect(newQuiz(owner, two)).resolves.toMatchObject({ code: expect.any(String) });
  });

  it("scores a pin by distance: within 100 km is right", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const near = await play(quiz.code, "Meera", HOWRAH);
    expect(near.pinResult).toMatchObject({ is_correct: true, bullseye: true });
    expect(near.pinResult.distance_km).toBeLessThan(25);
    expect(near.pinResult).not.toHaveProperty("lat");

    const far = await play(quiz.code, "Aarav", PATNA);
    expect(far.pinResult).toMatchObject({ is_correct: false, bullseye: false });
    expect(Number(far.pinResult.distance_km)).toBeGreaterThan(450);
    expect(Number(far.pinResult.distance_km)).toBeLessThan(490);
  });

  it("won't take a pin for a choice question or a choice for a map question", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const friend = await createUser(db, { anonymous: true });
    const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
      quiz.code,
      "Zoya",
    ]);
    await expect(rpc(db, friend, "answer_pin", [attempt_id, 22.5, 88.3])).rejects.toThrow(
      "needs_choice",
    );
    await rpc(db, friend, "answer_question", [attempt_id, 0]);
    await expect(rpc(db, friend, "answer_question", [attempt_id, 0])).rejects.toThrow("needs_pin");
  });

  it("keeps the place hidden until the friend can't play again, or gives up the retry", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const { friend } = await play(quiz.code, "Aarav", PATNA);

    expect(await rpc(db, friend, "get_my_map_reveal", [quiz.id])).toEqual({
      allowed: false,
      maps: 1,
    });

    // A second chance bought now could still be used…
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'second_chance', $2, 900, 'paid', now())`,
      [friend.id, quiz.id],
    );
    // …until they choose to see the answer.
    const reveal = await rpc<{ allowed: boolean; items: Record<string, unknown>[] }>(
      db,
      friend,
      "reveal_my_map",
      [quiz.id],
    );
    expect(reveal.allowed).toBe(true);
    expect(reveal.items[0]).toMatchObject({ label: "Kolkata", lat: 22.57, lng: 88.36 });
    expect(reveal.items[0].guess_lat).toBeCloseTo(PATNA.lat, 2);
    await expect(rpc(db, friend, "start_attempt", [quiz.code, "Aarav"])).rejects.toThrow(
      "already_played",
    );
  });

  it("reveals after the second round, or when the creator locked retries", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    const { friend } = await play(quiz.code, "Kabir", PATNA);
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'lock_retries', $2, 2900, 'paid', now())`,
      [owner.id, quiz.id],
    );
    expect(await rpc(db, friend, "get_my_map_reveal", [quiz.id])).toMatchObject({ allowed: true });
  });

  it("shows the creator everyone's first-round pins, closest first, and nobody else", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    await play(quiz.code, "Aarav", PATNA);
    const { friend } = await play(quiz.code, "Meera", HOWRAH);

    const map = await rpc<
      { label: string; total: number; guesses: { player_name: string; distance_km: number }[] }[]
    >(db, owner, "get_guess_map", [quiz.id]);
    expect(map).toHaveLength(1);
    expect(map[0]).toMatchObject({ label: "Kolkata", total: 2 });
    expect(map[0].guesses.map((g) => g.player_name)).toEqual(["Meera", "Aarav"]);

    await expect(rpc(db, friend, "get_guess_map", [quiz.id])).rejects.toThrow("quiz_not_found");
    await expect(as(db, friend, "select * from public.attempt_pins")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("counts map questions on the leaderboard like any other", async () => {
    const owner = await createUser(db);
    const quiz = await newQuiz(owner);
    await play(quiz.code, "Meera", HOWRAH);
    await play(quiz.code, "Aarav", PATNA);
    const board = await rpc<{ rows: { player_name: string; score: number }[] }>(
      db,
      owner,
      "get_leaderboard",
      [quiz.id],
    );
    expect(board.rows.map((r) => [r.player_name, r.score])).toEqual([
      ["Meera", 10],
      ["Aarav", 9],
    ]);
  });
});
