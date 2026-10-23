import { QUESTIONS_PER_QUIZ } from "./verdict";

/** A question from the bank, as the creator sees it. */
export interface BankQuestion {
  id: string;
  prompt_self: string;
  /** Friend-facing wording with a {name} placeholder. */
  prompt_other: string;
  options: string[];
  /** Topic id from TOPICS, or null for untagged questions. */
  topic?: string | null;
}

/** Wording the creator wrote or changed. `promptOther` keeps the {name} placeholder. */
export interface OwnText {
  promptSelf: string | null;
  promptOther: string;
  options: string[];
}

/**
 * One slot on the creator's page.
 *  - bank question as is: `questionId` set, no `text`
 *  - bank question edited: `questionId` set, `text` set
 *  - own or AI-written question: `questionId` null, `text` set
 */
export interface DraftItem {
  /** Stable React key; never sent to the server. */
  key: string;
  questionId: string | null;
  answer: number | null;
  text?: OwnText;
  source?: "custom" | "ai";
}

/** What a card shows, whatever kind of item it is. */
export interface ItemView {
  promptSelf: string | null;
  promptOther: string;
  options: string[];
  edited: boolean;
}

type Rng = () => number;

let keySeq = 0;
export function newKey(prefix = "q"): string {
  keySeq += 1;
  return `${prefix}-${keySeq}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function bankItem(questionId: string, answer: number | null = null): DraftItem {
  return { key: newKey(questionId), questionId, answer };
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
    .map((q) => bankItem(q.id));
}

/** Random bank questions not already on the page. */
function unusedBank<Q extends { id: string }>(items: readonly DraftItem[], bank: readonly Q[]) {
  const used = new Set(items.map((i) => i.questionId).filter(Boolean));
  return bank.filter((q) => !used.has(q.id));
}

type TopicQuestion = { id: string; topic?: string | null };

/**
 * A fresh page from the chosen topics, mixed evenly: questions are taken in turns
 * from each topic, so "Movies + Money" gives about five of each. Topped up from
 * other topics if the chosen ones run short. No topics = a random mix.
 */
export function draftForTopics(
  bank: readonly TopicQuestion[],
  topics: readonly string[],
  count = QUESTIONS_PER_QUIZ,
  rng: Rng = Math.random,
): DraftItem[] {
  if (topics.length === 0) return startDraft(bank, count, rng);
  const piles = topics.map((t) =>
    shuffle(
      bank.filter((q) => q.topic === t),
      rng,
    ),
  );
  const picked: TopicQuestion[] = [];
  for (let round = 0; picked.length < count && piles.some((p) => p.length > round); round++) {
    for (const pile of shuffle(piles, rng)) {
      if (picked.length < count && pile[round]) picked.push(pile[round]);
    }
  }
  const chosen = new Set(picked.map((q) => q.id));
  const rest = shuffle(
    bank.filter((q) => !chosen.has(q.id)),
    rng,
  ).slice(0, count - picked.length);
  return [...picked, ...rest].map((q) => bankItem(q.id));
}

/** Replace one question with a random bank one not already on the page. */
export function swapQuestion(
  items: readonly DraftItem[],
  index: number,
  bank: readonly TopicQuestion[],
  rng: Rng = Math.random,
  /** Prefer questions from these topics when any are left. */
  topics: readonly string[] = [],
): DraftItem[] {
  const unused = unusedBank(items, bank);
  const onTopic = unused.filter((q) => q.topic && topics.includes(q.topic));
  const pool = onTopic.length > 0 ? onTopic : unused;
  if (pool.length === 0 || index < 0 || index >= items.length) return [...items];
  const pick = pool[Math.floor(rng() * pool.length)];
  return items.map((item, i) => (i === index ? bankItem(pick.id) : item));
}

export function setAnswer(items: readonly DraftItem[], index: number, answer: number): DraftItem[] {
  return items.map((item, i) => (i === index ? { ...item, answer } : item));
}

export function answeredCount(items: readonly DraftItem[]): number {
  return items.filter((i) => i.answer !== null).length;
}

/** The wording and options a card shows. */
export function viewItem(
  item: DraftItem,
  byId: ReadonlyMap<string, BankQuestion>,
): ItemView | null {
  const q = item.questionId ? byId.get(item.questionId) : undefined;
  if (item.questionId && !q) return null;
  if (!item.text) {
    if (!q) return null;
    return {
      promptSelf: q.prompt_self,
      promptOther: q.prompt_other,
      options: q.options,
      edited: false,
    };
  }
  // An edited bank question keeps its first-person wording only if the prompt is unchanged.
  const samePrompt = q && item.text.promptOther === q.prompt_other;
  return {
    promptSelf: samePrompt ? q.prompt_self : item.text.promptSelf,
    promptOther: item.text.promptOther,
    options: item.text.options,
    edited: true,
  };
}

/**
 * Save the creator's edit of one card. Editing a bank question back to exactly the
 * bank wording turns it back into a plain bank question.
 */
export function editItem(
  items: readonly DraftItem[],
  index: number,
  text: OwnText,
  byId: ReadonlyMap<string, BankQuestion>,
): DraftItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    const q = item.questionId ? byId.get(item.questionId) : undefined;
    const clean: OwnText = {
      promptSelf: text.promptSelf?.trim() || null,
      promptOther: text.promptOther.trim(),
      options: text.options.map((o) => o.trim()),
    };
    if (q && clean.promptOther === q.prompt_other && sameList(clean.options, q.options)) {
      return { key: item.key, questionId: item.questionId, answer: item.answer };
    }
    return { ...item, text: clean, source: q ? undefined : (item.source ?? "custom") };
  });
}

/** Undo the creator's edits to a bank question. */
export function resetItem(items: readonly DraftItem[], index: number): DraftItem[] {
  return items.map((item, i) =>
    i === index && item.questionId
      ? { key: item.key, questionId: item.questionId, answer: item.answer }
      : item,
  );
}

/**
 * Put AI-written questions on the page, unanswered. Fills any shortfall with bank
 * questions so the page always has `count` questions.
 */
export function draftFromAi(
  generated: readonly { promptSelf: string; promptOther: string; options: string[] }[],
  bank: readonly { id: string }[],
  count = QUESTIONS_PER_QUIZ,
  rng: Rng = Math.random,
): DraftItem[] {
  const own: DraftItem[] = generated.slice(0, count).map((g) => ({
    key: newKey("ai"),
    questionId: null,
    answer: null,
    source: "ai",
    text: { promptSelf: g.promptSelf, promptOther: g.promptOther, options: [...g.options] },
  }));
  const fill = shuffle(unusedBank(own, bank), rng)
    .slice(0, count - own.length)
    .map((q) => bankItem(q.id));
  return [...own, ...fill];
}

function sameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export type RpcItem =
  | { question_id: string; correct_option: number; prompt_other?: string; options?: string[] }
  | {
      source: "custom" | "ai";
      correct_option: number;
      prompt_self?: string;
      prompt_other: string;
      options: string[];
    };

/** The shape `create_quiz` / `update_quiz` expect. Throws if anything is unanswered. */
export function toRpcItems(items: readonly DraftItem[]): RpcItem[] {
  return items.map((item, i) => {
    if (item.answer === null) throw new Error(`Question ${i + 1} has no answer`);
    if (item.questionId) {
      return item.text
        ? {
            question_id: item.questionId,
            correct_option: item.answer,
            prompt_other: item.text.promptOther,
            options: item.text.options,
          }
        : { question_id: item.questionId, correct_option: item.answer };
    }
    if (!item.text) throw new Error(`Question ${i + 1} has no text`);
    return {
      source: item.source ?? "custom",
      correct_option: item.answer,
      ...(item.text.promptSelf ? { prompt_self: item.text.promptSelf } : {}),
      prompt_other: item.text.promptOther,
      options: item.text.options,
    };
  });
}

/** Put the creator's name into a "{name}'s …" prompt. */
export function fillName(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}

/**
 * The reverse of fillName, for text the creator typed with their own name in it:
 * "What's Riya's comfort food?" becomes "What's {name}'s comfort food?", so the
 * quiz still reads right if they change their name later.
 */
export function toTemplate(text: string, name: string): string {
  const n = name.trim();
  if (!n) return text;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu"),
    "{name}",
  );
}

/** A saved quiz question, as the owner reads it back. */
export interface SavedQuestion {
  question_id: string | null;
  prompt: string;
  prompt_self: string | null;
  options: string[];
  correct_option: number;
  source: "bank" | "edited" | "custom" | "ai";
}

/**
 * Turn a saved quiz back into an editable page. A bank question that has since
 * left the bank keeps its saved wording as the creator's own question.
 */
export function draftFromSaved(
  saved: readonly SavedQuestion[],
  byId: ReadonlyMap<string, BankQuestion>,
): DraftItem[] {
  return saved.map((q) => {
    const inBank = q.question_id ? byId.get(q.question_id) : undefined;
    const text: OwnText = {
      promptSelf: q.prompt_self,
      promptOther: q.prompt,
      options: [...q.options],
    };
    if (inBank && q.source === "bank") return bankItem(inBank.id, q.correct_option);
    if (inBank)
      return { key: newKey(inBank.id), questionId: inBank.id, answer: q.correct_option, text };
    return {
      key: newKey("own"),
      questionId: null,
      answer: q.correct_option,
      source: q.source === "ai" ? "ai" : "custom",
      text,
    };
  });
}
