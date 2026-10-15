import { QUESTIONS_PER_QUIZ } from "./verdict";

/** A question from the bank, as the creator sees it. */
export interface BankQuestion {
  id: string;
  prompt_self: string;
  options: string[];
}

/** One slot on the creator's page: which question, and their answer (option index). */
export interface DraftItem {
  questionId: string;
  answer: number | null;
}

type Rng = () => number;

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A fresh page: `count` different random questions, none answered yet. */
export function startDraft(
  bank: readonly { id: string }[],
  count = QUESTIONS_PER_QUIZ,
  rng: Rng = Math.random,
): DraftItem[] {
  if (bank.length < count) throw new RangeError(`Need at least ${count} questions in the bank`);
  return shuffle(bank, rng)
    .slice(0, count)
    .map((q) => ({ questionId: q.id, answer: null }));
}

/** Replace one question with a random one not already on the page. */
export function swapQuestion(
  items: readonly DraftItem[],
  index: number,
  bank: readonly { id: string }[],
  rng: Rng = Math.random,
): DraftItem[] {
  const used = new Set(items.map((i) => i.questionId));
  const pool = bank.filter((q) => !used.has(q.id));
  if (pool.length === 0 || index < 0 || index >= items.length) return [...items];
  const pick = pool[Math.floor(rng() * pool.length)];
  return items.map((item, i) => (i === index ? { questionId: pick.id, answer: null } : item));
}

export function setAnswer(items: readonly DraftItem[], index: number, answer: number): DraftItem[] {
  return items.map((item, i) => (i === index ? { ...item, answer } : item));
}

export function answeredCount(items: readonly DraftItem[]): number {
  return items.filter((i) => i.answer !== null).length;
}

/** The shape `create_quiz` / `update_quiz` expect. Throws if anything is unanswered. */
export function toRpcItems(items: readonly DraftItem[]) {
  return items.map((item, i) => {
    if (item.answer === null) throw new Error(`Question ${i + 1} has no answer`);
    return { question_id: item.questionId, correct_option: item.answer };
  });
}

/** Put the creator's name into a "{name}'s …" prompt. */
export function fillName(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}
