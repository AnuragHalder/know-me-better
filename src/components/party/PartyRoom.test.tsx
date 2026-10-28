import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabase: () => ({ rpc }) }));
vi.mock("@/lib/supabase/guest", () => ({ ensureGuestSession: vi.fn().mockResolvedValue({}) }));

import { PartyRoom } from "./PartyRoom";
import type { RoomPreview, RoomView } from "@/lib/party/room";

const preview: RoomPreview = {
  code: "K7M2QX",
  game: "fake_it",
  status: "lobby",
  host_name: "Anurag",
  players: 2,
  max_players: 5,
  joined: false,
};

const players = [
  { name: "Anurag", score: 250, is_host: true, is_me: false, done: true },
  { name: "Meera", score: 0, is_host: false, is_me: true, done: false },
  { name: "Kabir", score: 0, is_host: false, is_me: false, done: true },
];

const base: RoomView = {
  code: "K7M2QX",
  game: "fake_it",
  status: "lobby",
  game_no: 1,
  round: 0,
  total_rounds: 6,
  phase: null,
  seconds_left: null,
  max_players: 5,
  min_players: 3,
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
};

beforeEach(() => rpc.mockReset());

describe("PartyRoom", () => {
  it("joins with a name, then waits in the lobby", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "join_room" ? { data: { code: "K7M2QX" }, error: null } : { data: base, error: null },
    );
    render(<PartyRoom preview={preview} url="https://x/party/K7M2QX" suggestedName="" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Anurag invited you to Fake It",
    );
    fireEvent.change(screen.getByLabelText("Your name in the room"), {
      target: { value: "Meera" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join the room" }));
    await screen.findByText("You're in! Waiting for the host");
    expect(rpc).toHaveBeenCalledWith("join_room", { p_code: "K7M2QX", p_name: "Meera" });
    expect(screen.getByText("The game starts when the host is ready.")).toBeInTheDocument();
  });

  it("votes in Fake It without being able to pick your own fake, then sees the reveal", async () => {
    const voting: RoomView = {
      ...base,
      status: "playing",
      round: 1,
      phase: "vote",
      seconds_left: 30,
      prompt: "In school, Anurag's nickname was ___",
      subject: "Anurag",
      my_answer: "Chintu",
      options: [
        { index: 1, text: "Lambu", mine: false },
        { index: 2, text: "Chintu", mine: true },
        { index: 3, text: "Potato", mine: false },
      ],
    };
    const revealed: RoomView = {
      ...voting,
      phase: "reveal",
      options: null,
      reveal: {
        skipped: false,
        truth: "Potato",
        subject_points: 250,
        finders: ["Meera"],
        fakes: [
          { text: "Chintu", authors: ["Meera"], fooled: ["Kabir"], points: 500, mine: true },
          { text: "Lambu", authors: ["Kabir"], fooled: [], points: 0, mine: false },
        ],
        groups: [],
      },
    };
    rpc.mockImplementation(async (fn: string) =>
      fn === "submit_room_vote" ? { data: revealed, error: null } : { data: voting, error: null },
    );
    render(
      <PartyRoom preview={{ ...preview, joined: true }} url="https://x" suggestedName="Meera" />,
    );
    await screen.findByText("Which one is real?");
    expect(screen.getByRole("button", { name: /Chintu/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Potato" }));
    await screen.findByText("The truth");
    expect(rpc).toHaveBeenCalledWith("submit_room_vote", { p_code: "K7M2QX", p_index: 3 });
    expect(screen.getByText("Found by Meera")).toBeInTheDocument();
    expect(screen.getByText(/Your fake · fooled Kabir/)).toBeInTheDocument();
  });

  it("ends with the group awards and a WhatsApp share", async () => {
    const done: RoomView = {
      ...base,
      game: "same_brain",
      status: "done",
      round: 10,
      players: [
        { name: "Meera", score: 1800, is_host: false, is_me: true, done: false },
        { name: "Zoya", score: 1500, is_host: false, is_me: false, done: false },
      ],
      awards: [{ title: "Same brain", name: "Meera + Zoya", detail: "matched 9 of 10" }],
    };
    rpc.mockResolvedValue({ data: done, error: null });
    render(
      <PartyRoom
        preview={{ ...preview, joined: true }}
        url="https://x/party/K7M2QX"
        suggestedName=""
      />,
    );
    await screen.findByText("Meera + Zoya");
    const share = screen.getByRole("link", { name: "Share the awards on WhatsApp" });
    expect(decodeURIComponent(share.getAttribute("href") ?? "")).toContain(
      "Same brain: Meera + Zoya, matched 9 of 10",
    );
    expect(screen.getByRole("link", { name: "Host your own room" })).toHaveAttribute(
      "href",
      "/party",
    );
  });
});
