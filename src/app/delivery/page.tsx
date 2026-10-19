import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Shipping and delivery" };

export default function DeliveryPage() {
  return (
    <PolicyPage eyebrow="Shipping and delivery" title="How purchases are delivered">
      <p>
        {BRAND_NAME} sells digital features only. Nothing is shipped, and there are no delivery
        charges.
      </p>
      <h2>When you get what you paid for</h2>
      <ul>
        <li>
          One-time unlocks (such as Reveal answers or Full leaderboard) appear in your account
          immediately after Razorpay confirms the payment, usually within a few seconds.
        </li>
        <li>Pro features start immediately and last for the period you paid for.</li>
        <li>Unlocks are tied to the account you were signed in with when you paid.</li>
      </ul>
      <h2>If an unlock doesn&apos;t appear</h2>
      <p>
        Refresh the page. If it still isn&apos;t there after 15 minutes, email {BUSINESS.email} with
        your Razorpay payment ID. We&apos;ll deliver it or refund you, as described in our{" "}
        <Link href="/refunds">refund policy</Link>.
      </p>
    </PolicyPage>
  );
}
