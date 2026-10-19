import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { BRAND_NAME, SITE_URL } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  const site = SITE_URL.replace(/^https?:\/\//, "");
  return (
    <PolicyPage eyebrow="Terms and conditions" title="Terms of use">
      <p>
        These terms apply to {BRAND_NAME} at {site} (&quot;the service&quot;), run by{" "}
        {BUSINESS.legalName} (&quot;we&quot;, &quot;us&quot;). By using the service you agree to
        them. If you don&apos;t agree, please don&apos;t use it.
      </p>

      <h2>1. Who can use it</h2>
      <ul>
        <li>
          You must be {BUSINESS.minimumAge} or older to make a quiz, create an account or pay. If
          you are younger, you may play a friend&apos;s quiz only with the permission and
          supervision of a parent or guardian.
        </li>
        <li>You must give accurate information and keep your sign-in secure.</li>
      </ul>

      <h2>2. Your quizzes and what you write</h2>
      <ul>
        <li>
          You own the questions, answers and names you add. You let us store and show them to the
          people you share your quiz with, so the service can work.
        </li>
        <li>
          Don&apos;t post anything that is hateful, sexual, threatening, harassing, defamatory or
          illegal, that shares someone else&apos;s private information, or that pretends to be
          someone else.
        </li>
        <li>
          We may remove content or suspend accounts that break these rules, without a refund for
          features used to break them.
        </li>
      </ul>

      <h2>3. AI-written questions</h2>
      <p>
        If you use AI to write questions, the topics you type are sent to our AI provider to create
        them. AI output can be wrong or odd. Check every question before you share your quiz; you
        are responsible for what you publish.
      </p>

      <h2>4. Paid features</h2>
      <ul>
        <li>
          Prices are listed on the <Link href="/pricing">Pricing</Link> page in Indian Rupees and
          include applicable taxes. We may change prices; changes don&apos;t affect purchases
          already made.
        </li>
        <li>
          Payments are processed by Razorpay. Paid features are digital and delivered instantly (see{" "}
          <Link href="/delivery">Delivery</Link>).
        </li>
        <li>
          Pro is a subscription that renews automatically each month or year until you cancel. You
          can cancel any time; it stays active until the end of the paid period.
        </li>
        <li>
          Refunds follow our <Link href="/refunds">cancellation and refund policy</Link>.
        </li>
      </ul>

      <h2>5. Ads</h2>
      <p>
        Some free features may be unlocked by watching an ad. Ads are provided by third parties and
        their content is their responsibility.
      </p>

      <h2>6. Our service</h2>
      <ul>
        <li>
          The name, design and software of {BRAND_NAME} belong to us. Don&apos;t copy or misuse
          them.
        </li>
        <li>
          We work to keep the service running but can&apos;t promise it will always be available or
          error-free. We may change or stop features.
        </li>
        <li>
          To the extent the law allows, our total liability to you is limited to the amount you paid
          us in the 3 months before the claim.
        </li>
      </ul>

      <h2>7. Ending your use</h2>
      <p>
        You can stop using the service and delete your quizzes at any time. To delete your account
        and data, see our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>8. Changes and law</h2>
      <p>
        We may update these terms; the date at the top shows the latest version, and we&apos;ll tell
        signed-in users about important changes. These terms are governed by the laws of India, and
        the courts at {BUSINESS.jurisdictionCity} have jurisdiction.
      </p>

      <h2>9. Contact</h2>
      <p>
        {BUSINESS.legalName}, {BUSINESS.email}, {BUSINESS.phone}. More on the{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </PolicyPage>
  );
}
