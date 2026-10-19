import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { FREE_FEATURES, PRODUCTS, priceLabel } from "@/lib/pricing";

export const metadata: Metadata = { title: "Pricing" };

export default function PricingPage() {
  const oneTime = PRODUCTS.filter((p) => p.billing === "one_time");
  const plans = PRODUCTS.filter((p) => p.billing === "subscription");

  return (
    <PolicyPage eyebrow="Pricing" title="Free to play. Extras if you want them.">
      <h2>Free for everyone</h2>
      <ul>
        {FREE_FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <h2>One-time unlocks</h2>
      <PriceTable items={oneTime} />

      <h2>Pro plan</h2>
      <PriceTable items={plans} />
      <p className="text-sm text-ink-soft">
        Pro renews automatically until you cancel. You can cancel any time; it stays active until
        the end of the period you paid for.
      </p>

      <h2>Good to know</h2>
      <ul>
        <li>Prices are in Indian Rupees (INR) and include all applicable taxes.</li>
        <li>
          Payments are processed securely by Razorpay: UPI, debit and credit cards, net banking and
          wallets. We never see or store your card or UPI details.
        </li>
        <li>Unlocks are digital and appear in the app as soon as payment is confirmed.</li>
        <li>
          See our <Link href="/refunds">cancellation and refund policy</Link> and{" "}
          <Link href="/terms">terms</Link>.
        </li>
      </ul>
    </PolicyPage>
  );
}

function PriceTable({ items }: { items: typeof PRODUCTS }) {
  return (
    <ul className="!flex-col !gap-0">
      {items.map((p) => (
        <li
          key={p.id}
          className="!ml-0 grid !list-none grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line py-2.5 first:border-t-0"
        >
          <span className="font-semibold">{p.name}</span>
          <span className="font-mono font-bold tabular-nums">{priceLabel(p)}</span>
          <span className="col-span-2 text-sm text-ink-soft">
            {p.description} <span className="whitespace-nowrap">Applies to {p.scope}.</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
