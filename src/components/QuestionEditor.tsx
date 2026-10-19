"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { fillName, toTemplate, type OwnText } from "@/lib/quiz/build";
import { OPTION_MAX, PROMPT_MAX, optionsProblem, promptProblem } from "@/lib/quiz/validate";

interface QuestionEditorProps {
  index: number;
  /** Current friend-facing wording ({name} placeholder) and options. */
  initial: OwnText;
  ownerName: string;
  /** Shown only for bank questions that have been edited. */
  canReset: boolean;
  onSave: (text: OwnText) => void;
  onReset: () => void;
  onCancel: () => void;
}

/**
 * Edit one question as friends will read it, with the creator's name filled in.
 * The name is turned back into the {name} placeholder on save.
 */
export function QuestionEditor({
  index,
  initial,
  ownerName,
  canReset,
  onSave,
  onReset,
  onCancel,
}: QuestionEditorProps) {
  const shownName = ownerName.trim() || "you";
  const [prompt, setPrompt] = useState(fillName(initial.promptOther, shownName));
  const [options, setOptions] = useState(initial.options);
  const [error, setError] = useState("");
  const id = `edit-${index}`;

  function save() {
    const problem = promptProblem(prompt) ?? optionsProblem(options);
    if (problem) {
      setError(problem);
      return;
    }
    const promptOther = toTemplate(prompt.trim(), shownName);
    onSave({
      promptSelf: promptOther === initial.promptOther ? initial.promptSelf : null,
      promptOther,
      options,
    });
  }

  const field =
    "min-h-11 w-full rounded-xl border-2 border-line bg-sheet px-3 text-base text-ink placeholder:text-ink-soft/70";

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-ink p-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-prompt`}
          className="text-xs font-bold tracking-widest text-ink-soft uppercase"
        >
          Question, as friends see it
        </label>
        <textarea
          id={`${id}-prompt`}
          rows={2}
          maxLength={PROMPT_MAX}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={`${field} resize-none py-2`}
        />
      </div>
      <fieldset className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <legend className="mb-1.5 text-xs font-bold tracking-widest text-ink-soft uppercase">
          Options
        </legend>
        {options.map((o, i) => (
          <input
            key={i}
            type="text"
            aria-label={`Option ${i + 1}`}
            maxLength={OPTION_MAX}
            value={o}
            onChange={(e) => setOptions((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
            className={field}
          />
        ))}
      </fieldset>
      <p aria-live="polite" className="text-sm font-semibold text-bad empty:hidden">
        {error}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            className="mr-auto min-h-11 px-1 text-sm text-ink-soft underline"
          >
            Use original
          </button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={save}>
          Done
        </Button>
      </div>
    </div>
  );
}
