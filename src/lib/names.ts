/** Longest name we show on quizzes and leaderboards (matches the database check). */
export const MAX_NAME_LENGTH = 24;

/** Tidy a typed name: trim, collapse inner spaces, drop control characters. */
export function cleanName(input: string): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why a name can't be used, or null if it's fine. */
export function nameProblem(input: string): string | null {
  const name = cleanName(input);
  if (!name) return "Add your name so your friend knows it's you.";
  if ([...name].length > MAX_NAME_LENGTH) return `Keep it under ${MAX_NAME_LENGTH + 1} characters.`;
  return null;
}
