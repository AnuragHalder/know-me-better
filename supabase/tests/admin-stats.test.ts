// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;
let admin: TestUser;

interface Stats {
  people: { accounts: number; guests: number };
  quiz: {
    created: number;
    plays: number;
    started: number;
    players: number;
    played_at_least_once: number;
  };
  road: { created: number; plays: number };
  party: { rooms: number; games: Record<string, { games: number; avg_players: number }> };
  payments: {
    paid: number;
    paid_paise: number;
    abandoned: number;
    by_product: Record<string, number>;
  };
  daily: { day: string; quizzes: number; quiz_plays: number; party_games: number }[];
}

beforeAll(async () => {
  db = await freshDb();
  admin = await createUser(db);
  await db.query("insert into public.app_admins (user_id) values ($1)", [admin.id]);

  // One quiz played twice (one unfinished), one road played once.
  const ids = (
    await db.query<{ id: string }>(
      "select id from public.questions where active and kind = 'choice' order by sort limit 10",
    )
  ).rows.map((r) => r.id);
  const owner = await createUser(db);
  const quiz = await rpc<{ id: string; code: string }>(db, owner, "create_quiz", [
    "Riya",
    JSON.stringify(ids.map((id) => ({ question_id: id, correct_option: 0 }))),
  ]);
  for (const [name, answers] of [
    ["Meera", 10],
    ["Kabir", 10],
    ["Zoya", 3],
  ] as const) {
    const g = await createUser(db, { anonymous: true });
    const { attempt_id } = await rpc<{ attempt_id: string }>(db, g, "start_attempt", [
      quiz.code,
      name,
    ]);
    for (let i = 0; i < answers; i++) await rpc(db, g, "answer_question", [attempt_id, 0]);
  }
  const road = await rpc<{ code: string }>(db, owner, "create_road", [
    "goa_trip",
    "Riya",
    [1, 0, 2, 1, 1],
  ]);
  const walker = await createUser(db, { anonymous: true });
  const { attempt_id } = await rpc<{ attempt_id: string }>(db, walker, "start_attempt", [
    road.code,
    "Dev",
  ]);
  for (let i = 0; i < 5; i++) await rpc(db, walker, "answer_question", [attempt_id, 1]);

  // A Same Brain game with 2 players and a Killer game with 4.
  const sb = await rpc<{ code: string }>(db, owner, "create_room", ["same_brain", "Riya"]);
  await rpc(db, await createUser(db, { anonymous: true }), "join_room", [sb.code, "Aarav"]);
  await rpc(db, owner, "start_room", [sb.code]);
  const host = await createUser(db);
  const k = await rpc<{ code: string }>(db, host, "create_room", ["killer", "Anurag"]);
  for (const n of ["A", "B", "C"]) {
    await rpc(db, await createUser(db, { anonymous: true }), "join_room", [k.code, n]);
  }
  await rpc(db, host, "start_room", [k.code]);

  // One paid and one abandoned checkout.
  await as(
    db,
    "service_role",
    `insert into public.purchases (user_id, product, quiz_id, amount_paise, status, paid_at)
     values ($1, 'full_board', $2, 4900, 'paid', now()), ($1, 'lock_retries', $2, 2900, 'created', null)`,
    [owner.id, quiz.id],
  );
}, 120_000);

describe("admin stats", () => {
  it("counts people, plays per game and payments", async () => {
    const s = await rpc<Stats>(db, admin, "admin_stats");
    expect(s.people.accounts).toBe(3);
    expect(s.people.guests).toBe(8);
    expect(s.quiz).toMatchObject({
      created: 1,
      plays: 2,
      started: 3,
      players: 2,
      played_at_least_once: 1,
    });
    expect(s.road).toMatchObject({ created: 1, plays: 1 });
    expect(s.party.rooms).toBe(2);
    expect(s.party.games).toEqual({
      same_brain: { games: 1, games_week: 1, avg_players: 2 },
      killer: { games: 1, games_week: 1, avg_players: 4 },
    });
    expect(s.payments).toMatchObject({
      paid: 1,
      paid_paise: 4900,
      abandoned: 1,
      by_product: { full_board: 1 },
    });
    expect(s.daily).toHaveLength(14);
    expect(s.daily.at(-1)).toMatchObject({ quizzes: 1, quiz_plays: 2, party_games: 2 });
  });

  it("is only for listed admins", async () => {
    const someone = await createUser(db);
    await expect(rpc(db, someone, "admin_stats")).rejects.toThrow("not_allowed");
    expect(await rpc(db, someone, "is_app_admin")).toBe(false);
    expect(await rpc(db, admin, "is_app_admin")).toBe(true);
    await expect(rpc(db, "anon", "admin_stats")).rejects.toThrow(/permission denied/);
    await expect(as(db, someone, "select * from public.app_admins")).rejects.toThrow(
      /permission denied/,
    );
  });
});
