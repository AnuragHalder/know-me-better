import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabase: () => ({ rpc }) }));
vi.mock("@/lib/supabase/guest", () => ({ ensureGuestSession: vi.fn().mockResolvedValue({}) }));
// The real map needs a browser; a button stands in for tapping it.
vi.mock("@/components/map/MapView", () => ({
  MapView: ({ onPick, label }: { onPick?: (lat: number, lng: number) => void; label: string }) =>
    onPick ? (
      <button type="button" onClick={() => onPick(25.59, 85.14)}>
        Tap map near Patna
      </button>
    ) : (
      <div aria-label={label} />
    ),
}));

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
      if (fn === "start_attempt") {
        return { data: { attempt_id: "a1", answered: 0, attempt_no: 1 }, error: null };
      }
      if (fn === "answer_question") {
        return { data: { is_correct: args.p_choice === 1 }, error: null };
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
    await screen.findByText("Not quite. That's not Riya's answer.");
    expect(screen.queryByText(/Masala.*picked|picked.*Masala/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cutting" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Masala" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText("Riya's city?");
    fireEvent.click(screen.getByRole("button", { name: "Pune" }));
    await screen.findByText("Yes! Riya picked that.");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "See score" }));
    });

    await screen.findByText(/#1/);
    expect(screen.getByText("Paying attention")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again for ₹9" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toContain(
      encodeURIComponent("I got 1/2 on Riya's quiz"),
    );
  });

  it("shows a finished player's saved result straight away", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    render(
      <PlayClient
        quiz={quiz}
        start={{ kind: "finished", playerName: "Meera", results: [true, true], retry: "used" }}
        url="https://x/play/ABCDEF"
      />,
    );
    expect(screen.getByText("Diary-level access")).toBeInTheDocument();
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

  it("starts a paid second round from the result screen", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "start_attempt"
        ? { data: { attempt_id: "a2", answered: 0, attempt_no: 2 }, error: null }
        : { data: null, error: null },
    );
    render(
      <PlayClient
        quiz={quiz}
        start={{ kind: "finished", playerName: "Meera", results: [false, false], retry: "ready" }}
        url="https://x"
      />,
    );
    expect(screen.queryByRole("button", { name: /Try again for/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    await screen.findByText("Riya's chai order?");
    expect(rpc).toHaveBeenCalledWith("start_attempt", { p_code: "ABCDEF", p_player_name: "Meera" });
  });

  it("offers no retry when the creator locked retries", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    render(
      <PlayClient
        quiz={{ ...quiz, retriesLocked: true }}
        start={{ kind: "finished", playerName: "Meera", results: [true, false], retry: "locked" }}
        url="https://x"
      />,
    );
    expect(screen.queryByText("Think you can do better?")).not.toBeInTheDocument();
  });

  it("plays a map question: pin, distance, then the spot only if they give up the retry", async () => {
    const mapQuiz: PlayQuiz = {
      ...quiz,
      questions: [
        { position: 0, prompt: "Where was {name} born?", options: [], kind: "pin", scope: "india" },
      ],
    };
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "start_attempt") {
        return { data: { attempt_id: "a1", answered: 0, attempt_no: 1 }, error: null };
      }
      if (fn === "answer_pin") {
        expect(args).toEqual({ p_attempt_id: "a1", p_lat: 25.59, p_lng: 85.14 });
        return { data: { is_correct: false, distance_km: 468.2, bullseye: false }, error: null };
      }
      if (fn === "get_my_map_reveal") return { data: { allowed: false, maps: 1 }, error: null };
      if (fn === "reveal_my_map") {
        return {
          data: {
            allowed: true,
            items: [
              {
                position: 0,
                prompt: "Where was {name} born?",
                scope: "india",
                label: "Kolkata",
                lat: 22.57,
                lng: 88.36,
                guess_lat: 25.59,
                guess_lng: 85.14,
                distance_km: 468.2,
              },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    render(
      <PlayClient quiz={mapQuiz} start={{ kind: "new", suggestedName: "Meera" }} url="https://x" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start the quiz" }));
    await screen.findByText("Where was Riya born?");
    expect(screen.getByRole("button", { name: "Lock it in" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tap map near Patna" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock it in" }));
    await screen.findByText("468 km off. Riya's answer is somewhere on that ring.");
    expect(screen.queryByText(/Kolkata/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "See score" }));
    });
    await screen.findByRole("button", { name: "Show me the spot (no more retries)" });
    expect(screen.getByText("Think you can do better?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show me the spot (no more retries)" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, show me" }));
    await screen.findByText("Kolkata");
    expect(screen.queryByText("Think you can do better?")).not.toBeInTheDocument();
  });
});
