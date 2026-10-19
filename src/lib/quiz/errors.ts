/**
 * The database raises short codes (see docs/DATABASE.md). Turn them into sentences.
 * Matches on the code anywhere in the message, since drivers may add prefixes.
 */
const MESSAGES: Record<string, string> = {
  sign_in_required: "Your session ended. Sign in again, then save.",
  invalid_name: "Add your name (up to 24 characters).",
  need_10_questions: "Your page needs exactly 10 questions.",
  invalid_questions: "One of the questions isn't available any more. Swap it and try again.",
  invalid_text: "Each question needs 3 to 140 characters.",
  invalid_options: "Each question needs 4 different options, up to 60 characters each.",
  text_not_allowed: "Some of your wording isn't allowed. Keep it friendly and try again.",
  ad_limit: "That's all the ad unlocks for today. Come back tomorrow, or get Pro.",
  ad_too_short: "The ad has to play to the end to unlock.",
  ad_not_found: "That ad session expired. Watch it again to unlock.",
  invalid_topics: "Add a topic or two (up to 200 characters).",
  needs_unlock: "Watch a short ad or get Pro to write questions with AI.",
  daily_limit: "You've used today's AI limit. Try again tomorrow.",
  ai_unavailable: "AI questions aren't available right now. Pick or write your own instead.",
  attempt_not_found: "That round isn't yours, or it has expired. Reload the page.",
  quiz_has_plays: "A friend has already started playing, so the answers are locked.",
  quiz_not_found: "That quiz doesn't exist, or it isn't yours.",
  already_played: "You've already played this quiz.",
  own_quiz: "This is your own quiz. Send it to friends instead.",
  attempt_finished: "This round is already finished.",
  invalid_choice: "Pick one of the options.",
  not_allowed: "Finish the quiz to see the leaderboard.",
};

export function quizErrorMessage(message: string | null | undefined): string {
  const m = message ?? "";
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (m.includes(code)) return text;
  }
  return "Something went wrong. Try again in a moment.";
}
