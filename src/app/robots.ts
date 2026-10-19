import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Personal pages: quizzes, accounts and sign-in callbacks stay out of search results.
      disallow: ["/me", "/create", "/play/", "/auth/", "/login"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
