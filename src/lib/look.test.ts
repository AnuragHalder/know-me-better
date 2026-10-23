import { describe, expect, it } from "vitest";
import { effectiveLook, parseLook } from "./look";

describe("look", () => {
  it("reads only known values", () => {
    expect(parseLook("clean")).toBe("clean");
    expect(parseLook("notebook")).toBe("notebook");
    expect(parseLook("neon")).toBeNull();
    expect(parseLook(undefined)).toBeNull();
  });

  it("prefers the visitor's choice, then the quiz's, then clean", () => {
    expect(effectiveLook(null)).toBe("clean");
    expect(effectiveLook(null, "notebook")).toBe("notebook");
    expect(effectiveLook("clean", "notebook")).toBe("clean");
    expect(effectiveLook("notebook")).toBe("notebook");
  });
});
