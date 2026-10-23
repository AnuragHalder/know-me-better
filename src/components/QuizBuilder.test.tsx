import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveQuiz = vi.fn();
vi.mock("@/app/me/actions", () => ({ saveQuiz: (...args: unknown[]) => saveQuiz(...args) }));
const generateAiQuestions = vi.fn();
vi.mock("@/app/create/ai-actions", () => ({
  generateAiQuestions: (...args: unknown[]) => generateAiQuestions(...args),
  startAd: vi.fn(),
  finishAd: vi.fn(),
}));

import { QuizBuilder } from "./QuizBuilder";

const bank = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  prompt_self: `Question ${i}?`,
  prompt_other: `{name}'s question ${i}?`,
  topic: i % 2 ? "money" : "food",
  options: ["A", "B", "C", "D"].map((l) => `${l}${i}`),
}));
const initialItems = bank.slice(0, 10).map((q) => ({ key: q.id, questionId: q.id, answer: null }));
const aiStatus = { available: true, pro: true, credits: 0, adsLeft: 3 };

function setup(name = "Riya", withAi = false) {
  render(
    <QuizBuilder
      bank={bank}
      initialItems={initialItems}
      initialName={name}
      aiStatus={withAi ? aiStatus : null}
    />,
  );
}

describe("QuizBuilder", () => {
  beforeEach(() => {
    saveQuiz.mockReset();
    generateAiQuestions.mockReset();
  });

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

  it("edits a question's wording and options in the creator's words", async () => {
    saveQuiz.mockResolvedValue({ error: "stop" });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit question 1" }));
    const prompt = screen.getByLabelText("Question, as friends see it");
    expect(prompt).toHaveValue("Riya's question 0?");
    fireEvent.change(prompt, { target: { value: "What does Riya order at Haldiram's?" } });
    fireEvent.change(screen.getByLabelText("Option 4"), { target: { value: "Chole bhature" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByText("What does Riya order at Haldiram's?")).toBeInTheDocument();
    expect(screen.getByText("Edited")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Chole bhature" }));
    for (let i = 1; i < 10; i++) fireEvent.click(screen.getByRole("radio", { name: `A${i}` }));
    fireEvent.click(screen.getByRole("button", { name: "Save and get my link" }));
    await screen.findByText("stop");
    expect(saveQuiz.mock.calls[0][0].items[0]).toEqual({
      question_id: "q0",
      correct_option: 3,
      prompt_other: "What does {name} order at Haldiram's?",
      options: ["A0", "B0", "C0", "Chole bhature"],
    });
  });

  it("won't accept repeated options", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit question 2" }));
    fireEvent.change(screen.getByLabelText("Option 2"), { target: { value: "a1" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText(/different from each other/)).toBeInTheDocument();
  });

  it("puts AI questions on the page, and can undo", async () => {
    generateAiQuestions.mockResolvedValue({
      ok: true,
      status: aiStatus,
      questions: Array.from({ length: 10 }, (_, i) => ({
        promptSelf: `AI about me ${i}?`,
        promptOther: `AI about {name} ${i}?`,
        options: ["W", "X", "Y", `Z${i}`],
      })),
    });
    setup("Riya", true);
    fireEvent.change(screen.getByLabelText("Topics for AI questions"), {
      target: { value: "cricket" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write my questions" }));
    await screen.findByText("AI about me 0?");
    expect(generateAiQuestions).toHaveBeenCalledWith("cricket");
    expect(screen.getAllByText("AI")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Question 0?")).toBeInTheDocument();
  });

  it("fills the page from a topic chip, and can undo", () => {
    const big = Array.from({ length: 24 }, (_, i) => ({
      id: `b${i}`,
      prompt_self: `${i < 12 ? "Money" : "Food"} question ${i}?`,
      prompt_other: `{name}'s q ${i}?`,
      options: ["A", "B", "C", "D"].map((l) => `${l}-${i}`),
      topic: i < 12 ? "money" : "food",
    }));
    render(
      <QuizBuilder
        bank={big}
        initialItems={big.slice(12, 22).map((q) => ({ key: q.id, questionId: q.id, answer: null }))}
        initialName="Riya"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Money/ }));
    expect(screen.getByRole("button", { name: /Money/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/^Money question/)).toHaveLength(10);
    expect(screen.getByText("New questions on Money.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getAllByText(/^Food question/)).toHaveLength(10);
  });
});
