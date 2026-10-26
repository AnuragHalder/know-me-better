import { cn } from "@/lib/cn";

/**
 * The logo mark: a question mark on a highlighter tile. Drawn with the look's
 * tokens, so it is lime on Clean and yellow on Slambook, in light and dark.
 * Full-colour exports live in public/brand/ (see docs/BRAND.md).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="120" height="120" rx="28" className="fill-hi" />
      <g transform="translate(10 14) scale(0.9)" className="stroke-on-hi">
        <path
          d="M32 38 C32 22 44 14 54 14 C68 14 76 24 76 35 C76 47 66 52 58 57 C54 60 53 63 53 69"
          fill="none"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="53" cy="86" r="9" className="fill-on-hi" stroke="none" />
      </g>
    </svg>
  );
}
