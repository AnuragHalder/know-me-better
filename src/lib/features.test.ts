// @vitest-environment node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURES } from "./features";
import { GAMES } from "./party/room";

const APP = join(__dirname, "..", "app");

/** Top-level pages that aren't features: policies, accounts, plumbing. */
const NOT_FEATURES = new Set([
  "about",
  "actions",
  "api",
  "auth",
  "contact",
  "delivery",
  "login",
  "me",
  "play",
  "pricing",
  "privacy",
  "refunds",
  "terms",
]);

describe("the About page's feature list", () => {
  it("covers every top-level page people start something from", () => {
    const pages = readdirSync(APP, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(APP, d.name, "page.tsx")))
      .map((d) => d.name)
      .filter((name) => !NOT_FEATURES.has(name));
    const listed = new Set(FEATURES.map((f) => f.href.split("/")[1]));
    // A new page? Add it to FEATURES in src/lib/features.ts (or to NOT_FEATURES above).
    expect(pages.filter((p) => !listed.has(p))).toEqual([]);
  });

  it("mentions every party game", () => {
    const party = FEATURES.find((f) => f.id === "party")!.points.join(" ");
    for (const game of Object.values(GAMES)) expect(party).toContain(game.title);
  });
});
