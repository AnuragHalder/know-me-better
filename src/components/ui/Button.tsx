import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "ink" | "pink" | "ghost";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border-2 font-bold no-underline " +
  "transition-transform hover:-translate-y-px active:translate-y-px " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0";

const variants: Record<Variant, string> = {
  ink: "border-ink bg-ink text-sheet",
  pink: "border-pink bg-pink text-white dark:text-paper",
  ghost: "border-ink bg-transparent text-ink",
};

const sizes: Record<Size, string> = {
  md: "min-h-12 px-5 text-base",
  sm: "min-h-11 px-4 text-sm",
};

interface StyleProps {
  variant?: Variant;
  size?: Size;
}

export function buttonClasses({ variant = "ink", size = "md" }: StyleProps = {}, extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps) {
  return <button type={type} className={buttonClasses({ variant, size }, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClasses({ variant, size }, className)} {...props} />;
}
