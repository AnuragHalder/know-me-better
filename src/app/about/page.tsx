import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/PolicyPage";
import { BRAND_NAME } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";
import { FEATURES } from "@/lib/features";

export const metadata: Metadata = {
  title: "About",
  description: `What you can play on ${BRAND_NAME}: the friendship quiz, story mode and live party games.`,
};

export default function AboutPage() {
  return (
    <PolicyPage eyebrow="About us" title={`What is ${BRAND_NAME}?`} showUpdated={false}>
      <p>
        {BRAND_NAME} is a set of games that show which friend really knows you, in the spirit of the
        slam books we passed around in school. Make something about yourself and send the link, or
        get the whole group into a room and play together. Friends never need to sign up.
      </p>

      {FEATURES.map((f) => (
        <section key={f.id} aria-labelledby={`feature-${f.id}`} className="flex flex-col gap-2">
          <h2 id={`feature-${f.id}`}>
            <Link href={f.href}>{f.title}</Link>
          </h2>
          <p>{f.summary}</p>
          <ul>
            {f.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}

      <h2>What&apos;s free and what&apos;s paid</h2>
      <p>
        Making and playing everything is free. A few optional extras are paid, such as a second
        chance to replay a friend&apos;s quiz, turning off second chances on your own quiz, or
        seeing everyone on your leaderboard beyond the top 10. Everything is delivered instantly in
        the app. See <Link href="/pricing">Pricing</Link> for the full list.
      </p>
      <p>
        There is no real-money gaming, betting or prize money anywhere in {BRAND_NAME}. Points and
        awards are just for bragging rights.
      </p>

      <h2>Map data</h2>
      <p>
        Maps use <a href="https://www.naturalearthdata.com/">Natural Earth</a> data (public domain),
        shown with India&apos;s official boundaries. Place names come from{" "}
        <a href="https://www.geonames.org/">GeoNames</a>, licensed under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </p>

      <h2>Who runs it</h2>
      <p>
        {BRAND_NAME} is run by {BUSINESS.legalName}, India. Questions, feedback or problems:{" "}
        <Link href="/contact">contact us</Link>.
      </p>
    </PolicyPage>
  );
}
