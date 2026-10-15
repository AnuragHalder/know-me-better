"use client";

import { useState, useTransition } from "react";
import { saveQuiz } from "@/app/me/actions";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, nameProblem } from "@/lib/names";
import {
  answeredCount,
  setAnswer,
  swapQuestion,
  toRpcItems,
  type BankQuestion,
  type DraftItem,
} from "@/lib/quiz/build";

interface QuizBuilderProps {
  bank: BankQuestion[];
  initialItems: DraftItem[];
  initialName: string;
  /** Present when editing an existing quiz. */
  quizId?: string;
}

export function QuizBuilder({ bank, initialItems, initialName, quizId }: QuizBuilderProps) {
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const byId = new Map(bank.map((q) => [q.id, q]));
  const done = answeredCount(items);
  const total = items.length;
  const firstUnanswered = items.findIndex((i) => i.answer === null);

  function save() {
    const problem = nameProblem(name);
    if (problem) {
      setError(problem);
      document.getElementById("owner-name")?.focus();
      return;
    }
    if (firstUnanswered !== -1) {
      setError(`Answer question ${firstUnanswered + 1} first.`);
      document.getElementById(`q-${firstUnanswered}`)?.scrollIntoView({ block: "center" });
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await saveQuiz({ quizId, ownerName: name, items: toRpcItems(items) });
      // Only failures return; success redirects.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">
          {quizId ? "Edit your page" : "Your page"}
        </span>
        <h1 className="font-hand text-4xl leading-tight font-bold">
          Answer honestly. Your friends get graded on it.
        </h1>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="owner-name"
            className="text-xs font-bold tracking-widest text-ink-soft uppercase"
          >
            Your name on the quiz
          </label>
          <input
            id="owner-name"
            type="text"
            autoComplete="given-name"
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Priya"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 text-base text-ink placeholder:text-ink-soft/70"
          />
        </div>
      </Sheet>

      <Sheet>
        <ol className="flex flex-col">
          {items.map((item, index) => {
            const q = byId.get(item.questionId);
            if (!q) return null;
            return (
              <li
                key={item.questionId}
                id={`q-${index}`}
                className="flex scroll-mt-4 flex-col gap-2.5 border-t border-dashed border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 font-hand text-xl leading-snug">
                    <span className="mr-1.5 font-mono text-sm text-ink-soft">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {q.prompt_self}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setItems((cur) => swapQuestion(cur, index, bank))}
                    className="min-h-11 shrink-0 px-1 text-sm text-ink-soft underline"
                    aria-label={`Swap question ${index + 1} for a different one`}
                  >
                    Swap
                  </button>
                </div>
                <div
                  role="radiogroup"
                  aria-label={q.prompt_self}
                  className="grid grid-cols-2 gap-2"
                >
                  {q.options.map((option, o) => {
                    const picked = item.answer === o;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={picked}
                        onClick={() => setItems((cur) => setAnswer(cur, index, o))}
                        className={cn(
                          "min-h-12 rounded-xl border-2 px-3 py-2 text-left leading-snug transition-colors",
                          picked
                            ? "border-ink bg-hi font-bold text-on-hi"
                            : "border-line bg-sheet font-medium text-ink hover:border-ink-soft",
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </Sheet>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-paper/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
        <p aria-live="polite" className="min-h-5 text-sm font-semibold text-bad">
          {error}
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-sm text-ink-soft tabular-nums">
            {done}/{total} answered
          </span>
          <Button variant="pink" onClick={save} disabled={pending}>
            {pending ? "Saving…" : quizId ? "Save changes" : "Save and get my link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
