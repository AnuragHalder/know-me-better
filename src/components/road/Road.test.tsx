import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserSupabase: () => ({ rpc }) }));
vi.mock("@/lib/supabase/guest", () => ({ ensureGuestSession: vi.fn().mockResolvedValue({}) }));

import { RoadPlay } from "./RoadPlay";
import { RoadWalk } from "./RoadWalk";
import type { Story } from "@/lib/road/story";

const turn = (place: string, a: string, b: string, endings: [string, string]) => ({
  place,
  scene_self: `You reach ${place}.`,
  scene_other: `{name} reaches ${place}.`,
  ask_self: "What do you do?",
  ask_other: "What did {name} do?",
  options: [
    { text: a, short: a, ending: endings[0] },
    { text: b, short: b, ending: endings[1] },
  ],
});

const STORY: Story = {
  id: "goa_trip",
  title: "The Goa trip that went wrong",
  blurb: "b",
  endings: [
    { key: "palolem", title: "Sunrise at Palolem", line: "One perfect swim." },
    { key: "margao", title: "Stranded at Margao station", line: "One samosa left." },
  ],
  turns: [
    turn("the station", "Bus", "Cab", ["margao", "palolem"]),
    turn("the beach", "Party", "Sleep", ["margao", "palolem"]),
  ],
};

beforeEach(() => {
  rpc.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe("RoadWalk", () => {
  it("walks the story, previews the ending, then saves the choices", async () => {
    rpc.mockResolvedValue({ data: { id: "road-1", code: "ABCDEF" }, error: null });
    render(<RoadWalk story={STORY} initialName="Raj" />);

    expect(screen.getByText("You reach the station.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock my choice" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Cab/ }));
    fireEvent.click(screen.getByRole("button", { name: "Lock my choice" }));

    fireEvent.click(screen.getByRole("button", { name: /Sleep/ }));
    fireEvent.click(screen.getByRole("button", { name: "Lock it and see my road" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sunrise at Palolem");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save and get my link" }));
    });
    expect(rpc).toHaveBeenCalledWith("create_road", {
      p_story_id: "goa_trip",
      p_owner_name: "Raj",
      p_choices: [1, 1],
    });
    expect(push).toHaveBeenCalledWith("/me/quiz/road-1?new=1");
  });

  it("lets the creator go back and change a turn", () => {
    render(<RoadWalk story={STORY} initialName="Raj" />);
    fireEvent.click(screen.getByRole("button", { name: /Bus/ }));
    fireEvent.click(screen.getByRole("button", { name: "Lock my choice" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /Bus/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("RoadPlay", () => {
  it("guesses each turn, learns only together or split, then sees the reveal", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "start_attempt") return { data: { attempt_id: "a1", answered: 0 }, error: null };
      if (fn === "answer_question")
        return { data: { is_correct: args.p_choice === 1 }, error: null };
      if (fn === "get_road_reveal") {
        return {
          data: {
            story_id: "goa_trip",
            owner_name: "Raj",
            owner_picks: [1, 1],
            owner_ending: "palolem",
            me: { picks: [0, 1], score: 1, ending: "palolem" },
            total: 3,
            followed: 2,
            tally: [
              { ending: "palolem", count: 2, names: ["Meera", "Kabir"] },
              { ending: "margao", count: 1, names: ["Aarav"] },
            ],
            friends: null,
            hidden: 0,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    render(
      <RoadPlay
        road={{ id: "road-1", code: "ABCDEF", ownerName: "Raj", story: STORY }}
        start={{ kind: "new", suggestedName: "Meera" }}
        url="https://x/play/ABCDEF"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Can you guess every turn Raj took?",
    );
    fireEvent.click(screen.getByRole("button", { name: "Start walking" }));

    await screen.findByText("Raj reaches the station.");
    fireEvent.click(screen.getByRole("button", { name: /Bus/ }));
    await screen.findByText("Raj went another way.");
    expect(screen.queryByText(/Raj picked/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next turn" }));

    fireEvent.click(await screen.findByRole("button", { name: /Sleep/ }));
    await screen.findByText("Same turn as Raj.");
    fireEvent.click(screen.getByRole("button", { name: "See where we ended up" }));

    await screen.findByText("2 of 3 friends followed Raj to the end");
    expect(screen.getByText("Crossed paths")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You split from Raj right at the start (the station), and found each other again later.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Spot on.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make my own road" })).toHaveAttribute("href", "/road");
  });
});
