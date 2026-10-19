/** The product name. Change it here and every title, header and invite follows. */
export const BRAND_NAME = "Who Knows Me Better";

/** One-line description used in link previews and search results. */
export const BRAND_TAGLINE =
  "Answer 10 questions about yourself, send the link, and see which friend really knows you.";

/**
 * The public address of the live site, used for link previews, the sitemap and
 * policy pages. Set NEXT_PUBLIC_SITE_URL in Vercel once the domain is connected.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://whoknowsmebetter.in").replace(
  /\/$/,
  "",
);
