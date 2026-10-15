/**
 * Where to send someone after signing in. Only same-site paths are allowed, so a
 * crafted link like /login?next=https://evil.example can't bounce users elsewhere.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/me"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
