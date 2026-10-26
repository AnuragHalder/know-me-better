import { describe, expect, it } from "vitest";
import {
  compareRoads,
  endingFor,
  roadInviteText,
  roadResultText,
  roadVerdict,
  routeHeight,
  routePoint,
  splitSentence,
  type Story,
} from "./story";

const opt = (text: string, ending: string) => ({ text, short: text, ending });
const turn = (place: string, a: string, b: string, c: string) => ({
  place,
  scene_self: "s",
  scene_other: "{name} s",
  ask_self: "?",
  ask_other: "{name}?",
  options: [opt("A", a), opt("B", b), opt("C", c)],
});

const STORY: Story = {
  id: "goa_trip",
  title: "The Goa trip that went wrong",
  blurb: "b",
  endings: [
    { key: "palolem", title: "Sunrise at Palolem", line: "" },
    { key: "mom_upi", title: "Rescued by Mom's UPI", line: "" },
    { key: "margao", title: "Stranded at Margao station", line: "" },
    { key: "shack_family", title: "Adopted by the shack family", line: "" },
  ],
  turns: [
    turn("Pune station, 6 am", "margao", "shack_family", "mom_upi"),
    turn("Anjuna, 4 pm", "palolem", "mom_upi", "margao"),
    turn("First night", "margao", "shack_family", "palolem"),
    turn("Baga beach, noon", "margao", "palolem", "mom_upi"),
    turn("Last day", "shack_family", "palolem", "margao"),
  ],
};

describe("endingFor", () => {
  it("goes with the most votes", () => {
    expect(endingFor(STORY, [1, 0, 2, 1, 1])).toBe("palolem");
    expect(endingFor(STORY, [0, 2, 0, 0, 2])).toBe("margao");
  });

  it("breaks a tie with the most recent vote, like the database", () => {
    // shack, palolem, shack, mom, palolem → 2 each; palolem was picked last.
    expect(endingFor(STORY, [1, 0, 1, 2, 1])).toBe("palolem");
  });

  it("has no ending before any choice", () => {
    expect(endingFor(STORY, [])).toBeNull();
  });
});

describe("compareRoads and splitSentence", () => {
  it("counts shared turns and finds the first split", () => {
    const split = compareRoads([1, 0, 2, 1, 1], [1, 0, 1, 2, 1]);
    expect(split).toEqual({ together: 3, total: 5, firstSplit: 2, metAgain: true });
    expect(splitSentence(split, STORY, "Raj")).toBe(
      "You walked with Raj for 2 turns, then split at first night, and found each other again later.",
    );
  });

  it("describes walking every step together, and never meeting", () => {
    expect(splitSentence(compareRoads([1, 2], [1, 2]), STORY, "Raj")).toMatch(/every step/);
    expect(splitSentence(compareRoads([1, 2], [0, 0]), STORY, "Raj")).toMatch(/never once/);
  });

  it("describes a split at the very first turn", () => {
    expect(splitSentence(compareRoads([1, 2, 0], [0, 2, 1]), STORY, "Raj")).toBe(
      "You split from Raj right at the start (pune station, 6 am), and found each other again later.",
    );
  });
});

describe("roadVerdict", () => {
  it.each([
    [5, "Same road, every turn"],
    [3, "Same road, different stops"],
    [2, "Crossed paths"],
    [1, "Different maps"],
    [0, "Different planet"],
  ])("%i of 5 is %s", (score, label) => {
    expect(roadVerdict(score, 5)).toBe(label);
  });
});

describe("share text", () => {
  it("shows the score, the dots and the link, never the creator's ending", () => {
    const text = roadResultText(
      "Raj",
      [true, true, false, false, true],
      "Sunrise at Palolem",
      "https://x/play/ABCDEF",
    );
    expect(text).toContain("matched 3/5 turns");
    expect(text).toContain("🟣🟣⚪⚪🟣");
    expect(text).toContain("https://x/play/ABCDEF");
  });

  it("invites friends with the story's title and the code", () => {
    expect(roadInviteText(STORY, "https://x/play/ABCDEF", "ABCDEF")).toContain(
      '"The Goa trip that went wrong"',
    );
  });
});

describe("route map layout", () => {
  it("spreads options across the width and turns down the page", () => {
    expect(routePoint(0, 0, 3)).toEqual({ x: 57, y: 40 });
    expect(routePoint(2, 1, 3)).toEqual({ x: 171, y: 232 });
    expect(routePoint(4, 2, 3)).toEqual({ x: 285, y: 424 });
    expect(routeHeight(5)).toBe(458);
  });
});
