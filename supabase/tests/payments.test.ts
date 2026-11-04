// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTS } from "../../src/lib/pricing";
import { as, createUser, freshDb, rpc, type TestUser } from "./db";

let db: PGlite;
let choiceIds: string[];

beforeAll(async () => {
  db = await freshDb();
  choiceIds = (
    await db.query<{ id: string }>(
      "select id from public.questions where active and kind = 'choice' order by sort limit 10",
    )
  ).rows.map((r) => r.id);
}, 60_000);

async function quiz(owner: TestUser) {
  const items = choiceIds.map((id) => ({ question_id: id, correct_option: 0 }));
  return rpc<{ id: string; code: string }>(db, owner, "create_quiz", [
    "Riya",
    JSON.stringify(items),
  ]);
}

async function playThrough(code: string) {
  const friend = await createUser(db, { anonymous: true });
  const { attempt_id } = await rpc<{ attempt_id: string }>(db, friend, "start_attempt", [
    code,
    "Meera",
  ]);
  for (let i = 0; i < 10; i++) await rpc(db, friend, "answer_question", [attempt_id, 1]);
  return friend;
}

let orderSeq = 0;
const newOrder = () => `order_Test${String(++orderSeq).padStart(8, "0")}`;

/** What the server does: check, create the Razorpay order, record it. */
async function buy(user: TestUser, product: string, quizId: string) {
  const { amount_paise } = await rpc<{ amount_paise: number }>(db, user, "purchase_eligibility", [
    product,
    quizId,
  ]);
  const order = newOrder();
  await rpc(db, "service_role", "record_purchase_order", [
    user.id,
    product,
    quizId,
    amount_paise,
    order,
  ]);
  return { order, amount: amount_paise };
}

describe("payments", () => {
  it("charges the same prices as the pricing page", async () => {
    for (const p of PRODUCTS) {
      const [row] = (
        await db.query<{ price: number }>("select public.product_price($1) as price", [p.id])
      ).rows;
      expect([p.id, row.price]).toEqual([p.id, p.amountPaise]);
    }
  });

  it("unlocks a second chance only once the webhook marks it paid", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    const friend = await playThrough(q.code);

    const { order, amount } = await buy(friend, "second_chance", q.id);
    expect(amount).toBe(900);
    // Recorded but unpaid: no second round yet.
    await expect(rpc(db, friend, "start_attempt", [q.code, "Meera"])).rejects.toThrow(
      "already_played",
    );

    expect(
      await rpc(db, "service_role", "mark_purchase_paid", [order, "pay_Test0001", 900]),
    ).toEqual({
      status: "paid",
      changed: true,
    });
    // A repeated webhook changes nothing.
    expect(
      await rpc(db, "service_role", "mark_purchase_paid", [order, "pay_Test0001", 900]),
    ).toEqual({
      status: "paid",
      changed: false,
    });
    await expect(rpc(db, friend, "start_attempt", [q.code, "Meera"])).resolves.toMatchObject({
      attempt_no: 2,
    });
    // The buyer can see their own purchase (that's how the page waits for the webhook).
    const mine = await as<{ status: string }>(
      db,
      friend,
      "select status from public.purchases where razorpay_order_id = $1",
      [order],
    );
    expect(mine).toEqual([{ status: "paid" }]);
  });

  it("refuses second chances that make no sense", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    const stranger = await createUser(db, { anonymous: true });
    await expect(
      rpc(db, stranger, "purchase_eligibility", ["second_chance", q.id]),
    ).rejects.toThrow("play_first");
    await expect(rpc(db, owner, "purchase_eligibility", ["second_chance", q.id])).rejects.toThrow(
      "own_quiz",
    );

    const friend = await playThrough(q.code);
    const { order } = await buy(friend, "second_chance", q.id);
    await rpc(db, "service_role", "mark_purchase_paid", [order, "pay_Test0002", 900]);
    await expect(rpc(db, friend, "purchase_eligibility", ["second_chance", q.id])).rejects.toThrow(
      "already_bought",
    );
  });

  it("lets only the owner lock retries or buy the full leaderboard, once each", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    const friend = await playThrough(q.code);
    await expect(rpc(db, friend, "purchase_eligibility", ["lock_retries", q.id])).rejects.toThrow(
      "quiz_not_found",
    );

    const lock = await buy(owner, "lock_retries", q.id);
    await rpc(db, "service_role", "mark_purchase_paid", [lock.order, "pay_Test0003", 2900]);
    await expect(rpc(db, owner, "purchase_eligibility", ["lock_retries", q.id])).rejects.toThrow(
      "already_bought",
    );
    // With retries locked, friends can't buy a second chance.
    await expect(rpc(db, friend, "purchase_eligibility", ["second_chance", q.id])).rejects.toThrow(
      "retries_locked",
    );

    const board = await buy(owner, "full_board", q.id);
    expect(board.amount).toBe(4900);
    await rpc(db, "service_role", "mark_purchase_paid", [board.order, "pay_Test0004", 4900]);
    await expect(rpc(db, owner, "purchase_eligibility", ["full_board", q.id])).rejects.toThrow(
      "already_bought",
    );
  });

  it("won't sell products that aren't on sale yet", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    for (const p of ["reveal", "pro_monthly", "edition_couples", "nonsense"]) {
      await expect(rpc(db, owner, "purchase_eligibility", [p, q.id])).rejects.toThrow(
        "not_for_sale",
      );
    }
  });

  it("rejects a wrong amount, both when recording and when paying", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    await expect(
      rpc(db, "service_role", "record_purchase_order", [
        owner.id,
        "full_board",
        q.id,
        100,
        newOrder(),
      ]),
    ).rejects.toThrow("amount_mismatch");
    const { order } = await buy(owner, "full_board", q.id);
    await expect(
      rpc(db, "service_role", "mark_purchase_paid", [order, "pay_Test0005", 100]),
    ).rejects.toThrow("amount_mismatch");
    await expect(
      rpc(db, "service_role", "mark_purchase_paid", ["order_Unknown123", "pay_X", 4900]),
    ).rejects.toThrow("order_not_found");
  });

  it("takes the unlock away after a refund; a failure never unlocks", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    const failed = await buy(owner, "full_board", q.id);
    await rpc(db, "service_role", "mark_purchase_failed", [failed.order]);
    const has = async () =>
      (
        await db.query<{ ok: boolean }>("select public.has_unlock($1, 'full_board', $2) as ok", [
          owner.id,
          q.id,
        ])
      ).rows[0].ok;
    expect(await has()).toBe(false);

    // The same order can still succeed on a retry.
    await rpc(db, "service_role", "mark_purchase_paid", [failed.order, "pay_Test0006", 4900]);
    expect(await has()).toBe(true);
    await rpc(db, "service_role", "mark_purchase_refunded", ["pay_Test0006"]);
    expect(await has()).toBe(false);
  });

  it("keeps the money-moving functions away from browsers", async () => {
    const owner = await createUser(db);
    const q = await quiz(owner);
    const { order } = await buy(owner, "full_board", q.id);
    await expect(rpc(db, owner, "mark_purchase_paid", [order, "pay_Hack", 4900])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      rpc(db, owner, "record_purchase_order", [owner.id, "full_board", q.id, 4900, newOrder()]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, owner, "update public.purchases set status = 'paid' where razorpay_order_id = $1", [
        order,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
});
