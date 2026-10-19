/**
 * Limits for questions in the creator's own words. They mirror
 * `quiz_items_checked` in the database, which checks again on save.
 */
export const PROMPT_MIN = 3;
export const PROMPT_MAX = 140;
export const OPTION_MAX = 60;
export const OPTION_COUNT = 4;

export function promptProblem(text: string): string | null {
  const t = text.trim();
  if (t.length < PROMPT_MIN) return "Write the question (at least 3 characters).";
  if (t.length > PROMPT_MAX) return `Keep the question under ${PROMPT_MAX} characters.`;
  return null;
}

export function optionsProblem(options: readonly string[]): string | null {
  if (options.length !== OPTION_COUNT) return `Give exactly ${OPTION_COUNT} options.`;
  const clean = options.map((o) => o.trim());
  if (clean.some((o) => o.length === 0)) return "Fill in all 4 options.";
  if (clean.some((o) => o.length > OPTION_MAX))
    return `Keep each option under ${OPTION_MAX} characters.`;
  if (new Set(clean.map((o) => o.toLowerCase())).size !== clean.length) {
    return "Make the 4 options different from each other.";
  }
  return null;
}
