/**
 * Supabase connection details. Both are public by design: what a visitor can do is
 * decided by the database's row-level security, not by hiding these.
 * Returns null when they aren't set (e.g. in CI), so pages can render a friendly state.
 */
export function supabaseEnv(): { url: string; key: string } | null {
  // Referenced literally so Next.js can inline them into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}
