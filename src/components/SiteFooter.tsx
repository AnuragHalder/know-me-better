import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS, businessIsDraft } from "@/lib/business";

export const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/delivery", label: "Delivery" },
] as const;

export function SiteFooter() {
  const owner = businessIsDraft() ? BRAND_NAME : BUSINESS.legalName;
  return (
    <footer className="mt-4 flex flex-col gap-2 border-t border-line pt-4 text-sm text-ink-soft">
      <nav aria-label="Site information">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {FOOTER_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-block min-h-8 content-center text-ink-soft">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p>
        © {new Date().getFullYear()} {owner}
      </p>
    </footer>
  );
}
