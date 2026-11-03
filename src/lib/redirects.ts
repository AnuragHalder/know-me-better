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

/**
 * When the sign-in return address isn't on Supabase's allow list, Supabase falls back
 * to the Site URL and the one-time code lands on an ordinary page (usually "/"),
 * which would leave the person looking signed out. Send such a stray code on to the
 * callback, which finishes the sign-in. Returns null when there's nothing to do.
 */
export function strayAuthCode(pathname: string, search: string): string | null {
  if (pathname.startsWith("/auth/")) return null;
  const params = new URLSearchParams(search);
  const code = params.get("code");
  // Supabase codes are UUIDs; anything else (e.g. a quiz code param) is left alone.
  if (!code || !/^[0-9a-f-]{20,}$/i.test(code)) return null;
  const to = new URLSearchParams({ code, next: pathname === "/" ? "/me" : pathname });
  return `/auth/callback?${to.toString()}`;
}
