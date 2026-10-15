import { describe, expect, it } from "vitest";
import { quizErrorMessage } from "./errors";

describe("quizErrorMessage", () => {
  it("explains database codes", () => {
    expect(quizErrorMessage("quiz_has_plays")).toMatch(/already started playing/);
    expect(quizErrorMessage("ERROR: invalid_questions (SQLSTATE 22023)")).toMatch(/Swap it/);
  });
  it("falls back to a general sentence", () => {
    expect(quizErrorMessage("boom")).toMatch(/Try again/);
    expect(quizErrorMessage(undefined)).toMatch(/Try again/);
  });
});
