import { describe, expect, it } from "vitest";
import { optionsProblem, promptProblem } from "./validate";

describe("promptProblem", () => {
  it("accepts 3 to 140 characters", () => {
    expect(promptProblem("Hi?")).toBeNull();
    expect(promptProblem("  a ")).toMatch(/at least 3/);
    expect(promptProblem("x".repeat(141))).toMatch(/140/);
  });
});

describe("optionsProblem", () => {
  it("needs 4 distinct, non-empty, short options", () => {
    expect(optionsProblem(["A", "B", "C", "D"])).toBeNull();
    expect(optionsProblem(["A", "B", "C"])).toMatch(/exactly 4/);
    expect(optionsProblem(["A", "", "C", "D"])).toMatch(/all 4/);
    expect(optionsProblem(["Tea", "tea ", "C", "D"])).toMatch(/different/);
    expect(optionsProblem(["A", "B", "C", "x".repeat(61)])).toMatch(/60/);
  });
});
