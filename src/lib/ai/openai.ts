import "server-only";

import {
  parseGenerated,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  userPrompt,
  type GeneratedQuestion,
} from "./questions";

/**
 * Minimal OpenAI client over fetch. The key is a server-only environment variable
 * (OPENAI_API_KEY); it never reaches the browser.
 */
const API = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4.1-mini";
const TIMEOUT_MS = 30_000;

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    // Log the status only; the body can echo the request.
    throw new Error(`OpenAI ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

/** True if any of the texts breaks OpenAI's content policy. */
export async function isFlagged(texts: string[]): Promise<boolean> {
  const input = texts.map((t) => t.trim()).filter(Boolean);
  if (input.length === 0) return false;
  const data = await call<{ results: { flagged: boolean }[] }>("/moderations", {
    model: "omni-moderation-latest",
    input,
  });
  return data.results.some((r) => r.flagged);
}

/** Ten questions on the creator's topics (fewer if some came back malformed). */
export async function writeQuestions(topics: string): Promise<GeneratedQuestion[]> {
  const data = await call<{ choices: { message: { content: string | null; refusal?: string } }[] }>(
    "/chat/completions",
    {
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      temperature: 0.9,
      max_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(topics) },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    },
  );
  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];
  try {
    return parseGenerated(JSON.parse(content));
  } catch {
    return [];
  }
}

/** All the text in a set of questions, for moderation. */
export function questionTexts(qs: GeneratedQuestion[]): string[] {
  return qs.flatMap((q) => [q.promptSelf, q.promptOther, ...q.options]);
}
