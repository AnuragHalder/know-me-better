import type { MetadataRoute } from "next";
import { FOOTER_LINKS } from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/road`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/party`, changeFrequency: "weekly", priority: 0.8 },
    ...FOOTER_LINKS.map((l) => ({
      url: `${SITE_URL}${l.href}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
