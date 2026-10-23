import type { Metadata, Viewport } from "next";
// Fonts ship with the app (no Google Fonts request at runtime or build time).
import "@fontsource-variable/figtree/index.css";
import "@fontsource/kalam/latin-400.css";
import "@fontsource/kalam/latin-700.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "./globals.css";
import { DEFAULT_LOOK } from "@/lib/look";
import { visitorLook } from "@/lib/look-server";
import { BRAND_NAME, BRAND_TAGLINE, SITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND_NAME, template: `%s · ${BRAND_NAME}` },
  description: BRAND_TAGLINE,
  applicationName: BRAND_NAME,
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
    locale: "en_IN",
  },
  twitter: { card: "summary", title: BRAND_NAME, description: BRAND_TAGLINE },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#11131c" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const look = (await visitorLook()) ?? DEFAULT_LOOK;
  return (
    <html lang="en" data-look={look}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
