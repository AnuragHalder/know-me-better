// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;
let bank: { id: string; options: string[]; prompt_other: string }[];

beforeAll(async () => {
  db = await freshDb();
  bank = (
    await db.query<{ id: string; options: string[]; prompt_other: string }>(
      "select id, options, prompt_other from public.questions where active order by sort",
    )
  ).rows;
}, 60_000);

const own = (n: number, source: "ai" | "custom" = "ai") => ({
  source,
  correct_option: 2,
  prompt_self: `My favourite thing number ${n}?`,
  prompt_other: `{name}'s favourite thing number ${n}?`,
  options: ["Alpha", "Bravo", "Charlie", "Delta"],
});

function mixed() {
  return [
    own(1),
    own(2, "custom"),
    { question_id: bank[0].id, correct_option: 1, options: ["Tea", "Coffee", "Juice", "Water"] },
    ...bank.slice(1, 8).map((q) => ({ question_id: q.id, correct_option: 0 })),
  ];
}

async function create(owner: TestUser, items: unknown[]) {
  return rpc<{ id: string; code: string }>(db, owner, "create_quiz", [
    "Riya",
    JSON.stringify(items),
  ]);
}

describe("questions in the creator's own words", () => {
  it("saves AI, custom and edited questions with their own text", async () => {
    const owner = await createUser(db);
    const quiz = await create(owner, mixed());
    const rows = await as<{
      source: string;
      prompt: string;
      prompt_self: string | null;
      options: string[];
      question_id: string | null;
    }>(
      db,
      owner,
      "select source, prompt, prompt_self, options, question_id from public.quiz_questions where quiz_id = $1 order by position",
      [quiz.id],
    );
    expect(rows.map((r) => r.source)).toEqual(["ai", "custom", "edited", ...Array(7).fill("bank")]);
    expect(rows[0]).toMatchObject({
      question_id: null,
      prompt: "{name}'s favourite thing number 1?",
      prompt_self: "My favourite thing number 1?",
    });
    expect(rows[2].options).toEqual(["Tea", "Coffee", "Juice", "Water"]);
    expect(rows[2].question_id).toBe(bank[0].id);
  });

  it("lets friends play own questions, still without seeing answers", async () => {
    const owner = await createUser(db);
    const quiz = await create(owner, mixed());
    const friend = await createUser(db, { anonymous: true });
    const forPlay = await rpc<{ questions: { prompt: string; options: string[] }[] }>(
      db,
      friend,
      "get_quiz_for_play",
      [quiz.code],
    );
    expect(forPlay.questions[0].prompt).toBe("{name}'s favourite thing number 1?");
    expect(JSON.stringify(forPlay)).not.toContain("correct");

    const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
      quiz.code,
      "Meera",
    ]);
    const first = await rpc(db, friend, "answer_question", [attempt_id, 2]);
    expect(first).toMatchObject({ is_correct: true });
    expect(first).not.toHaveProperty("correct_option");
  });

  it.each([
    ["three options", { ...own(9), options: ["A", "B", "C"] }, "invalid_options"],
    ["repeated options", { ...own(9), options: ["Tea", "tea", "C", "D"] }, "invalid_options"],
    ["an empty option", { ...own(9), options: ["A", " ", "C", "D"] }, "invalid_options"],
    [
      "an option over 60 characters",
      { ...own(9), options: ["A", "B", "C", "x".repeat(61)] },
      "invalid_options",
    ],
    [
      "a question over 140 characters",
      { ...own(9), prompt_other: "x".repeat(141) },
      "invalid_text",
    ],
    [
      "no options at all",
      { source: "custom", correct_option: 0, prompt_other: "Hi {name}?" },
      "invalid_questions",
    ],
    ["an answer outside 0–3", { ...own(9), correct_option: 4 }, "invalid_questions"],
  ])("rejects %s", async (_label, bad, error) => {
    const owner = await createUser(db);
    const items = [bad, ...bank.slice(0, 9).map((q) => ({ question_id: q.id, correct_option: 0 }))];
    await expect(create(owner, items)).rejects.toThrow(error as string);
  });

  it("lets the owner switch a quiz to own questions with update_quiz", async () => {
    const owner = await createUser(db);
    const quiz = await create(
      owner,
      bank.slice(0, 10).map((q) => ({ question_id: q.id, correct_option: 0 })),
    );
    await rpc(db, owner, "update_quiz", [quiz.id, "Riya", JSON.stringify(mixed())]);
    const [{ n }] = await as<{ n: number }>(
      db,
      owner,
      "select count(*)::int as n from public.quiz_questions where quiz_id = $1 and source <> 'bank'",
      [quiz.id],
    );
    expect(n).toBe(3);
  });
});

describe("AI questions: Pro or one ad per generation", () => {
  async function backdate(adId: string, seconds = 20) {
    await db.query(
      `update public.ad_sessions set started_at = now() - make_interval(secs => $2) where id = $1`,
      [adId, seconds],
    );
  }

  async function watchAd(user: TestUser) {
    const ad = await rpc<{ id: string; seconds: number }>(db, user, "start_ad_session");
    await backdate(ad.id);
    return rpc<{ credits: number; ads_left: number }>(db, user, "complete_ad_session", [ad.id]);
  }

  it("asks a free user to watch an ad, then allows exactly one generation", async () => {
    const user = await createUser(db);
    expect(await rpc(db, user, "ai_status")).toEqual({ pro: false, credits: 0, ads_left: 3 });

    const before = await rpc<{ allowed: boolean; reason: string }>(
      db,
      user,
      "claim_ai_generation",
      ["cricket, chai"],
    );
    expect(before).toMatchObject({ allowed: false, reason: "needs_unlock", ads_left: 3 });

    expect(await watchAd(user)).toMatchObject({ credits: 1, ads_left: 2 });

    const claim = await rpc<{ allowed: boolean; id: string; via: string }>(
      db,
      user,
      "claim_ai_generation",
      ["cricket, chai"],
    );
    expect(claim).toMatchObject({ allowed: true, via: "ad" });

    const again = await rpc<{ allowed: boolean }>(db, user, "claim_ai_generation", ["cricket"]);
    expect(again.allowed).toBe(false);

    await rpc(db, user, "finish_ai_generation", [claim.id, true]);
    const [log] = await as<{ status: string }>(
      db,
      user,
      "select status from public.ai_generations where id = $1",
      [claim.id],
    );
    expect(log.status).toBe("ok");
  });

  it("doesn't count an ad closed before 15 seconds", async () => {
    const user = await createUser(db);
    const ad = await rpc<{ id: string }>(db, user, "start_ad_session");
    await expect(rpc(db, user, "complete_ad_session", [ad.id])).rejects.toThrow("ad_too_short");
  });

  it("gives the ad credit back if generation fails", async () => {
    const user = await createUser(db);
    await watchAd(user);
    const claim = await rpc<{ id: string }>(db, user, "claim_ai_generation", ["music"]);
    await rpc(db, user, "finish_ai_generation", [claim.id, false]);
    expect(await rpc(db, user, "ai_status")).toMatchObject({ credits: 1 });
    const retry = await rpc<{ allowed: boolean }>(db, user, "claim_ai_generation", ["music"]);
    expect(retry.allowed).toBe(true);
  });

  it("allows at most 3 ad unlocks a day", async () => {
    const user = await createUser(db);
    for (let i = 0; i < 3; i++) await watchAd(user);
    await expect(rpc(db, user, "start_ad_session")).rejects.toThrow("ad_limit");
  });

  it("lets Pro members generate without ads", async () => {
    const user = await createUser(db);
    await as(
      db,
      "service_role",
      `insert into public.purchases (user_id, product, amount_paise, status, expires_at)
       values ($1, 'pro_monthly', 9900, 'paid', now() + interval '30 days')`,
      [user.id],
    );
    expect(await rpc(db, user, "ai_status")).toMatchObject({ pro: true });
    const claim = await rpc<{ allowed: boolean; via: string }>(db, user, "claim_ai_generation", [
      "travel",
    ]);
    expect(claim).toMatchObject({ allowed: true, via: "pro" });
  });

  it("is closed to guests, and nobody can grant themselves credits", async () => {
    const guest = await createUser(db, { anonymous: true });
    await expect(rpc(db, guest, "start_ad_session")).rejects.toThrow("sign_in_required");
    await expect(rpc(db, guest, "claim_ai_generation", ["x"])).rejects.toThrow("sign_in_required");

    const user = await createUser(db);
    await expect(
      as(
        db,
        user,
        "insert into public.ad_sessions (user_id, started_at, completed_at) values ($1, now(), now())",
        [user.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, user, "update public.ad_sessions set consumed_at = null")).rejects.toThrow(
      /permission denied/,
    );
  });
});
