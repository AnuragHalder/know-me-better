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
        Everything we sell is a digital feature that is delivered to your account the moment payment
        is confirmed. Because of this, <b>purchases are final once delivered</b>, and we don&apos;t
        offer refunds for a change of mind or for features you chose not to use.
      </p>

      <h2>When we do refund</h2>
      <p>We refund the full amount only when a payment went wrong:</p>
      <ul>
        <li>You were charged but the feature was never delivered to your account.</li>
        <li>You were charged more than once for the same purchase.</li>
        <li>The payment failed but money was still deducted and not returned automatically.</li>
      </ul>

      <h2>How to ask</h2>
      <p>
        Email {BUSINESS.email} within {ask} days of the payment with your Razorpay payment ID (it
        starts with <code>pay_</code>), the email you signed in with, and what went wrong.
      </p>

      <h2>How long it takes</h2>
      <p>
        We review requests within 2 working days. Approved refunds are processed through Razorpay to
        your original payment method within {send} working days. Your bank or UPI app may take a few
        more days to show it.
      </p>

      <h2>Failed payments</h2>
      <p>
        If money left your account but the payment failed, your bank or UPI app usually reverses it
        automatically within 5–7 working days. If it doesn&apos;t, write to us within {ask} days.
      </p>

      <h2>Cancelling Pro</h2>
      <ul>
        <li>
          Pro renews automatically. You can cancel the renewal at any time from your account page,
          or from your UPI app&apos;s AutoPay settings.
        </li>
        <li>
          After you cancel, Pro stays active until the end of the period you&apos;ve already paid
          for, and you won&apos;t be charged again.
        </li>
        <li>Payments already made for the current period aren&apos;t refunded.</li>
      </ul>

      <p>
        Questions? <Link href="/contact">Contact us</Link>.
      </p>
    </PolicyPage>
  );
}
