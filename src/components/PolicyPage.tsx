import { PageShell } from "@/components/PageShell";
import { Sheet } from "@/components/ui/Sheet";
import { BUSINESS, businessIsDraft, formatPolicyDate } from "@/lib/business";

/** Frame for the About, Contact, Pricing and policy pages: readable prose on a sheet. */
export function PolicyPage({
  eyebrow,
  title,
  children,
  showUpdated = true,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  showUpdated?: boolean;
}) {
  const draft = businessIsDraft();
  return (
    <PageShell>
      <Sheet ruled>
        <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">{eyebrow}</span>
        <h1 className="font-hand text-4xl leading-tight font-bold">{title}</h1>
        {showUpdated && (
          <p className="text-sm text-ink-soft">
            Last updated {formatPolicyDate(BUSINESS.policiesUpdated)}
          </p>
        )}
      </Sheet>
      {draft && (
        <p role="note" className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">
          Draft: business details in [square brackets] are placeholders and will be filled in before
          launch.
        </p>
      )}
      <Sheet>
        <div className="flex max-w-[65ch] flex-col gap-3 leading-relaxed [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </Sheet>
    </PageShell>
  );
}

/** The business's postal address, one line each. */
export function Address() {
  return (
    <address className="not-italic">
      {BUSINESS.address.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}
