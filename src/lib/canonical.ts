/**
 * Where to send a production request that arrived on a secondary address
 * (the old *.vercel.app address, or www.), or null to serve it as is.
 *
 * Off until CANONICAL_HOST is set in Vercel, and never applied to preview builds,
 * so pull-request previews keep working on their own addresses.
 */
export function canonicalRedirect(
  host: string | null,
  pathAndQuery: string,
  env: { canonicalHost?: string; vercelEnv?: string },
): string | null {
  const canonical = env.canonicalHost?.trim().toLowerCase();
  if (!canonical || env.vercelEnv !== "production" || !host) return null;
  const h = host.toLowerCase().split(":")[0];
  if (h === canonical) return null;
  if (h.endsWith(".vercel.app") || h === `www.${canonical}`) {
    return `https://${canonical}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`;
  }
  return null;
}
