import { describe, expect, it } from "vitest";
import { safeNextPath, strayAuthCode } from "./redirects";

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

describe("strayAuthCode", () => {
  const code = "8f14e45f-ceea-467a-9575-1b1c2b6d7e3a";

  it("forwards a sign-in code that landed on the home page to the callback", () => {
    expect(strayAuthCode("/", `?code=${code}`)).toBe(`/auth/callback?code=${code}&next=%2Fme`);
  });

  it("keeps the page it landed on as the place to return to", () => {
    expect(strayAuthCode("/create", `?code=${code}`)).toBe(
      `/auth/callback?code=${code}&next=%2Fcreate`,
    );
  });

  it("leaves the callback itself, pages without a code, and non-sign-in codes alone", () => {
    expect(strayAuthCode("/auth/callback", `?code=${code}`)).toBeNull();
    expect(strayAuthCode("/", "")).toBeNull();
    expect(strayAuthCode("/play", "?code=K7M2QX")).toBeNull();
  });
});
