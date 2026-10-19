import type { NextConfig } from "next";

/** Other addresses people (and payment reviewers) often type for the policy pages. */
const POLICY_ALIASES: Record<string, string> = {
  "/about-us": "/about",
  "/contact-us": "/contact",
  "/terms-and-conditions": "/terms",
  "/terms-of-service": "/terms",
  "/tos": "/terms",
  "/privacy-policy": "/privacy",
  "/refund-policy": "/refunds",
  "/cancellation-and-refund": "/refunds",
  "/cancellation-refund-policy": "/refunds",
  "/shipping": "/delivery",
  "/shipping-policy": "/delivery",
  "/shipping-and-delivery": "/delivery",
};

const nextConfig: NextConfig = {
  async redirects() {
    return Object.entries(POLICY_ALIASES).map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
