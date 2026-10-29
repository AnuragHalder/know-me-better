// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
}, 60_000);

interface KillerView {
  status: string;
  phase: string | null;
  round: number;
  players: { name: string; score: number; alive: boolean }[];
  killer: {
    role: "killer" | "police" | "villager";
    alive: boolean;
    kills: number;
    kills_needed: number;
    kill_ready_in: number | null;
    deaths: { name: string; after_seconds: number }[];
    my_suspect: string | null;
    suspects: { name: string; count: number }[] | null;
    result: {
      winner: "killer" | "village";
      reason: string;
      accused: string | null;
      roles: {
        name: string;
        role: string;
        alive: boolean;
        suspect: string | null;
        points: number;
      }[];
    } | null;
  } | null;
  awards: { title: string; name: string; detail: string }[] | null;
}

const NAMES = ["Anurag", "Meera", "Kabir", "Zoya", "Aarav", "Riya", "Dev", "Tara"];

/** A started Killer room with n players; returns each player and their dealt role. */
async function game(n = 6) {
  const host = await createUser(db);
  const { code } = await rpc<{ code: string }>(db, host, "create_room", ["killer", NAMES[0]]);
  const users: Record<string, TestUser> = { [NAMES[0]]: host };
  for (const name of NAMES.slice(1, n)) {
    const g = await createUser(db, { anonymous: true });
    await rpc(db, g, "join_room", [code, name]);
    users[name] = g;
  }
  await rpc(db, host, "start_room", [code]);
  return { code, host, users, ...(await roles(code)) };
}

/** Who got which role in the current round (read as the database owner). */
async function roles(code: string) {
  const rows = (
    await db.query<{ name: string; role: string }>(
      `select p.name, r.role from public.room_roles r
       join public.rooms m on m.id = r.room_id and m.game_no = r.game_no and m.round = r.round_no
       join public.room_players p on p.room_id = r.room_id and p.user_id = r.user_id
       where m.code = $1`,
      [code],
    )
  ).rows;
  const of = (role: string) => rows.filter((r) => r.role === role).map((r) => r.name);
  return { killer: of("killer")[0], police: of("police")[0], villagers: of("villager") };
}

/** Pretend `secs` seconds have passed since the round started and the last kill. */
async function wait(code: string, secs = 11) {
  const room = `(select id from public.rooms where code = '${code}')`;
  await db.query(
    `update public.room_rounds set started_at = started_at - make_interval(secs => ${secs}) where room_id = ${room}`,
  );
  await db.query(
    `update public.room_roles set dead_at = dead_at - make_interval(secs => ${secs}) where room_id = ${room} and dead_at is not null`,
  );
}

const view = (u: TestUser, code: string) => rpc<KillerView>(db, u, "room_state", [code]);

describe("Killer", () => {
  it("needs 4 players and keeps roles out of reach", async () => {
    const host = await createUser(db);
    const { code } = await rpc<{ code: string }>(db, host, "create_room", ["killer", "Anurag"]);
    for (const name of ["Meera", "Kabir"]) {
      await rpc(db, await createUser(db, { anonymous: true }), "join_room", [code, name]);
    }
    await expect(rpc(db, host, "start_room", [code])).rejects.toThrow("need_players");
    await expect(as(db, host, "select * from public.room_roles")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("deals 1 killer, 1 police and the rest villagers; each phone sees only its own role", async () => {
    const g = await game(6);
    expect(g.villagers).toHaveLength(4);
    for (const [name, user] of Object.entries(g.users)) {
      const v = await view(user, g.code);
      const expected = name === g.killer ? "killer" : name === g.police ? "police" : "villager";
      expect(v.killer?.role).toBe(expected);
      expect(v.killer?.kills_needed).toBe(2);
      expect(v.killer?.result).toBeNull();
      // Nobody but the police gets the tip sheet; nobody's view names another role.
      expect(v.killer?.suspects === null).toBe(expected !== "police");
      expect(JSON.stringify(v.players)).not.toMatch(/killer|police|villager/);
    }
  });

  it("makes the killer wait 10 seconds between kills and wins at 2 kills", async () => {
    const g = await game(6);
    const killer = g.users[g.killer];
    const [v1, v2] = g.villagers;
    await expect(rpc(db, killer, "killer_kill", [g.code, v1])).rejects.toThrow("too_soon");
    expect((await view(killer, g.code)).killer?.kill_ready_in).toBeGreaterThan(0);

    await wait(g.code);
    const after1 = await rpc<KillerView>(db, killer, "killer_kill", [g.code, v1]);
    expect(after1.killer?.kills).toBe(1);
    expect(after1.killer?.deaths.map((d) => d.name)).toEqual([v1]);
    await expect(rpc(db, killer, "killer_kill", [g.code, v2])).rejects.toThrow("too_soon");

    // The victim is out but isn't told who did it.
    const victim = await view(g.users[v1], g.code);
    expect(victim.killer).toMatchObject({ role: "villager", alive: false, result: null });
    await expect(rpc(db, g.users[v1], "killer_suspect", [g.code, g.killer])).rejects.toThrow(
      "not_your_move",
    );
    await expect(rpc(db, killer, "killer_kill", [g.code, v1])).rejects.toThrow("invalid_target");

    await wait(g.code);
    const end = await rpc<KillerView>(db, killer, "killer_kill", [g.code, v2]);
    expect(end.phase).toBe("reveal");
    expect(end.killer?.result).toMatchObject({ winner: "killer", reason: "kills" });
    expect(end.players.find((p) => p.name === g.killer)?.score).toBe(1000);
  });

  it("catches the killer who goes for the police", async () => {
    const g = await game(5);
    await wait(g.code);
    const end = await rpc<KillerView>(db, g.users[g.killer], "killer_kill", [g.code, g.police]);
    expect(end.killer?.result).toMatchObject({ winner: "village", reason: "caught_police" });
    const score = (n: string) => end.players.find((p) => p.name === n)?.score;
    expect(score(g.police)).toBe(500);
    expect(score(g.villagers[0])).toBe(300);
    expect(score(g.killer)).toBe(0);
  });

  it("gives the police one accusation: right wins, wrong loses", async () => {
    const right = await game(4);
    const won = await rpc<KillerView>(db, right.users[right.police], "killer_accuse", [
      right.code,
      right.killer,
    ]);
    expect(won.killer?.result).toMatchObject({
      winner: "village",
      reason: "accused_right",
      accused: right.killer,
    });

    const wrong = await game(4);
    const lost = await rpc<KillerView>(db, wrong.users[wrong.police], "killer_accuse", [
      wrong.code,
      wrong.villagers[0],
    ]);
    expect(lost.killer?.result).toMatchObject({ winner: "killer", reason: "accused_wrong" });
    expect(lost.players.find((p) => p.name === wrong.killer)?.score).toBe(1000);
  });

  it("lets villagers mark suspects that only the police can count", async () => {
    const g = await game(6);
    const [a, b, c] = g.villagers;
    await rpc(db, g.users[a], "killer_suspect", [g.code, g.killer]);
    await rpc(db, g.users[b], "killer_suspect", [g.code, g.killer]);
    const cv = await rpc<KillerView>(db, g.users[c], "killer_suspect", [g.code, a]);
    expect(cv.killer?.my_suspect).toBe(a);

    const police = await view(g.users[g.police], g.code);
    expect(police.killer?.suspects).toEqual([
      { name: g.killer, count: 2 },
      { name: a, count: 1 },
    ]);
    expect((await view(g.users[g.killer], g.code)).killer?.suspects).toBeNull();

    // Only the right moves for each role.
    await expect(rpc(db, g.users[a], "killer_kill", [g.code, b])).rejects.toThrow("not_your_move");
    await expect(rpc(db, g.users[a], "killer_accuse", [g.code, b])).rejects.toThrow(
      "not_your_move",
    );
    await expect(rpc(db, g.users[g.killer], "killer_accuse", [g.code, a])).rejects.toThrow(
      "not_your_move",
    );
    await expect(rpc(db, g.users[a], "killer_suspect", [g.code, a])).rejects.toThrow(
      "invalid_target",
    );

    const end = await rpc<KillerView>(db, g.users[g.police], "killer_accuse", [g.code, g.killer]);
    const score = (n: string) => end.players.find((p) => p.name === n)?.score;
    expect(score(a)).toBe(500); // alive +300, right suspect +200
    expect(score(c)).toBe(300);
    expect(score(g.police)).toBe(1000);
  });

  it("lets the village win when the 3 minutes run out", async () => {
    const g = await game(4);
    await db.query(
      "update public.rooms set phase_ends_at = now() - interval '1 second' where code = $1",
      [g.code],
    );
    const v = await view(g.host, g.code);
    expect(v.killer?.result).toMatchObject({ winner: "village", reason: "time" });
  });

  it("needs 3 kills with 7 or more players", async () => {
    const g = await game(7);
    expect((await view(g.host, g.code)).killer?.kills_needed).toBe(3);
  });

  it("deals new roles each round and ends with awards", async () => {
    const g = await game(4);
    let code = g.code;
    for (let round = 1; round <= 5; round++) {
      const r = await roles(code);
      const police = Object.entries(g.users).find(([n]) => n === r.police)![1];
      await rpc(db, police, "killer_accuse", [code, r.killer]);
      const after = await rpc<KillerView>(db, g.host, "next_room_round", [code]);
      if (round < 5) expect(after).toMatchObject({ round: round + 1, phase: "night" });
      else {
        expect(after.status).toBe("done");
        expect(after.awards?.[0]).toMatchObject({ title: "Sharpest police" });
      }
      code = g.code;
    }
  });
});
