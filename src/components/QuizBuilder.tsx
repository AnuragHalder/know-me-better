"use client";

import { useEffect, useState, useTransition } from "react";
import type { AiStatus } from "@/app/create/ai-actions";
import { saveQuiz } from "@/app/me/actions";
import { AiWriter } from "@/components/AiWriter";
import type { Look } from "@/components/PageShell";
import { QuestionEditor } from "@/components/QuestionEditor";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { MAX_NAME_LENGTH, nameProblem } from "@/lib/names";
import {
  answeredCount,
  draftForTopics,
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
import { TOPICS, topicLabels } from "@/lib/quiz/topics";

const MAX_TOPICS = 3;

interface QuizBuilderProps {
  bank: BankQuestion[];
  initialItems: DraftItem[];
  initialName: string;
  /** Present when editing an existing quiz. */
  quizId?: string;
  /** AI writing status; null hides the AI note (not signed in, or not set up). */
  aiStatus?: AiStatus | null;
  initialLook?: Look;
}

const LOOKS: { id: Look; label: string; hint: string }[] = [
  { id: "notebook", label: "Notebook", hint: "Handwritten, lined paper" },
  { id: "clean", label: "Clean", hint: "Modern, minimal" },
];

export function QuizBuilder({
  bank,
  initialItems,
  initialName,
  quizId,
  aiStatus = null,
  initialLook = "notebook",
}: QuizBuilderProps) {
  const [look, setLook] = useState<Look>(initialLook);
  // Preview the look on the whole page while building.
  useEffect(() => {
    const root = document.documentElement;
    if (look === "clean") root.dataset.look = "clean";
    else delete root.dataset.look;
    return () => {
      delete root.dataset.look;
    };
  }, [look]);
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ items: DraftItem[]; message: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const shownName = name.trim() || "you";

  const byId = new Map(bank.map((q) => [q.id, q]));
  const done = answeredCount(items);
  const total = items.length;
  const firstUnanswered = items.findIndex((i) => i.answer === null);

  function replacePage(next: DraftItem[], message: string) {
    setUndo({ items, message });
    setEditing(null);
    setItems(next);
  }

  function toggleTopic(id: string) {
    const next = topics.includes(id)
      ? topics.filter((t) => t !== id)
      : [...topics, id].slice(-MAX_TOPICS);
    setTopics(next);
    const labels = topicLabels(next);
    replacePage(
      draftForTopics(bank, next),
      labels.length ? `New questions on ${labels.join(", ")}.` : "A fresh random mix.",
    );
  }

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
      const res = await saveQuiz({ quizId, ownerName: name, items: toRpcItems(items), look });
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
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-bold tracking-widest text-ink-soft uppercase">
            Look friends will see
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {LOOKS.map((l) => (
              <label
                key={l.id}
                className={cn(
                  "flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border-2 px-3 py-2",
                  look === l.id ? "border-ink bg-hi text-on-hi" : "border-line bg-sheet text-ink",
                )}
              >
                <input
                  type="radio"
                  name="look"
                  value={l.id}
                  checked={look === l.id}
                  onChange={() => setLook(l.id)}
                  className="sr-only"
                />
                <span className="font-bold">{l.label}</span>
                <span className="text-xs opacity-80">{l.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Sheet>

      <Sheet>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Quiz your friends on…</h2>
          <span className="text-xs text-ink-soft">Pick up to {MAX_TOPICS}</span>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Topics">
          {TOPICS.map((t) => {
            const on = topics.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTopic(t.id)}
                className={cn(
                  "min-h-10 rounded-full border-2 px-3 text-sm font-semibold transition-colors",
                  on
                    ? "border-ink bg-ink text-sheet"
                    : "border-line bg-sheet text-ink hover:border-ink-soft",
                )}
              >
                <span aria-hidden="true" className="mr-1">
                  {t.emoji}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </Sheet>

      {aiStatus && (
        <AiWriter
          status={aiStatus}
          topicsHint={topicLabels(topics).join(", ")}
          onQuestions={(generated) => {
            replacePage(draftFromAi(generated, bank), "AI questions are on your page.");
            document.getElementById("q-0")?.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
        />
      )}

      <Sheet>
        {undo && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-hi px-3 py-1 text-sm text-on-hi">
            <span>{undo.message}</span>
            <button
              type="button"
              className="min-h-11 shrink-0 font-bold underline"
              onClick={() => {
                setItems(undo.items);
                setUndo(null);
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
                        onClick={() =>
                          setItems((cur) => swapQuestion(cur, index, bank, Math.random, topics))
                        }
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
