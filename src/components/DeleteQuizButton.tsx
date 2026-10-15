"use client";

import { useState, useTransition } from "react";
import { deleteQuiz } from "@/app/me/actions";
import { Button } from "@/components/ui/Button";

/** Two-step delete: the first tap asks, the second deletes. */
export function DeleteQuizButton({ quizId, plays }: { quizId: string; plays: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Delete quiz
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-bad bg-bad-bg p-3">
      <p className="text-sm text-ink">
        Delete this quiz
        {plays > 0 ? ` and the scores of ${plays} friend${plays === 1 ? "" : "s"}` : ""}? Its link
        stops working. This can&apos;t be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteQuiz(quizId);
              if (res?.error) setError(res.error);
            })
          }
          className="inline-flex min-h-11 items-center rounded-full border-2 border-bad bg-bad px-4 text-sm font-bold text-white disabled:opacity-50 dark:text-paper"
        >
          {pending ? "Deleting…" : "Yes, delete it"}
        </button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-bad">{error}</p>}
    </div>
  );
}
