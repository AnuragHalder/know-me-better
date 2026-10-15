import { describe, expect, it } from "vitest";
import {
  answeredCount,
  fillName,
  setAnswer,
  shuffle,
  startDraft,
  swapQuestion,
  toRpcItems,
} from "./build";

const bank = Array.from({ length: 15 }, (_, i) => ({ id: `q${i}` }));

/** Deterministic pseudo-random numbers for repeatable tests. */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe("shuffle", () => {
  it("keeps every item exactly once", () => {
    const out = shuffle(bank, seeded());
    expect(out).toHaveLength(15);
    expect(new Set(out.map((q) => q.id)).size).toBe(15);
  });
});

describe("startDraft", () => {
  it("picks 10 different unanswered questions", () => {
    const draft = startDraft(bank, 10, seeded());
    expect(draft).toHaveLength(10);
    expect(new Set(draft.map((d) => d.questionId)).size).toBe(10);
    expect(draft.every((d) => d.answer === null)).toBe(true);
  });

  it("refuses a bank that is too small", () => {
    expect(() => startDraft(bank.slice(0, 5))).toThrow(RangeError);
  });
});

describe("swapQuestion", () => {
  it("replaces one slot with an unused question and clears its answer", () => {
    const draft = setAnswer(startDraft(bank, 10, seeded()), 3, 2);
    const swapped = swapQuestion(draft, 3, bank, seeded(7));
    expect(swapped[3].questionId).not.toBe(draft[3].questionId);
    expect(draft.map((d) => d.questionId)).not.toContain(swapped[3].questionId);
    expect(swapped[3].answer).toBeNull();
    expect(swapped.filter((_, i) => i !== 3)).toEqual(draft.filter((_, i) => i !== 3));
  });

  it("does nothing when every bank question is already used", () => {
    const draft = startDraft(bank, 15, seeded());
    expect(swapQuestion(draft, 0, bank)).toEqual(draft);
  });
});

describe("answers", () => {
  it("counts answers and converts to the database shape", () => {
    let draft = startDraft(bank, 10, seeded());
    expect(answeredCount(draft)).toBe(0);
    expect(() => toRpcItems(draft)).toThrow(/Question 1/);
    draft.forEach((_, i) => (draft = setAnswer(draft, i, i % 4)));
    expect(answeredCount(draft)).toBe(10);
    expect(toRpcItems(draft)[5]).toEqual({ question_id: draft[5].questionId, correct_option: 1 });
  });
});

describe("fillName", () => {
  it("puts the name into every slot", () => {
    expect(fillName("{name}'s usual chai order?", "Riya")).toBe("Riya's usual chai order?");
    expect(fillName("When {name} is angry, {name} …", "Kabir")).toBe(
      "When Kabir is angry, Kabir …",
    );
  });
});
