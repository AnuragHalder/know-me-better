import { describe, expect, it } from "vitest";
import { parseGenerated, topicsProblem, userPrompt } from "./questions";

const good = (i: number) => ({
  prompt_self: `My favourite thing ${i}?`,
  prompt_other: `{name}'s favourite thing ${i}?`,
  options: ["Tea", "Coffee", "Juice", "Water"],
});

describe("parseGenerated", () => {
  it("keeps valid questions, up to 10", () => {
    const out = parseGenerated({ questions: Array.from({ length: 12 }, (_, i) => good(i)) });
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({
      promptSelf: "My favourite thing 0?",
      promptOther: "{name}'s favourite thing 0?",
      options: ["Tea", "Coffee", "Juice", "Water"],
    });
  });

  it("drops malformed, duplicate and placeholder-less questions", () => {
    const out = parseGenerated({
      questions: [
        good(1),
        good(1),
        { ...good(2), options: ["A", "B", "C"] },
        { ...good(3), options: ["A", "a", "B", "C"] },
        { ...good(4), prompt_other: "Riya's favourite?" },
        { ...good(5), prompt_self: 7 },
        "nonsense",
        good(6),
      ],
    });
    expect(out.map((q) => q.promptOther)).toEqual([
      "{name}'s favourite thing 1?",
      "{name}'s favourite thing 6?",
    ]);
  });

  it("returns nothing for junk", () => {
    expect(parseGenerated(null)).toEqual([]);
    expect(parseGenerated({ questions: "x" })).toEqual([]);
  });
});

describe("topics", () => {
  it("needs a short topic list", () => {
    expect(topicsProblem("cricket, chai")).toBeNull();
    expect(topicsProblem(" ")).not.toBeNull();
    expect(topicsProblem("x".repeat(201))).toMatch(/200/);
    expect(userPrompt("  cricket ")).toBe("Topics: cricket");
  });
});
