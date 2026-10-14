export const QUESTIONS_PER_QUIZ = 10;

/** The stamp shown on a player's result, from their number of correct answers. */
export function verdict(score: number, total: number = QUESTIONS_PER_QUIZ): string {
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
    throw new RangeError("score and total must be finite and total must be positive");
  }
  const ratio = Math.min(Math.max(score, 0), total) / total;
  if (ratio === 1) return "Soulmate level";
  if (ratio >= 0.8) return "Best friend";
  if (ratio >= 0.5) return "Good friend";
  if (ratio >= 0.3) return "Acquaintance";
  return "Who are you?";
}
