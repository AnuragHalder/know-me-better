/** Path friends open to play a quiz. */
export function playPath(code: string): string {
  return `/play/${code}`;
}

/** The invite a creator sends to friends. */
export function inviteText(url: string, code: string): string {
  return [
    "Think you know me? Take my Know Me Better quiz and see where you land on my leaderboard.",
    url,
    `Code: ${code}`,
  ].join("\n");
}

/** A link that opens WhatsApp with the text ready to send. */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
