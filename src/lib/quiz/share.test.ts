import { describe, expect, it } from "vitest";
import { inviteText, playPath, resultText, whatsappHref } from "./share";

describe("sharing", () => {
  it("builds the play path and the invite", () => {
    expect(playPath("K7PX2Q")).toBe("/play/K7PX2Q");
    const text = inviteText("https://example.app/play/K7PX2Q", "K7PX2Q");
    expect(text.split("\n")).toEqual([
      expect.stringContaining("Who knows me better?"),
      "https://example.app/play/K7PX2Q",
      "Code: K7PX2Q",
    ]);
  });

  it("encodes the WhatsApp message", () => {
    expect(whatsappHref("a b\nc&d")).toBe("https://wa.me/?text=a%20b%0Ac%26d");
  });
});

describe("resultText", () => {
  it("shows score, verdict, grid and link", () => {
    const r = [true, true, false, true, true, true, true, true, false, true];
    expect(resultText("Riya", r, "https://x.in/play/ABCDEF")).toBe(
      "I got 8/10 on Riya's quiz: Scary accurate\n🟩🟩🟥🟩🟩🟩🟩🟩🟥🟩\nHow well do you know Riya? https://x.in/play/ABCDEF",
    );
  });
});
