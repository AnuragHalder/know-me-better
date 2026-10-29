import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KillerRound } from "./KillerRound";
import type { KillerState, RoomView } from "@/lib/party/room";

const players = ["Anurag", "Meera", "Kabir", "Zoya"].map((name, i) => ({
  name,
  score: 0,
  is_host: i === 0,
  is_me: i === 1,
  done: false,
  alive: name !== "Kabir",
}));

function view(killer: Partial<KillerState>, phase: RoomView["phase"] = "night"): RoomView {
  return {
    code: "K7M2QX",
    game: "killer",
    status: "playing",
    game_no: 1,
    round: 1,
    total_rounds: 5,
    phase,
    seconds_left: 150,
    max_players: 8,
    min_players: 4,
    is_host: false,
    prompt: null,
    subject: null,
    is_subject: false,
    my_answer: null,
    my_vote_done: false,
    wrote_truth: false,
    players,
    options: null,
    reveal: null,
    awards: null,
    killer: {
      role: "killer",
      alive: true,
      kills: 1,
      kills_needed: 2,
      kill_ready_in: 0,
      deaths: [{ name: "Kabir", after_seconds: 42 }],
      my_suspect: null,
      suspects: null,
      result: null,
      ...killer,
    },
  };
}

const handlers = () => ({
  onKill: vi.fn(),
  onAccuse: vi.fn(),
  onSuspect: vi.fn(),
  onNext: vi.fn(),
});

describe("KillerRound", () => {
  it("keeps the role covered until shown, then lets the killer pick a living victim", () => {
    const h = handlers();
    render(<KillerRound view={view({})} secondsLeft={150} busy={false} {...h} />);
    expect(screen.queryByText("You're the killer")).not.toBeInTheDocument();
    expect(screen.getByText("Kabir was killed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show my role" }));
    expect(screen.getByText("You're the killer")).toBeInTheDocument();
    // Dead Kabir and Meera herself aren't on the list.
    expect(screen.queryByRole("button", { name: "Kabir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Meera" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoya" }));
    fireEvent.click(screen.getByRole("button", { name: "Kill Zoya" }));
    expect(h.onKill).toHaveBeenCalledWith("Zoya");
  });

  it("makes the killer wait for the cooldown", () => {
    render(
      <KillerRound
        view={view({ kill_ready_in: 7 })}
        secondsLeft={150}
        busy={false}
        {...handlers()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show my role" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoya" }));
    expect(screen.getByRole("button", { name: /Next kill in/ })).toBeDisabled();
  });

  it("shows the police the suspect count and takes one accusation", () => {
    const h = handlers();
    render(
      <KillerRound
        view={view({ role: "police", kill_ready_in: null, suspects: [{ name: "Zoya", count: 2 }] })}
        secondsLeft={150}
        busy={false}
        {...h}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show my role" }));
    expect(screen.getByRole("button", { name: /Zoya.*suspected by 2/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Zoya/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accuse Zoya" }));
    expect(h.onAccuse).toHaveBeenCalledWith("Zoya");
  });

  it("lets a villager mark and clear a suspect", () => {
    const h = handlers();
    render(
      <KillerRound
        view={view({ role: "villager", kill_ready_in: null, my_suspect: "Anurag" })}
        secondsLeft={150}
        busy={false}
        {...h}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show my role" }));
    fireEvent.click(screen.getByRole("button", { name: /Anurag/ }));
    expect(h.onSuspect).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Zoya" }));
    expect(h.onSuspect).toHaveBeenCalledWith("Zoya");
  });

  it("reveals every role and how the round ended", () => {
    render(
      <KillerRound
        view={view(
          {
            result: {
              winner: "village",
              reason: "accused_right",
              accused: "Anurag",
              roles: [
                {
                  name: "Anurag",
                  role: "killer",
                  alive: true,
                  suspect: null,
                  points: 0,
                  is_me: false,
                },
                {
                  name: "Zoya",
                  role: "police",
                  alive: true,
                  suspect: null,
                  points: 1000,
                  is_me: false,
                },
                {
                  name: "Meera",
                  role: "villager",
                  alive: true,
                  suspect: "Anurag",
                  points: 500,
                  is_me: true,
                },
              ],
            },
          },
          "reveal",
        )}
        secondsLeft={20}
        busy={false}
        {...handlers()}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The village wins");
    expect(screen.getByText("Zoya named Anurag. Caught!")).toBeInTheDocument();
    expect(screen.getByText("Villager · suspected Anurag")).toBeInTheDocument();
  });
});
