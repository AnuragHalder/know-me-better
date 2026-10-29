import { describe, expect, it } from "vitest";
import { awardsText, formatPoints, roomInviteText, ROOM_CODE } from "./room";

describe("party room text", () => {
  it("invites friends with the game, link and code", () => {
    expect(roomInviteText("same_brain", "https://x/party/K7M2QX", "K7M2QX")).toBe(
      "Join my Same Brain room on Who Knows Me Better. We're playing now!\nhttps://x/party/K7M2QX\nCode: K7M2QX",
    );
  });

  it("shares the winner and every award", () => {
    const text = awardsText(
      {
        game: "fake_it",
        players: [
          { name: "Zoya", score: 1500, is_host: false, is_me: false, done: false },
          { name: "Meera", score: 2500, is_host: false, is_me: true, done: false },
        ],
        awards: [{ title: "Smoothest liar", name: "Meera", detail: "fooled friends 3 times" }],
      },
      "https://x/party/K7M2QX",
    );
    expect(text).toContain("Winner: Meera (2,500 pts)");
    expect(text).toContain("Smoothest liar: Meera, fooled friends 3 times");
  });

  it("groups points the Indian way and checks codes like quiz codes", () => {
    expect(formatPoints(150000)).toBe("1,50,000");
    expect(ROOM_CODE.test("K7M2QX")).toBe(true);
    expect(ROOM_CODE.test("K7M2Q0")).toBe(false);
  });
});

describe("Killer text", () => {
  it("formats the round clock", async () => {
    const { formatClock } = await import("./room");
    expect(formatClock(185)).toBe("3:05");
    expect(formatClock(9)).toBe("0:09");
  });

  it("explains how a round ended", async () => {
    const { killerOutcome } = await import("./room");
    const roles = [
      {
        name: "Kabir",
        role: "killer" as const,
        alive: true,
        suspect: null,
        points: 0,
        is_me: false,
      },
      {
        name: "Zoya",
        role: "police" as const,
        alive: true,
        suspect: null,
        points: 0,
        is_me: false,
      },
    ];
    expect(
      killerOutcome({ winner: "village", reason: "caught_police", accused: null, roles }),
    ).toBe("Kabir went for Zoya, who was the police. Caught!");
    expect(
      killerOutcome({ winner: "killer", reason: "accused_wrong", accused: "Meera", roles }),
    ).toBe("Zoya accused Meera, but the killer was Kabir.");
  });
});
