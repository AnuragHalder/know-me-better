import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/lib/quiz/board";

const rpc = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabase: () => ({ rpc }) }));

import { LiveLeaderboard } from "./LiveLeaderboard";

const row = (rank: number, name: string) => ({
  rank,
  player_name: name,
  score: 10 - rank,
  results: Array.from({ length: 10 }, (_, i) => i < 10 - rank),
  is_me: false,
});
const board = (names: string[], total = names.length): Board => ({
  total,
  limit: 10,
  my_rank: null,
  rows: names.map((n, i) => row(i + 1, n)),
});

describe("LiveLeaderboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpc.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("blurs friends past the top 10 without revealing who they are", () => {
    const names = Array.from({ length: 10 }, (_, i) => `Friend ${i + 1}`);
    render(
      <LiveLeaderboard
        quizId="q"
        initial={board(names, 13)}
        title="Who knows you best"
        ownerName="Riya"
        viewer="owner"
      />,
    );
    expect(screen.getByText("13 played")).toBeInTheDocument();
    expect(screen.getByText("+3 more friends played")).toBeInTheDocument();
    expect(screen.getByText(/Full leaderboard ₹49/)).toBeInTheDocument();
    expect(screen.queryByText("Friend 11")).not.toBeInTheDocument();
  });

  it("picks up friends who finish while the page is open", async () => {
    rpc.mockResolvedValue({ data: board(["Zoya", "Meera"]), error: null });
    render(
      <LiveLeaderboard
        quizId="q"
        initial={board(["Zoya"])}
        title="Board"
        ownerName="Riya"
        viewer="owner"
      />,
    );
    expect(screen.queryByText("Meera")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(rpc).toHaveBeenCalledWith("get_leaderboard", { p_quiz_id: "q" });
    expect(screen.getByText("Meera").closest("li")).toHaveAttribute("data-fresh", "true");
    expect(screen.getByText("Zoya").closest("li")).not.toHaveAttribute("data-fresh");
  });

  it("tells a friend only the owner sees everyone", () => {
    render(
      <LiveLeaderboard
        quizId="q"
        initial={board(["A"], 15)}
        title="Board"
        ownerName="Riya"
        viewer="friend"
      />,
    );
    expect(screen.getByText("Only Riya can see the full leaderboard.")).toBeInTheDocument();
  });
});
