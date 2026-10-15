import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth-errors";

describe("friendlyAuthError", () => {
  it.each([
    ["Email rate limit exceeded", /Wait a minute/],
    ["For security purposes, you can only request this after 42 seconds.", /Wait a minute/],
    ["Token has expired or is invalid", /wrong or has expired/],
    ["Unsupported provider: provider is not enabled", /Google sign-in isn't switched on/],
    ["Unable to validate email address: invalid format", /email address doesn't look right/],
    ["Failed to fetch", /connection/],
    [undefined, /Try again/],
  ])("explains %j", (input, expected) => {
    expect(friendlyAuthError(input)).toMatch(expected);
  });
});
