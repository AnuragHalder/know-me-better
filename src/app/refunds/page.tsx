import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Cancellation and refunds" };

export default function RefundsPage() {
  const ask = BUSINESS.refundRequestDays;
  const send = BUSINESS.refundProcessingDays;
  return (
    <PolicyPage eyebrow="Cancellation and refunds" title="Cancellations and refunds">
      <p>
        Everything we sell is digital and delivered instantly, so purchases are generally final once
        delivered. We always refund when something went wrong on our side.
      </p>

      <h2>When you get a full refund</h2>
      <ul>
        <li>You were charged but the unlock never appeared in your account.</li>
        <li>You were charged twice for the same thing.</li>
        <li>A technical fault on our side stopped the feature from working.</li>
      </ul>

      <h2>How to ask for a refund</h2>
      <p>
        Email {BUSINESS.email} within {ask} days of the payment with your Razorpay payment ID (it
        starts with <code>pay_</code>), the email you signed in with, and what went wrong.
      </p>

      <h2>How long it takes</h2>
      <p>
        We review requests within 2 working days. Approved refunds are sent to your original payment
        method within {send} working days. Your bank or UPI app may take a few more days to show it.
      </p>

      <h2>Failed payments</h2>
      <p>
        If money left your account but the payment failed, your bank or UPI app reverses it
        automatically, usually within 5–7 working days. Contact us if it doesn&apos;t.
      </p>

      <h2>Cancelling Pro</h2>
      <ul>
        <li>
          You can cancel Pro at any time from your account page, or from your UPI app&apos;s AutoPay
          settings.
        </li>
        <li>
          Pro stays active until the end of the period you&apos;ve paid for. We don&apos;t refund
          the unused part of a period, except where the law requires it.
        </li>
        <li>No further charges are made after you cancel.</li>
      </ul>

      <p>
        Questions? <Link href="/contact">Contact us</Link>.
      </p>
    </PolicyPage>
  );
}
