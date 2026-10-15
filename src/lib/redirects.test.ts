import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirects";

describe("safeNextPath", () => {
  it.each([
    ["/me", "/me"],
    ["/play/ABC123?x=1", "/play/ABC123?x=1"],
    [null, "/me"],
    ["", "/me"],
    ["https://evil.example", "/me"],
    ["//evil.example", "/me"],
    ["/\\evil.example", "/me"],
    ["javascript:alert(1)", "/me"],
    ["/me\n/x", "/me"],
  ])("turns %j into %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
