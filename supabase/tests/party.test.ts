// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
}, 60_000);

interface View {
  code: string;
  status: string;
  game: string;
  game_no: number;
  round: number;
  total_rounds: number;
  phase: string | null;
  prompt: string | null;
  subject: string | null;
  is_subject: boolean;
  is_host: boolean;
  my_answer: string | null;
  players: { name: string; score: number; done: boolean; is_me: boolean }[];
  options: { index: number; text: string; mine: boolean }[] | null;
  reveal: {
    skipped?: boolean;
    truth?: string;
    finders?: string[];
    fakes?: { text: string; authors: string[]; fooled: string[]; points: number }[];
    groups?: { text: string; n: number; points: number; names: string[] }[];
  } | null;
  awards: { title: string; name: string; detail: string }[] | null;
}

/** A room with a signed-in host and guests, in join order. */
async function room(game: "fake_it" | "same_brain", guests: string[]) {
  const host = await createUser(db);
  const { code } = await rpc<{ code: string }>(db, host, "create_room", [game, "Anurag"]);
  const players: Record<string, TestUser> = { Anurag: host };
  for (const name of guests) {
    const g = await createUser(db, { anonymous: true });
    await rpc(db, g, "join_room", [code, name]);
    players[name] = g;
  }
  return { code, host, players };
}

const state = (u: TestUser, code: string) => rpc<View>(db, u, "room_state", [code]);
const answer = (u: TestUser, code: string, text: string) =>
  rpc<View>(db, u, "submit_room_answer", [code, text]);
const vote = (u: TestUser, code: string, index: number) =>
  rpc<View>(db, u, "submit_room_vote", [code, index]);

/** Pretend the current phase's timer ran out. */
async function timeUp(code: string) {
  await db.query(
    "update public.rooms set phase_ends_at = now() - interval '1 second' where code = $1",
    [code],
  );
}

describe("party rooms", () => {
  it("keeps every table out of reach; only functions open them", async () => {
    const user = await createUser(db);
    for (const t of ["rooms", "room_players", "room_answers", "room_rounds", "party_prompts"]) {
      await expect(as(db, user, `select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
  });

  it("ships 60 Fake It and 100+ Same Brain prompts; Fake It ones name a player", async () => {
    const rows = (
      await db.query<{ game: string; n: number; named: number }>(
        "select game, count(*)::int as n, count(*) filter (where text like '%{name}%')::int as named from public.party_prompts group by game order by game",
      )
    ).rows;
    expect(rows).toEqual([
      { game: "fake_it", n: 60, named: 60 },
      { game: "same_brain", n: expect.any(Number), named: 0 },
    ]);
    expect(rows[1].n).toBeGreaterThanOrEqual(100);
  });

  it("matches answers whatever the case, spacing, articles or plurals", async () => {
    const norm = async (t: string) =>
      (await db.query<{ n: string }>("select public.party_norm($1) as n", [t])).rows[0].n;
    expect(await norm("  The Umbrellas! ")).toBe("umbrella");
    expect(await norm("umbrella")).toBe("umbrella");
    expect(await norm("Shah Rukh")).toBe(await norm("shah  rukh"));
    expect(await norm("glass")).toBe("glass");
    expect(await norm("boxes")).toBe("box");
    expect(await norm("Potatoes")).toBe(await norm("potato"));
    expect(await norm("shoes")).toBe(await norm("shoe"));
    expect(await norm("buses")).toBe(await norm("bus"));
  });

  it("needs a signed-in host; anyone with the code can preview and guests can join", async () => {
    const guest = await createUser(db, { anonymous: true });
    await expect(rpc(db, guest, "create_room", ["fake_it", "Zoya"])).rejects.toThrow(
      "sign_in_required",
    );
    const { code } = await room("fake_it", ["Meera"]);
    expect(await rpc(db, "anon", "room_preview", [code])).toMatchObject({
      game: "fake_it",
      status: "lobby",
      host_name: "Anurag",
      players: 2,
    });
    await expect(rpc(db, "anon", "join_room", [code, "Kabir"])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses duplicate names, a ninth player, and outsiders", async () => {
    const { code } = await room("same_brain", [
      "Meera",
      "Kabir",
      "Zoya",
      "Aarav",
      "Riya",
      "Dev",
      "Tara",
    ]);
    const late = await createUser(db, { anonymous: true });
    await expect(rpc(db, late, "join_room", [code, "meera"])).rejects.toThrow("name_taken");
    await expect(rpc(db, late, "join_room", [code, "Ishaan"])).rejects.toThrow("room_full");
    await expect(state(late, code)).rejects.toThrow("not_in_room");
  });

  it("needs 3 players for Fake It, and only the host can start", async () => {
    const { code, host, players } = await room("fake_it", ["Meera"]);
    await expect(rpc(db, players.Meera, "start_room", [code])).rejects.toThrow("host_only");
    await expect(rpc(db, host, "start_room", [code])).rejects.toThrow("need_players");
  });

  it("plays a Fake It round: truth and fakes stay hidden until the reveal", async () => {
    const { code, host, players } = await room("fake_it", ["Meera", "Kabir"]);
    const { Meera, Kabir } = players;
    const started = await rpc<View>(db, host, "start_room", [code]);
    expect(started).toMatchObject({
      status: "playing",
      round: 1,
      phase: "write",
      subject: "Anurag",
    });
    expect(started.prompt).toContain("Anurag");
    expect(started.prompt).not.toContain("{name}");

    // Late joiners can't get in once the game is on.
    const late = await createUser(db, { anonymous: true });
    await expect(rpc(db, late, "join_room", [code, "Zoya"])).rejects.toThrow("room_started");

    await answer(host, code, "Potato");
    const meeraView = await answer(Meera, code, "Chintu");
    expect(JSON.stringify(meeraView)).not.toContain("Potato");
    expect(meeraView.players.find((p) => p.name === "Anurag")?.done).toBe(true);

    const voting = await answer(Kabir, code, "Lambu");
    expect(voting.phase).toBe("vote");
    expect(voting.options?.map((o) => o.text).sort()).toEqual(["Chintu", "Lambu", "Potato"]);
    expect(JSON.stringify(voting.options)).not.toMatch(/Anurag|Meera|truth|author/);

    await expect(vote(host, code, 1)).rejects.toThrow("cannot_vote");
    const meeraOptions = (await state(Meera, code)).options!;
    const own = meeraOptions.find((o) => o.text === "Chintu")!;
    expect(own.mine).toBe(true);
    await expect(vote(Meera, code, own.index)).rejects.toThrow("own_answer");

    const idx = (t: string) => meeraOptions.find((o) => o.text === t)!.index;
    await vote(Meera, code, idx("Potato"));
    const revealed = await vote(Kabir, code, idx("Chintu"));

    expect(revealed.phase).toBe("reveal");
    expect(revealed.reveal).toMatchObject({ skipped: false, truth: "Potato", finders: ["Meera"] });
    expect(revealed.reveal?.fakes).toEqual(
      expect.arrayContaining([
        { text: "Chintu", authors: ["Meera"], fooled: ["Kabir"], points: 500, mine: false },
        { text: "Lambu", authors: ["Kabir"], fooled: [], points: 0, mine: true },
      ]),
    );
    // Meera: found it (+500) and fooled Kabir (+500). Anurag: one friend knew him (+250).
    expect(revealed.players.map((p) => [p.name, p.score])).toEqual([
      ["Meera", 1000],
      ["Anurag", 250],
      ["Kabir", 0],
    ]);

    await expect(rpc(db, Meera, "next_room_round", [code])).rejects.toThrow("host_only");
    const next = await rpc<View>(db, host, "next_room_round", [code]);
    expect(next).toMatchObject({ round: 2, phase: "write", subject: "Meera" });
  });

  it("counts a fake that is really the truth as finding it", async () => {
    const { code, host, players } = await room("fake_it", ["Meera", "Kabir"]);
    await rpc(db, host, "start_room", [code]);
    await answer(host, code, "Potato");
    await answer(players.Meera, code, "potatoes");
    const v = await answer(players.Kabir, code, "Lambu");
    expect(v.phase).toBe("vote");
    expect(v.options?.map((o) => o.text).sort()).toEqual(["Lambu", "Potato"]);
    // Meera can't vote again; Kabir's vote closes the round.
    await expect(vote(players.Meera, code, 1)).rejects.toThrow("cannot_vote");
    const meera = await state(players.Meera, code);
    expect(meera.players.find((p) => p.name === "Meera")?.done).toBe(true);
    const done = await vote(
      players.Kabir,
      code,
      v.options!.find((o) => o.text === "Potato")!.index,
    );
    expect(done.reveal?.finders?.sort()).toEqual(["Kabir", "Meera"]);
  });

  it("moves on when time runs out, skipping a round the subject didn't answer", async () => {
    const { code, host, players } = await room("fake_it", ["Meera", "Kabir"]);
    await rpc(db, host, "start_room", [code]);
    await answer(players.Meera, code, "Chintu");
    await timeUp(code);
    const v = await state(players.Kabir, code);
    expect(v.phase).toBe("reveal");
    expect(v.reveal?.skipped).toBe(true);
    await timeUp(code);
    expect(await state(players.Kabir, code)).toMatchObject({ round: 2, phase: "write" });
  });

  it("scores Same Brain matches and ends with awards", async () => {
    const { code, host, players } = await room("same_brain", ["Meera", "Kabir"]);
    await rpc(db, host, "start_room", [code]);
    await answer(host, code, "Umbrella");
    await answer(players.Meera, code, "the umbrellas");
    const r = await answer(players.Kabir, code, "frogs");
    expect(r.phase).toBe("reveal");
    expect(r.reveal?.groups).toEqual([
      { text: "Umbrella", n: 2, points: 200, names: ["Anurag", "Meera"] },
      { text: "frogs", n: 1, points: 0, names: ["Kabir"] },
    ]);

    for (let round = 2; round <= 10; round++) {
      await rpc(db, host, "next_room_round", [code]);
      await answer(host, code, "chai");
      await answer(players.Meera, code, "Chai");
      await answer(players.Kabir, code, `odd ${round}`);
    }
    const end = await rpc<View>(db, host, "next_room_round", [code]);
    expect(end.status).toBe("done");
    expect(end.awards).toEqual([
      {
        title: "Same brain",
        name: expect.stringMatching(/Anurag \+ Meera|Meera \+ Anurag/),
        detail: "matched 10 of 10",
      },
      { title: "On another planet", name: "Kabir", detail: "matched nobody 10 times" },
    ]);

    // Play again: same room, next game, scores back to zero.
    const again = await rpc<View>(db, host, "start_room", [code, "same_brain"]);
    expect(again).toMatchObject({ status: "playing", game_no: 2, round: 1 });
    expect(again.players.every((p) => p.score === 0)).toBe(true);
  });

  it("rejects empty or over-long answers", async () => {
    const { code, host } = await room("same_brain", ["Meera"]);
    await rpc(db, host, "start_room", [code]);
    await expect(answer(host, code, "   ")).rejects.toThrow("invalid_answer");
    await expect(answer(host, code, "!!!")).rejects.toThrow("invalid_answer");
    await expect(answer(host, code, "x".repeat(41))).rejects.toThrow("invalid_answer");
  });
});
