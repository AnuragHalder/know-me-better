"use client";

import { useState } from "react";
import { finishAd, generateAiQuestions, startAd, type AiStatus } from "@/app/create/ai-actions";
import { RewardedAd } from "@/components/ads/RewardedAd";
import { StickyNote } from "@/components/ui/StickyNote";
import { cn } from "@/lib/cn";
import { TOPICS_MAX, topicsProblem, type GeneratedQuestion } from "@/lib/ai/questions";

interface AiWriterProps {
  status: AiStatus | null;
  onQuestions: (questions: GeneratedQuestion[]) => void;
}

/**
 * "Write my questions with AI": Pro members generate straight away; everyone else
 * watches a short ad for each set. The server decides; this only shows the state.
 */
export function AiWriter({ status: initial, onQuestions }: AiWriterProps) {
  const [status, setStatus] = useState(initial);
  const [topics, setTopics] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ad, setAd] = useState<{ id: string; seconds: number } | null>(null);

  if (!status?.available) return null;

  const unlocked = status.pro || status.credits > 0;

  async function generate() {
    const problem = topicsProblem(topics);
    if (problem) {
      setMessage(problem);
      return;
    }
    setBusy(true);
    setMessage(unlocked ? "Writing your questions…" : "");
    try {
      const res = await generateAiQuestions(topics);
      if (res.status) setStatus(res.status);
      if (res.ok) {
        onQuestions(res.questions);
        setMessage(
          `Done: ${res.questions.length} questions on your page. Pick your answers below; edit or swap any of them.`,
        );
      } else if (res.needsUnlock) {
        setMessage("");
        await watchAd();
      } else {
        setMessage(res.error);
      }
    } catch {
      setMessage("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function watchAd() {
    const res = await startAd();
    if ("error" in res) setMessage(res.error);
    else setAd(res);
  }

  async function adFinished() {
    if (!ad) return;
    const id = ad.id;
    setAd(null);
    setBusy(true);
    const res = await finishAd(id);
    setBusy(false);
    if ("error" in res) {
      setMessage(res.error);
      return;
    }
    setStatus(res.status);
    await generate();
  }

  const label = busy
    ? "Writing…"
    : unlocked
      ? "Write my questions"
      : status.adsLeft > 0
        ? "Watch a short ad to write"
        : "No more free unlocks today";

  return (
    <StickyNote>
      <h2 className="font-hand text-2xl leading-tight font-bold">Or let AI write your questions</h2>
      <p className="text-sm text-on-note-soft">
        Name a few things you&apos;re into. You still pick the answers, and can edit any question.
      </p>
      <label htmlFor="ai-topics" className="sr-only">
        Topics for AI questions
      </label>
      <textarea
        id="ai-topics"
        rows={2}
        maxLength={TOPICS_MAX}
        value={topics}
        onChange={(e) => setTopics(e.target.value)}
        placeholder="e.g. cricket, street food, 90s Bollywood, my college days"
        className="w-full resize-none rounded-lg border-2 border-on-note/30 bg-note-field px-3 py-2 text-base text-on-note placeholder:text-on-note-soft"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-on-note-soft">
          {status.pro
            ? "Pro: no ads"
            : status.credits > 0
              ? "Unlocked: 1 set ready"
              : `Free with a 15-second ad · ${status.adsLeft} left today`}
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={busy || (!unlocked && status.adsLeft === 0)}
          className={cn(
            "min-h-11 rounded-full border-2 border-on-note bg-on-note px-4 text-sm font-bold text-note",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {label}
        </button>
      </div>
      {!status.pro && (
        <p className="text-xs text-on-note-soft">
          Don&apos;t want ads? <b>Pro</b> (coming soon) writes unlimited questions with no ads.
        </p>
      )}
      <p aria-live="polite" className="min-h-4 text-sm font-semibold empty:hidden">
        {message}
      </p>
      {ad && (
        <RewardedAd
          seconds={ad.seconds}
          onComplete={adFinished}
          onClose={() => {
            setAd(null);
            setMessage("Closed early, so nothing was unlocked.");
          }}
        />
      )}
    </StickyNote>
  );
}
