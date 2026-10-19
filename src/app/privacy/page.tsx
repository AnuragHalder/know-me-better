import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <PolicyPage eyebrow="Privacy policy" title="Your data, plainly explained">
      <p>
        This policy explains what {BUSINESS.legalName} (&quot;we&quot;) collects when you use{" "}
        {BRAND_NAME}, why, who else handles it, and your rights under India&apos;s Digital Personal
        Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <b>If you make a quiz:</b> your email address, and your name and profile photo if you sign
          in with Google; the name you show on your quiz; your questions and answers.
        </li>
        <li>
          <b>If you play a friend&apos;s quiz:</b> the name you type, the options you pick, your
          score, and a random guest ID stored in your browser so you get one fair try. You
          don&apos;t need to give an email.
        </li>
        <li>
          <b>If you pay:</b> Razorpay collects your payment details. We receive only the order and
          payment IDs, the amount, and whether it succeeded. We never see or store card numbers, UPI
          PINs or bank details.
        </li>
        <li>
          <b>If you use AI questions:</b> the topics you type.
        </li>
        <li>
          <b>Technical data:</b> sign-in cookies, IP address and basic device information, used to
          keep you signed in, keep the service secure and prevent abuse.
        </li>
      </ul>

      <h2>Who sees what in the app</h2>
      <ul>
        <li>Anyone with your quiz link sees your quiz name and questions, never your answers.</li>
        <li>
          Players&apos; names and scores appear on the quiz&apos;s leaderboard, visible to the
          quiz&apos;s creator and to other players who finished.
        </li>
        <li>
          The quiz&apos;s creator can see which option each player picked if they buy the
          &quot;Reveal answers&quot; feature.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        To run the service (quizzes, scores, leaderboards and sign-in), to process payments and
        deliver what you bought, to prevent cheating and abuse, to answer support requests, and to
        meet legal duties such as tax records. We don&apos;t sell your personal data.
      </p>

      <h2>Who handles it for us</h2>
      <ul>
        <li>Supabase: database and sign-in.</li>
        <li>Vercel: website hosting.</li>
        <li>Google: &quot;Continue with Google&quot; sign-in, and ads where shown.</li>
        <li>Razorpay: payments.</li>
        <li>OpenAI: writes questions from the topics you type (no email or name is sent).</li>
        <li>Our email provider: sends sign-in and support emails.</li>
      </ul>
      <p>
        These providers may store data on servers outside India. They process it only to provide
        their service to us, under their own security and privacy commitments.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Quizzes and their scores: until you delete the quiz or your account.</li>
        <li>Guest player data: for as long as the quiz exists.</li>
        <li>Payment records: as long as Indian tax law requires (generally 8 years).</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask us to give you a summary of your data, correct it, delete it, or withdraw your
        consent. Deleting a quiz in the app deletes its plays and scores. To delete your account, or
        for anything else, email {BUSINESS.email}. We respond within 30 days. If you are unhappy
        with our answer, you may complain to the Data Protection Board of India.
      </p>

      <h2>Children</h2>
      <p>
        Making quizzes and paying are for people aged {BUSINESS.minimumAge} and over. Younger people
        may play only with a parent or guardian&apos;s permission. If you believe a child has given
        us data without that permission, contact us and we will delete it.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies needed to keep you signed in and to stop repeat plays. If we add analytics or
        advertising cookies, we&apos;ll update this policy and ask where the law requires.
      </p>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections, and access to each person&apos;s data is restricted
        by the database itself. No system is perfectly secure; we&apos;ll inform you and the
        authorities of a breach as the law requires.
      </p>

      <h2>Grievance officer</h2>
      <p>
        {BUSINESS.grievanceOfficer}, {BUSINESS.email}, {BUSINESS.phone}. See also our{" "}
        <Link href="/contact">contact page</Link>.
      </p>
    </PolicyPage>
  );
}
