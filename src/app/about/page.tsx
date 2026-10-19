import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PolicyPage eyebrow="About us" title={`What is ${BRAND_NAME}?`} showUpdated={false}>
      <p>
        {BRAND_NAME} is a friendship quiz, in the spirit of the slam books we passed around in
        school. You answer 10 questions about yourself, share a link, and your friends guess your
        answers. A leaderboard shows who knows you best.
      </p>
      <h2>How it works</h2>
      <ul>
        <li>
          Sign in and pick your answers to 10 questions. You can swap questions or reword them.
        </li>
        <li>Share your link or 6-letter code on WhatsApp, Instagram or anywhere else.</li>
        <li>Friends play without signing up. Each friend gets one try.</li>
        <li>Scores appear on your leaderboard as friends finish.</li>
      </ul>
      <h2>What&apos;s free and what&apos;s paid</h2>
      <p>
        Making quizzes and playing them is free. Optional extras, such as revealing which option
        each friend picked or seeing the full leaderboard, are paid. See{" "}
        <Link href="/pricing">Pricing</Link>.
      </p>
      <h2>Who runs it</h2>
      <p>
        {BRAND_NAME} is run by {BUSINESS.legalName}, India. Questions, feedback or problems:{" "}
        <Link href="/contact">contact us</Link>.
      </p>
    </PolicyPage>
  );
}
