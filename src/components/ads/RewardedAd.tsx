"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { BRAND_NAME } from "@/lib/brand";

export interface RewardedAdProps {
  /** How long the ad must play, from the server's ad session. */
  seconds: number;
  /** Called once the ad has played to the end. */
  onComplete: () => void;
  /** Called if the viewer closes it early. No reward. */
  onClose: () => void;
}

/**
 * PLACEHOLDER rewarded ad. It shows a house ad with a countdown, so the whole
 * "watch an ad to unlock" flow works before an ad network is approved.
 *
 * To use a real network later, replace only this component: keep the props, call
 * onComplete when the network reports the reward, onClose otherwise. The server
 * still refuses to grant a credit if less than the required time has passed.
 */
export function RewardedAd({ seconds, onComplete, onClose }: RewardedAdProps) {
  const [left, setLeft] = useState(seconds);
  const done = left <= 0;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !done && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ad-title"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border-2 border-ink bg-sheet p-5 text-ink">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-hi px-2 py-0.5 text-[0.68rem] font-bold tracking-wider text-on-hi uppercase">
            Ad
          </span>
          <span className="font-mono text-sm text-ink-soft tabular-nums" aria-live="polite">
            {done ? "Unlocked" : `Unlocks in ${left}s`}
          </span>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-line p-4">
          <h2 id="ad-title" className="font-hand text-3xl leading-tight font-bold">
            Your friends, ranked.
          </h2>
          <p className="text-ink-soft">
            Send your {BRAND_NAME} link to the group chat and see who really pays attention. Pro is
            coming soon: unlimited AI questions and no ads.
          </p>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Ad progress"
          aria-valuemin={0}
          aria-valuemax={seconds}
          aria-valuenow={seconds - left}
        >
          <div
            className="h-full bg-pink transition-[width] duration-300"
            style={{ width: `${((seconds - left) / seconds) * 100}%` }}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {done ? (
            <Button variant="pink" onClick={onComplete}>
              Claim and write questions
            </Button>
          ) : (
            <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose}>
              Close without unlocking
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
