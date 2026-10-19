import type { Metadata } from "next";
import Link from "next/link";
import { Address, PolicyPage } from "@/components/PolicyPage";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <PolicyPage eyebrow="Contact us" title="Get in touch" showUpdated={false}>
      <p>
        For help with a quiz, a payment, a refund or your data, write to us. We reply within 2
        working days.
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="font-semibold">Email</dt>
        <dd className="break-all">{BUSINESS.email}</dd>
        <dt className="font-semibold">Phone</dt>
        <dd>{BUSINESS.phone}</dd>
        <dt className="font-semibold">Business</dt>
        <dd>
          {BUSINESS.legalName}
          <span className="block text-sm text-ink-soft">operating {BRAND_NAME}</span>
        </dd>
        <dt className="font-semibold">Address</dt>
        <dd>
          <Address />
        </dd>
        {BUSINESS.gstin && (
          <>
            <dt className="font-semibold">GSTIN</dt>
            <dd>{BUSINESS.gstin}</dd>
          </>
        )}
      </dl>
      <h2>Payment or refund question?</h2>
      <p>
        Include your Razorpay payment ID (it starts with <code>pay_</code> and is in your payment
        confirmation) and the email you signed in with. See our{" "}
        <Link href="/refunds">refund policy</Link>.
      </p>
      <h2>Privacy and complaints</h2>
      <p>
        Our grievance officer is {BUSINESS.grievanceOfficer}, reachable at {BUSINESS.email}. See our{" "}
        <Link href="/privacy">privacy policy</Link> for your rights over your data.
      </p>
    </PolicyPage>
  );
}
