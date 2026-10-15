import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveQuiz = vi.fn();
vi.mock("@/app/me/actions", () => ({ saveQuiz: (...args: unknown[]) => saveQuiz(...args) }));

import { QuizBuilder } from "./QuizBuilder";

const bank = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  prompt_self: `Question ${i}?`,
  options: ["A", "B", "C", "D"].map((l) => `${l}${i}`),
}));
const initialItems = bank.slice(0, 10).map((q) => ({ questionId: q.id, answer: null }));

function setup(name = "Riya") {
  render(<QuizBuilder bank={bank} initialItems={initialItems} initialName={name} />);
}

describe("QuizBuilder", () => {
  beforeEach(() => saveQuiz.mockReset());

  it("counts answers as the creator picks them", () => {
    setup();
    expect(screen.getByText("0/10 answered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "C0" }));
    expect(screen.getByRole("radio", { name: "C0" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1/10 answered")).toBeInTheDocument();
  });

  it("won't save until every question is answered", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Save and get my link" }));
    expect(screen.getByText("Answer question 1 first.")).toBeInTheDocument();
    expect(saveQuiz).not.toHaveBeenCalled();
  });

  it("asks for a name", () => {
    setup("");
    fireEvent.click(screen.getByRole("button", { name: "Save and get my link" }));
    expect(screen.getByText(/Add your name/)).toBeInTheDocument();
  });

  it("swaps a question for one not on the page", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Swap question 1 for a different one" }));
    const first = screen.getAllByRole("listitem")[0];
    expect(within(first).queryByText("Question 0?")).not.toBeInTheDocument();
    expect(within(first).getByText(/Question 1[01]\?/)).toBeInTheDocument();
  });

  it("sends the name and all 10 answers", async () => {
    saveQuiz.mockResolvedValue({ error: "Saving isn't set up" });
    setup("  Riya  ");
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole("radio", { name: `B${i}` }));
    fireEvent.click(screen.getByRole("button", { name: "Save and get my link" }));
    await screen.findByText("Saving isn't set up");
    expect(saveQuiz).toHaveBeenCalledWith({
      quizId: undefined,
      ownerName: "  Riya  ",
      items: bank.slice(0, 10).map((q) => ({ question_id: q.id, correct_option: 1 })),
    });
  });
});
