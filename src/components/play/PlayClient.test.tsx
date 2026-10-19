import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabase: () => ({ rpc }) }));
vi.mock("@/lib/supabase/guest", () => ({ ensureGuestSession: vi.fn().mockResolvedValue({}) }));

import { PlayClient, type PlayQuiz } from "./PlayClient";

const quiz: PlayQuiz = {
  id: "quiz-1",
  code: "ABCDEF",
  ownerName: "Riya",
  questions: [
    {
      position: 0,
      prompt: "{name}'s chai order?",
      options: ["Cutting", "Masala", "Ginger", "None"],
    },
    { position: 1, prompt: "{name}'s city?", options: ["Kolkata", "Pune", "Delhi", "Goa"] },
  ],
};

describe("PlayClient", () => {
  beforeEach(() => {
    rpc.mockReset();
    refresh.mockReset();
  });

  it("plays through: name, answers with reveal, then the result", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "start_attempt") return { data: { attempt_id: "a1", answered: 0 }, error: null };
      if (fn === "answer_question") {
        return { data: { correct_option: 1, is_correct: args.p_choice === 1 }, error: null };
      }
      if (fn === "get_leaderboard") {
        return {
          data: {
            total: 1,
            my_rank: 1,
            rows: [
              { rank: 1, player_name: "Meera", score: 1, results: [false, true], is_me: true },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected" } };
    });

    render(
      <PlayClient
        quiz={quiz}
        start={{ kind: "new", suggestedName: "" }}
        url="https://x/play/ABCDEF"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "How well do you know Riya?",
    );

    fireEvent.change(screen.getByLabelText(/leaderboard/), { target: { value: "Meera" } });
    fireEvent.click(screen.getByRole("button", { name: "Start the quiz" }));
    await screen.findByText("Riya's chai order?");
    expect(rpc).toHaveBeenCalledWith("start_attempt", { p_code: "ABCDEF", p_player_name: "Meera" });

    fireEvent.click(screen.getByRole("button", { name: "Cutting" }));
    await screen.findByText("Nope. Riya picked “Masala”.");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText("Riya's city?");
    fireEvent.click(screen.getByRole("button", { name: "Pune" }));
    await screen.findByText("Yes! Riya picked that.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "See score" }));
    });

    await screen.findByText(/#1/);
    expect(screen.getByText("Good friend")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toContain(
      encodeURIComponent("I got 1/2 on Riya's quiz"),
    );
  });

  it("shows a finished player's saved result straight away", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    render(
      <PlayClient
        quiz={quiz}
        start={{ kind: "finished", playerName: "Meera", results: [true, true] }}
        url="https://x/play/ABCDEF"
      />,
    );
    expect(screen.getByText("Soulmate level")).toBeInTheDocument();
    expect(screen.getByText("Meera, you know Riya")).toBeInTheDocument();
  });

  it("refreshes to the saved result if they already played", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "already_played" } });
    render(
      <PlayClient quiz={quiz} start={{ kind: "new", suggestedName: "Meera" }} url="https://x" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start the quiz" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
