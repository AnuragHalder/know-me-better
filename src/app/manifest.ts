import type { MetadataRoute } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

/** Lets phones add the site to the home screen with the logo as its icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: "Who Knows Me",
    description: BRAND_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#f3f3f1",
    theme_color: "#121316",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
