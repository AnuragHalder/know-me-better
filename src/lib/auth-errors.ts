/** Turn Supabase Auth errors into sentences a player can act on. */
export function friendlyAuthError(message: string | undefined | null): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) {
    return "Too many codes requested. Wait a minute, then try again.";
  }
  if (m.includes("email address") || m.includes("invalid format")) {
    return "That email address doesn't look right. Check it and try again.";
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("otp")) {
    return "That code is wrong or has expired. Check the newest email, or send a new code.";
  }
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return "Google sign-in isn't switched on yet. Use your email instead.";
  }
  if (m.includes("fetch") || m.includes("network")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return "Something went wrong signing you in. Try again.";
}
