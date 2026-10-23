import { describe, expect, it } from "vitest";
import {
  answeredCount,
  draftFromAi,
  draftFromSaved,
  draftForTopics,
  editItem,
  fillName,
  resetItem,
  toTemplate,
  viewItem,
  type BankQuestion,
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

const fullBank: BankQuestion[] = Array.from({ length: 15 }, (_, i) => ({
  id: `q${i}`,
  prompt_self: `My thing ${i}?`,
  prompt_other: `{name}'s thing ${i}?`,
  options: ["A", "B", "C", "D"],
}));
const byId = new Map(fullBank.map((q) => [q.id, q]));

describe("editing a question", () => {
  it("sends edited wording and options for a bank question", () => {
    let draft = setAnswer(startDraft(fullBank, 10, seeded()), 0, 1);
    draft = editItem(
      draft,
      0,
      { promptSelf: null, promptOther: " {name}'s new wording? ", options: ["W", "X", "Y", "Z "] },
      byId,
    );
    expect(viewItem(draft[0], byId)).toMatchObject({
      promptSelf: null,
      promptOther: "{name}'s new wording?",
      options: ["W", "X", "Y", "Z"],
      edited: true,
    });
    draft.forEach((_, i) => (draft = setAnswer(draft, i, 1)));
    expect(toRpcItems(draft)[0]).toEqual({
      question_id: draft[0].questionId,
      correct_option: 1,
      prompt_other: "{name}'s new wording?",
      options: ["W", "X", "Y", "Z"],
    });
  });

  it("keeps the first-person wording when only the options change", () => {
    const draft = startDraft(fullBank, 10, seeded());
    const q = byId.get(draft[2].questionId!)!;
    const edited = editItem(
      draft,
      2,
      { promptSelf: null, promptOther: q.prompt_other, options: ["1", "2", "3", "4"] },
      byId,
    );
    expect(viewItem(edited[2], byId)?.promptSelf).toBe(q.prompt_self);
  });

  it("turns back into a plain bank question when edited back, and on reset", () => {
    const draft = startDraft(fullBank, 10, seeded());
    const q = byId.get(draft[0].questionId!)!;
    const changed = editItem(
      draft,
      0,
      { promptSelf: null, promptOther: "Hi {name}?", options: q.options },
      byId,
    );
    expect(changed[0].text).toBeDefined();
    const back = editItem(
      changed,
      0,
      { promptSelf: null, promptOther: q.prompt_other, options: q.options },
      byId,
    );
    expect(back[0].text).toBeUndefined();
    expect(resetItem(changed, 0)[0]).toEqual({ key: draft[0].key, questionId: q.id, answer: null });
  });
});

describe("AI questions", () => {
  const gen = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      promptSelf: `My AI ${i}?`,
      promptOther: `{name}'s AI ${i}?`,
      options: ["A", "B", "C", "D"],
    }));

  it("fills the page and tops it up from the bank", () => {
    const draft = draftFromAi(gen(7), fullBank, 10, seeded());
    expect(draft).toHaveLength(10);
    expect(draft.slice(0, 7).every((d) => d.source === "ai" && d.questionId === null)).toBe(true);
    expect(new Set(draft.slice(7).map((d) => d.questionId)).size).toBe(3);
    expect(new Set(draft.map((d) => d.key)).size).toBe(10);
  });

  it("sends own questions with their source", () => {
    let draft = draftFromAi(gen(10), fullBank, 10, seeded());
    draft.forEach((_, i) => (draft = setAnswer(draft, i, 3)));
    expect(toRpcItems(draft)[0]).toEqual({
      source: "ai",
      correct_option: 3,
      prompt_self: "My AI 0?",
      prompt_other: "{name}'s AI 0?",
      options: ["A", "B", "C", "D"],
    });
  });

  it("swapping an AI question brings in an unused bank question", () => {
    const draft = draftFromAi(gen(10), fullBank, 10, seeded());
    const swapped = swapQuestion(draft, 4, fullBank, seeded(3));
    expect(swapped[4].questionId).toMatch(/^q\d+$/);
    expect(swapped[4].text).toBeUndefined();
  });
});

describe("toTemplate", () => {
  it("swaps the creator's name for the placeholder, whole words only", () => {
    expect(toTemplate("What's Riya's go-to snack?", "Riya")).toBe("What's {name}'s go-to snack?");
    expect(toTemplate("Does Riyaan like Riya?", "Riya")).toBe("Does Riyaan like {name}?");
    expect(toTemplate("No name here", "")).toBe("No name here");
    expect(fillName(toTemplate("Is A.J. late?", "A.J."), "Sam")).toBe("Is Sam late?");
  });
});

describe("draftFromSaved", () => {
  it("restores bank, edited and own questions for editing", () => {
    const draft = draftFromSaved(
      [
        {
          question_id: "q1",
          prompt: "{name}'s thing 1?",
          prompt_self: "My thing 1?",
          options: ["A", "B", "C", "D"],
          correct_option: 2,
          source: "bank",
        },
        {
          question_id: "q2",
          prompt: "Edited {name}?",
          prompt_self: null,
          options: ["A", "B", "C", "D"],
          correct_option: 1,
          source: "edited",
        },
        {
          question_id: null,
          prompt: "AI {name}?",
          prompt_self: "AI me?",
          options: ["W", "X", "Y", "Z"],
          correct_option: 0,
          source: "ai",
        },
        {
          question_id: "gone",
          prompt: "Old {name}?",
          prompt_self: "Old me?",
          options: ["A", "B", "C", "D"],
          correct_option: 3,
          source: "bank",
        },
      ],
      byId,
    );
    expect(draft.map((d) => [d.questionId, d.answer, d.source ?? null, Boolean(d.text)])).toEqual([
      ["q1", 2, null, false],
      ["q2", 1, null, true],
      [null, 0, "ai", true],
      [null, 3, "custom", true],
    ]);
  });
});

describe("topics", () => {
  const topical = Array.from({ length: 40 }, (_, i) => ({
    id: `t${i}`,
    topic: ["movies", "money", "food", "tech"][i % 4],
  }));
  const topicOf = (id: string | null) => topical.find((q) => q.id === id)?.topic;

  it("fills the page from one topic", () => {
    const draft = draftForTopics(topical, ["movies"], 10, seeded());
    expect(draft).toHaveLength(10);
    expect(draft.every((d) => topicOf(d.questionId) === "movies")).toBe(true);
    expect(new Set(draft.map((d) => d.questionId)).size).toBe(10);
  });

  it("mixes two topics evenly", () => {
    const draft = draftForTopics(topical, ["movies", "money"], 10, seeded());
    const movies = draft.filter((d) => topicOf(d.questionId) === "movies").length;
    expect(movies).toBe(5);
  });

  it("tops up from other topics when a topic runs short", () => {
    const small = [
      ...topical.slice(0, 8),
      { id: "x1", topic: "rare" },
      { id: "x2", topic: "rare" },
    ];
    const draft = draftForTopics(small, ["rare"], 10, seeded());
    expect(
      draft
        .slice(0, 2)
        .map((d) => d.questionId)
        .sort(),
    ).toEqual(["x1", "x2"]);
    expect(draft).toHaveLength(10);
  });

  it("swaps within the chosen topics while any are left", () => {
    const draft = draftForTopics(topical, ["food"], 9, seeded());
    const swapped = swapQuestion(draft, 0, topical, seeded(5), ["food"]);
    expect(topicOf(swapped[0].questionId)).toBe("food");
    expect(swapped[0].questionId).not.toBe(draft[0].questionId);
  });
});
