import { describe, expect, it } from "vitest";
import { boardRows, hiddenCount, newRowIds, timeAgo, type Board } from "./board";

const row = (rank: number, name: string, score = 5) => ({
  rank,
  player_name: name,
  score,
  results: Array.from({ length: 10 }, (_, i) => i < score),
  is_me: false,
});

describe("board helpers", () => {
  const board: Board = {
    total: 14,
    limit: 10,
    my_rank: null,
    rows: [row(1, "Zoya", 9), row(2, "Meera")],
  };

  it("maps rows and counts the hidden ones", () => {
    expect(boardRows(board)[0]).toMatchObject({ name: "Zoya", rank: 1, isMe: false });
    expect(hiddenCount(board)).toBe(12);
    expect(hiddenCount({ ...board, total: 2 })).toBe(0);
  });

  it("spots friends who just finished", () => {
    const after = { ...board, rows: [row(1, "Zoya", 9), row(2, "Kabir", 7), row(3, "Meera")] };
    expect([...newRowIds(board, after)]).toEqual(["2-Kabir", "3-Meera"]);
    expect(newRowIds(null, after).size).toBe(0);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("reads naturally", () => {
    expect(timeAgo("2026-10-21T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-21T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-21T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-20T10:00:00Z", now)).toBe("yesterday");
    expect(timeAgo("2026-10-18T10:00:00Z", now)).toBe("3 days ago");
    expect(timeAgo("2026-10-01T10:00:00Z", now)).toBe("1 Oct");
  });
});
