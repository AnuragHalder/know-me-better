import { describe, expect, it } from "vitest";
import { percent, rankGames, shareHealth, type AdminStats, type KindStats } from "./stats";

const kind = (over: Partial<KindStats> = {}): KindStats => ({
  created: 0,
  created_week: 0,
  creators: 0,
  plays: 0,
  plays_week: 0,
  started: 0,
  players: 0,
  played_at_least_once: 0,
  ...over,
});

const stats = (over: Partial<AdminStats> = {}): AdminStats => ({
  generated_at: "2026-11-16T00:00:00Z",
  people: { accounts: 0, accounts_week: 0, guests: 0, guests_week: 0 },
  quiz: kind({ plays: 12, plays_week: 4 }),
  road: kind({ plays: 3, plays_week: 3 }),
  party: {
    rooms: 2,
    rooms_week: 2,
    games: { killer: { games: 5, games_week: 5, avg_players: 6 } },
  },
  payments: { paid: 0, paid_paise: 0, failed: 0, abandoned: 0, refunded: 0, by_product: {} },
  daily: [],
  ...over,
});

describe("rankGames", () => {
  it("puts the most played first and includes games nobody has played yet", () => {
    expect(rankGames(stats()).map((g) => [g.name, g.total])).toEqual([
      ["Quiz", 12],
      ["Killer", 5],
      ["Story mode", 3],
      ["Fake It", 0],
      ["Same Brain", 0],
    ]);
  });
});

describe("shareHealth", () => {
  it("shows how many shared pages got played, plays per page and finish rate", () => {
    expect(
      shareHealth(kind({ created: 4, played_at_least_once: 3, plays: 10, started: 12 })),
    ).toEqual({ sharedAndPlayed: 75, playsPerPage: 2.5, finishRate: 83 });
  });

  it("has nothing to say before anything is made", () => {
    expect(shareHealth(kind())).toEqual({
      sharedAndPlayed: null,
      playsPerPage: null,
      finishRate: null,
    });
    expect(percent(1, 0)).toBeNull();
  });
});
