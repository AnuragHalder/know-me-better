import { describe, expect, it } from "vitest";
import { verdict } from "./verdict";

describe("verdict", () => {
  it.each([
    [10, "Soulmate level"],
    [9, "Best friend"],
    [8, "Best friend"],
    [5, "Good friend"],
    [3, "Acquaintance"],
    [2, "Who are you?"],
    [0, "Who are you?"],
  ])("gives %i/10 the stamp %s", (score, expected) => {
    expect(verdict(score)).toBe(expected);
  });

  it("clamps scores outside the range", () => {
    expect(verdict(14)).toBe("Soulmate level");
    expect(verdict(-3)).toBe("Who are you?");
  });

  it("rejects a zero total", () => {
    expect(() => verdict(1, 0)).toThrow(RangeError);
  });
});
