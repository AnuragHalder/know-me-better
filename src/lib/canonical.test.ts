import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "./canonical";

const prod = { canonicalHost: "whoknowsmebetter.in", vercelEnv: "production" };

describe("canonicalRedirect", () => {
  it("sends the old vercel.app address and www to the main domain, keeping the path", () => {
    expect(canonicalRedirect("know-me-better-sage.vercel.app", "/play/K7PX2Q?x=1", prod)).toBe(
      "https://whoknowsmebetter.in/play/K7PX2Q?x=1",
    );
    expect(canonicalRedirect("www.whoknowsmebetter.in", "/", prod)).toBe(
      "https://whoknowsmebetter.in/",
    );
  });

  it("leaves the main domain, previews and unconfigured setups alone", () => {
    expect(canonicalRedirect("whoknowsmebetter.in", "/", prod)).toBeNull();
    expect(
      canonicalRedirect("know-me-better-abc-team.vercel.app", "/", {
        ...prod,
        vercelEnv: "preview",
      }),
    ).toBeNull();
    expect(
      canonicalRedirect("know-me-better-sage.vercel.app", "/", { vercelEnv: "production" }),
    ).toBeNull();
    expect(canonicalRedirect("localhost:3000", "/", prod)).toBeNull();
  });
});
