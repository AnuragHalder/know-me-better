import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-3">
      <Link href="/" className="font-hand text-2xl font-bold text-ink no-underline">
        <span className="highlight">Know Me Better</span>
      </Link>
    </header>
  );
}
