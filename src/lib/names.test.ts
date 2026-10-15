import { describe, expect, it } from "vitest";
import { cleanName, nameProblem } from "./names";

describe("cleanName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanName("   Riya    Sharma  ")).toBe("Riya Sharma");
  });
  it("drops control characters", () => {
    expect(cleanName("Ri\u0000ya\n")).toBe("Riya");
  });
});

describe("nameProblem", () => {
  it("accepts normal names, including non-Latin scripts", () => {
    expect(nameProblem("Meera")).toBeNull();
    expect(nameProblem("मीरा")).toBeNull();
  });
  it("rejects empty and over-long names", () => {
    expect(nameProblem("   ")).toMatch(/Add your name/);
    expect(nameProblem("x".repeat(25))).toMatch(/under 25/);
    expect(nameProblem("x".repeat(24))).toBeNull();
  });
});
