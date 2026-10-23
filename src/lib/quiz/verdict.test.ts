import { describe, expect, it } from "vitest";
import { verdict } from "./verdict";

describe("verdict", () => {
  it.each([
    [10, "Diary-level access"],
    [9, "Scary accurate"],
    [8, "Scary accurate"],
    [5, "Paying attention"],
    [3, "Vaguely familiar"],
    [2, "Total stranger"],
    [0, "Total stranger"],
  ])("gives %i/10 the stamp %s", (score, expected) => {
    expect(verdict(score)).toBe(expected);
  });

  it("clamps scores outside the range", () => {
    expect(verdict(14)).toBe("Diary-level access");
    expect(verdict(-3)).toBe("Total stranger");
  });

  it("rejects a zero total", () => {
    expect(() => verdict(1, 0)).toThrow(RangeError);
  });
});
