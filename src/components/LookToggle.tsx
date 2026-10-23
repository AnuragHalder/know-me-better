"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { LOOK_COOKIE, LOOK_LABEL, type Look } from "@/lib/look";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Small Clean / Slambook switch in the header. Remembered on this device. */
export function LookToggle({ current }: { current: Look }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function choose(look: Look) {
    if (look === current) return;
    document.cookie = `${LOOK_COOKIE}=${look}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    document.documentElement.dataset.look = look;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label="Look"
      className="flex shrink-0 rounded-full border-2 border-line bg-sheet p-0.5"
    >
      {(["clean", "notebook"] as const).map((look) => (
        <button
          key={look}
          type="button"
          aria-pressed={current === look}
          aria-label={`${LOOK_LABEL[look]} look`}
          title={`${LOOK_LABEL[look]} look`}
          onClick={() => choose(look)}
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-colors",
            current === look ? "bg-ink text-sheet" : "text-ink-soft hover:text-ink",
          )}
        >
          {look === "clean" ? <SparkIcon /> : <PencilIcon />}
        </button>
      ))}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2zm7 13l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}
