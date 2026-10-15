import "server-only";

import { headers } from "next/headers";

/**
 * This deployment's own address (production, a preview, or localhost), for links
 * people will share. Uses the request's host so preview links point at the preview.
 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
