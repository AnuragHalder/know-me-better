import { BRAND_NAME } from "@/lib/brand";
import { verdict } from "./verdict";

/** Path friends open to play a quiz. */
export function playPath(code: string): string {
  return `/play/${code}`;
}

/** The invite a creator sends to friends. */
export function inviteText(url: string, code: string): string {
  return [
    `Who knows me better? Take my quiz on ${BRAND_NAME} and see where you land on my leaderboard.`,
    url,
    `Code: ${code}`,
  ].join("\n");
}

/** A link that opens WhatsApp with the text ready to send. */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** What a player shares after finishing: score, verdict, the green/red grid, the link. */
export function resultText(ownerName: string, results: readonly boolean[], url: string): string {
  const score = results.filter(Boolean).length;
  return [
    `I got ${score}/${results.length} on ${ownerName}'s quiz: ${verdict(score, results.length)}`,
    results.map((r) => (r ? "🟩" : "🟥")).join(""),
    `How well do you know ${ownerName}? ${url}`,
  ].join("\n");
}
