"use client";

import { useState, useTransition } from "react";
import type { AiStatus } from "@/app/create/ai-actions";
import { saveQuiz } from "@/app/me/actions";
import { AiWriter } from "@/components/AiWriter";
import { QuestionEditor } from "@/components/QuestionEditor";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, nameProblem } from "@/lib/names";
import {
  answeredCount,
  draftFromAi,
  editItem,
  fillName,
  resetItem,
  setAnswer,
  swapQuestion,
  toRpcItems,
  viewItem,
  type BankQuestion,
  type DraftItem,
} from "@/lib/quiz/build";

interface QuizBuilderProps {
  bank: BankQuestion[];
  initialItems: DraftItem[];
  initialName: string;
  /** Present when editing an existing quiz. */
  quizId?: string;
  /** AI writing status; null hides the AI note (not signed in, or not set up). */
  aiStatus?: AiStatus | null;
}

export function QuizBuilder({
  bank,
  initialItems,
  initialName,
  quizId,
  aiStatus = null,
}: QuizBuilderProps) {
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<string | null>(null);
  const [beforeAi, setBeforeAi] = useState<DraftItem[] | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const shownName = name.trim() || "you";

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
    if (editing) {
      setError("Finish editing the open question first.");
      document.getElementById(`edit-${items.findIndex((i) => i.key === editing)}-prompt`)?.focus();
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

      {aiStatus && (
        <AiWriter
          status={aiStatus}
          onQuestions={(generated) => {
            setBeforeAi(items);
            setEditing(null);
            setItems(draftFromAi(generated, bank));
            document.getElementById("q-0")?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
        />
      )}

      <Sheet>
        {beforeAi && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-hi px-3 py-1 text-sm text-on-hi">
            <span>AI questions are on your page.</span>
            <button
              type="button"
              className="min-h-11 font-bold underline"
              onClick={() => {
                setItems(beforeAi);
                setBeforeAi(null);
                setEditing(null);
              }}
            >
              Undo
            </button>
          </div>
        )}
        <ol className="flex flex-col">
          {items.map((item, index) => {
            const view = viewItem(item, byId);
            if (!view) return null;
            const heading = view.promptSelf ?? fillName(view.promptOther, shownName);
            const isEditing = editing === item.key;
            const tag = item.source === "ai" ? "AI" : view.edited ? "Edited" : null;
            return (
              <li
                key={item.key}
                id={`q-${index}`}
                className="flex scroll-mt-4 flex-col gap-2.5 border-t border-dashed border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 font-hand text-xl leading-snug">
                    <span className="mr-1.5 font-mono text-sm text-ink-soft">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {heading}
                    {tag && (
                      <span className="ml-2 rounded-full border border-line px-1.5 align-middle font-sans text-[0.68rem] font-bold tracking-wider text-ink-soft uppercase">
                        {tag}
                      </span>
                    )}
                  </h2>
                  {!isEditing && (
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing(item.key)}
                        className="min-h-11 px-1.5 text-sm text-ink-soft underline"
                        aria-label={`Edit question ${index + 1}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setItems((cur) => swapQuestion(cur, index, bank))}
                        className="min-h-11 px-1.5 text-sm text-ink-soft underline"
                        aria-label={`Swap question ${index + 1} for a different one`}
                      >
                        Swap
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <QuestionEditor
                    index={index}
                    initial={{
                      promptSelf: view.promptSelf,
                      promptOther: view.promptOther,
                      options: view.options,
                    }}
                    ownerName={name}
                    canReset={Boolean(item.questionId && item.text)}
                    onSave={(text) => {
                      setItems((cur) => editItem(cur, index, text, byId));
                      setEditing(null);
                    }}
                    onReset={() => {
                      setItems((cur) => resetItem(cur, index));
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div role="radiogroup" aria-label={heading} className="grid grid-cols-2 gap-2">
                    {view.options.map((option, o) => {
                      const picked = item.answer === o;
                      return (
                        <button
                          key={`${o}-${option}`}
                          type="button"
                          role="radio"
                          aria-checked={picked}
                          onClick={() => setItems((cur) => setAnswer(cur, index, o))}
                          className={cn(
                            "min-h-12 rounded-xl border-2 px-3 py-2 text-left leading-snug break-words transition-colors",
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
                )}
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
