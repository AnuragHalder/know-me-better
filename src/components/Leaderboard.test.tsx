import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Leaderboard, rankRows } from "./Leaderboard";

const t = true;
const f = false;

describe("rankRows", () => {
  it("orders by score, highest first, and keeps ties in input order", () => {
    const ranked = rankRows([
      { id: "a", name: "A", answers: [t, f, f] },
      { id: "b", name: "B", answers: [t, t, t] },
      { id: "c", name: "C", answers: [f, t, f] },
    ]);
    expect(ranked.map((r) => [r.id, r.score])).toEqual([
      ["b", 3],
      ["a", 1],
      ["c", 1],
    ]);
  });
});

describe("Leaderboard", () => {
  it("shows the empty message when nobody has played", () => {
    render(<Leaderboard rows={[]} emptyText="Be the first." />);
    expect(screen.getByText("Be the first.")).toBeInTheDocument();
  });

  it("marks the viewer's own row", () => {
    render(
      <Leaderboard
        rows={[
          { id: "1", name: "Meera", answers: [t, t] },
          { id: "2", name: "Riya", answers: [t, f], isMe: true },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Meera")).toBeInTheDocument();
    expect(within(items[1]).getByText("you")).toBeInTheDocument();
    expect(within(items[1]).getByRole("img")).toHaveAccessibleName("1 of 2 right");
  });
});
