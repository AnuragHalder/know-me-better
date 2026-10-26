// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;

// Goa story. Raj: cab, hostel, sleep early, go offline, stay on → "palolem".
const RAJ = [1, 0, 2, 1, 1];

beforeAll(async () => {
  db = await freshDb();
}, 60_000);

async function newRoad(owner: TestUser, choices = RAJ, story = "goa_trip") {
  return rpc<{ id: string; code: string }>(db, owner, "create_road", [story, "Raj", choices]);
}

/** A friend walks the road with these guesses. */
async function walk(code: string, name: string, picks: number[]) {
  const friend = await createUser(db, { anonymous: true });
  const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
    code,
    name,
  ]);
  const results: boolean[] = [];
  for (const p of picks) {
    const r = await rpc<{ is_correct: boolean }>(db, friend, "answer_question", [attempt_id, p]);
    results.push(r.is_correct);
  }
  return { friend, attempt_id, results };
}

interface Reveal {
  story_id: string;
  owner_picks: number[];
  owner_ending: string;
  me: { picks: number[]; score: number; ending: string } | null;
  total: number;
  followed: number;
  tally: { ending: string; count: number; names: string[] }[];
  friends: { player_name: string; picks: number[]; score: number; ending: string }[] | null;
  hidden: number;
}

describe("Raj's Road", () => {
  it("lets anyone read the stories but nobody change them", async () => {
    const stories = await as<{ id: string; turns: unknown[] }>(
      db,
      "anon",
      "select id, turns from public.stories order by sort",
    );
    expect(stories.map((s) => s.id)).toEqual(["goa_trip", "lottery"]);
    expect(stories[0].turns).toHaveLength(5);
    const user = await createUser(db);
    await expect(
      as(db, user, "update public.stories set title = 'Hacked' where id = 'goa_trip'"),
    ).rejects.toThrow(/permission denied/);
  });

  it("every option of every story leads to one of that story's endings", async () => {
    const stories = await as<{
      turns: { options: { ending: string; short: string }[] }[];
      endings: { key: string }[];
    }>(db, "anon", "select turns, endings from public.stories");
    for (const s of stories) {
      const keys = new Set(s.endings.map((e) => e.key));
      for (const t of s.turns) {
        expect(t.options).toHaveLength(3);
        for (const o of t.options) {
          expect(keys.has(o.ending)).toBe(true);
          expect(o.short.length).toBeLessThanOrEqual(16);
        }
      }
    }
  });

  it("saves the creator's walk as a road, never showing friends the choices", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);
    const rows = await as<{ position: number; correct_option: number }>(
      db,
      owner,
      "select position, correct_option from public.quiz_questions where quiz_id = $1 order by position",
      [road.id],
    );
    expect(rows.map((r) => r.correct_option)).toEqual(RAJ);

    const friend = await createUser(db, { anonymous: true });
    const play = await rpc<Record<string, unknown>>(db, friend, "get_quiz_for_play", [road.code]);
    expect(play).toMatchObject({ kind: "road", story_id: "goa_trip", owner_name: "Raj" });
    expect(JSON.stringify(play)).not.toContain("correct");
  });

  it.each([
    ["too few choices", [1, 0, 2]],
    ["an option that doesn't exist", [1, 0, 3, 1, 1]],
    ["a negative option", [1, 0, -1, 1, 1]],
  ])("rejects %s", async (_label, choices) => {
    const owner = await createUser(db);
    await expect(newRoad(owner, choices)).rejects.toThrow("invalid_choice");
  });

  it("needs a signed-in creator and a real story", async () => {
    const guest = await createUser(db, { anonymous: true });
    await expect(newRoad(guest)).rejects.toThrow("sign_in_required");
    const owner = await createUser(db);
    await expect(newRoad(owner, RAJ, "no_such_story")).rejects.toThrow("story_not_found");
    await expect(rpc(db, "anon", "create_road", ["goa_trip", "Raj", RAJ])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("scores each turn against the creator's choice", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);
    const { results } = await walk(road.code, "Meera", [1, 0, 1, 2, 1]);
    expect(results).toEqual([true, true, false, false, true]);
  });

  it("keeps the reveal for the owner and friends who finished", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);

    const stranger = await createUser(db, { anonymous: true });
    await expect(rpc(db, stranger, "get_road_reveal", [road.id])).rejects.toThrow("not_finished");

    // Halfway through: still hidden.
    const half = await createUser(db, { anonymous: true });
    const { attempt_id } = await rpc<{ attempt_id: string }>(db, half, "start_attempt", [
      road.code,
      "Kabir",
    ]);
    await rpc(db, half, "answer_question", [attempt_id, 1]);
    await expect(rpc(db, half, "get_road_reveal", [road.id])).rejects.toThrow("not_finished");
    await expect(rpc(db, "anon", "get_road_reveal", [road.id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("shows endings, the tally and how many friends followed the creator", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);
    await walk(road.code, "Kabir", RAJ); // palolem, 5/5
    const meera = await walk(road.code, "Meera", [1, 0, 1, 2, 1]); // tie → most recent: palolem
    await walk(road.code, "Aarav", [0, 2, 0, 0, 2]); // margao, 0/5

    const forMeera = await rpc<Reveal>(db, meera.friend, "get_road_reveal", [road.id]);
    expect(forMeera).toMatchObject({
      story_id: "goa_trip",
      owner_picks: RAJ,
      owner_ending: "palolem",
      me: { picks: [1, 0, 1, 2, 1], score: 3, ending: "palolem" },
      total: 3,
      followed: 2,
      friends: null,
    });
    expect(forMeera.tally).toEqual([
      { ending: "palolem", count: 2, names: ["Meera", "Kabir"] },
      { ending: "margao", count: 1, names: ["Aarav"] },
    ]);

    const forOwner = await rpc<Reveal>(db, owner, "get_road_reveal", [road.id]);
    expect(forOwner.me).toBeNull();
    expect(forOwner.friends?.map((f) => [f.player_name, f.score, f.ending])).toEqual([
      ["Kabir", 5, "palolem"],
      ["Meera", 3, "palolem"],
      ["Aarav", 0, "margao"],
    ]);
  });

  it("shows the owner 10 friends' paths free, every one with Full board", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);
    for (let i = 0; i < 11; i++) await walk(road.code, `Friend ${i}`, RAJ);
    const free = await rpc<Reveal>(db, owner, "get_road_reveal", [road.id]);
    expect(free.friends).toHaveLength(10);
    expect(free).toMatchObject({ total: 11, followed: 11, hidden: 1 });

    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'full_board', $2, 4900, 'paid', now())`,
      [owner.id, road.id],
    );
    const full = await rpc<Reveal>(db, owner, "get_road_reveal", [road.id]);
    expect(full.friends).toHaveLength(11);
    expect(full.hidden).toBe(0);
  });

  it("has no second round, even with a paid second chance", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);
    const { friend } = await walk(road.code, "Zoya", RAJ);
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
       values ($1, 'second_chance', $2, 900, 'paid', now())`,
      [friend.id, road.id],
    );
    await expect(rpc(db, friend, "start_attempt", [road.code, "Zoya"])).rejects.toThrow(
      "already_played",
    );
  });

  it("can't be rewritten as a quiz", async () => {
    const owner = await createUser(db);
    const road = await newRoad(owner);
    await expect(rpc(db, owner, "update_quiz", [road.id, "Raj", "[]"])).rejects.toThrow(
      "road_not_editable",
    );
  });

  it("lists roads on the dashboard with their story and length", async () => {
    const owner = await createUser(db);
    await newRoad(owner, [0, 1, 2, 0, 1], "lottery");
    const list = await rpc<Record<string, unknown>[]>(db, owner, "my_quizzes");
    expect(list[0]).toMatchObject({
      kind: "road",
      story_title: "You just won ₹10 lakh",
      total: 5,
    });
  });

  it("picks the ending with most votes; ties go to the most recent vote", async () => {
    const ending = async (story: string, picks: number[]) =>
      (
        await db.query<{ e: string }>(
          "select public.road_ending(turns, $2::smallint[]) as e from public.stories where id = $1",
          [story, picks],
        )
      ).rows[0].e;
    expect(await ending("goa_trip", [0, 2, 0, 0, 2])).toBe("margao");
    expect(await ending("goa_trip", [1, 0, 1, 2, 1])).toBe("palolem");
    expect(await ending("lottery", [2, 1, 1, 1, 0])).toBe("sensible");
  });
});
