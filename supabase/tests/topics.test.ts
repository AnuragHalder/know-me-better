// @vitest-environment node
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { TOPICS } from "@/lib/quiz/topics";
import { freshDb } from "./db";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
}, 60_000);

describe("topic packs", () => {
  it("every topic chip has at least 10 active questions, and every question a known topic", async () => {
    const { rows } = await db.query<{ topic: string | null; n: number }>(
      "select topic, count(*)::int as n from public.questions where active group by topic",
    );
    const counts = new Map(rows.map((r) => [r.topic, r.n]));
    for (const t of TOPICS) expect(counts.get(t.id) ?? 0, t.id).toBeGreaterThanOrEqual(10);
    expect(counts.has(null)).toBe(false);
    expect([...counts.keys()].sort()).toEqual(TOPICS.map((t) => t.id).sort());
  });

  it("retires the childish questions from new quizzes only", async () => {
    const { rows } = await db.query<{ id: string }>(
      "select id from public.questions where not active order by id",
    );
    expect(rows.map((r) => r.id)).toEqual(["dessert", "pet", "power", "season"]);
  });
});
