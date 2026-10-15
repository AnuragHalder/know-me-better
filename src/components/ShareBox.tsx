"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { inviteText, whatsappHref } from "@/lib/quiz/share";

/** Code, link and the three ways to send them: phone share sheet, WhatsApp, copy. */
export function ShareBox({ url, code }: { url: string; code: string }) {
  const text = inviteText(url, code);
  const [canShare, setCanShare] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. Paste it in any chat.");
    } catch {
      const box = document.getElementById("invite-text");
      if (box) {
        const range = document.createRange();
        range.selectNodeContents(box);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setNote("Copy didn't work here. The text is selected; copy it yourself.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Know Me Better", text });
    } catch {
      // Closing the share sheet throws; nothing to do.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          className="font-mono text-3xl font-bold tracking-[0.2em] text-ink"
          aria-label={`Code ${code.split("").join(" ")}`}
        >
          {code}
        </span>
        {canShare && (
          <Button variant="ink" size="sm" onClick={share}>
            Share
          </Button>
        )}
      </div>
      <p
        id="invite-text"
        className="rounded-xl border border-dashed border-ink-soft bg-paper p-3 font-mono text-sm break-words whitespace-pre-line select-all"
      >
        {text}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappHref(text)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-good bg-good px-4 text-sm font-bold text-white no-underline dark:text-paper"
        >
          Send on WhatsApp
        </a>
        <Button variant="ghost" size="sm" onClick={copy}>
          Copy invite
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-ink-soft">
        {note}
      </p>
    </div>
  );
}
