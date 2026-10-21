/**
 * The price list. One source of truth for the Pricing page, the policies and (from
 * Phase 8) the Razorpay checkout. `id` matches the `purchases.product` values the
 * database accepts. Amounts are in paise (₹1 = 100 paise), as Razorpay expects.
 */
export interface Product {
  id:
    | "reveal"
    | "full_board"
    | "second_chance"
    | "lock_retries"
    | "pro_monthly"
    | "pro_yearly"
    | "edition_couples"
    | "edition_birthday";
  name: string;
  description: string;
  amountPaise: number;
  /** "one_time" unlocks never renew; "subscription" renews until cancelled. */
  billing: "one_time" | "subscription";
  /** What the unlock applies to. */
  scope: "one quiz" | "one attempt" | "your account";
  period?: "month" | "year";
}

export const PRODUCTS: readonly Product[] = [
  {
    id: "reveal",
    name: "Reveal answers",
    description: "See which option each friend picked, on every question of one quiz.",
    amountPaise: 2900,
    billing: "one_time",
    scope: "one quiz",
  },
  {
    id: "full_board",
    name: "Full leaderboard",
    description: "See every friend who played one quiz, not just the top 10.",
    amountPaise: 4900,
    billing: "one_time",
    scope: "one quiz",
  },
  {
    id: "second_chance",
    name: "Second chance",
    description: "Play a friend's quiz one more time. Your best score counts.",
    amountPaise: 900,
    billing: "one_time",
    scope: "one attempt",
  },
  {
    id: "lock_retries",
    name: "Lock retries",
    description: "Friends get one go only on your quiz: no second chances.",
    amountPaise: 2900,
    billing: "one_time",
    scope: "one quiz",
  },
  {
    id: "edition_birthday",
    name: "Birthday edition",
    description: "Birthday questions and a best-friend certificate for the top scorer.",
    amountPaise: 4900,
    billing: "one_time",
    scope: "one quiz",
  },
  {
    id: "edition_couples",
    name: "Couples edition",
    description: "Questions for partners. Both of you play and compare.",
    amountPaise: 9900,
    billing: "one_time",
    scope: "one quiz",
  },
  {
    id: "pro_monthly",
    name: "Pro, monthly",
    description:
      "Unlimited AI-written questions, answers revealed and full leaderboards on every quiz, no ads.",
    amountPaise: 9900,
    billing: "subscription",
    scope: "your account",
    period: "month",
  },
  {
    id: "pro_yearly",
    name: "Pro, yearly",
    description: "Everything in Pro for a year, for less than seven months' price.",
    amountPaise: 69900,
    billing: "subscription",
    scope: "your account",
    period: "year",
  },
];

/** Everything that stays free. Shown on the Pricing page. */
export const FREE_FEATURES = [
  "Make quizzes from the question bank",
  "Edit questions and options in your own words",
  "Unlimited friends can play",
  "Top 10 leaderboard on every quiz",
  "AI-written questions by watching a short ad (limited per day)",
];

export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees.toLocaleString("en-IN") : rupees.toFixed(2)}`;
}

export function priceLabel(p: Product): string {
  return p.period ? `${formatRupees(p.amountPaise)}/${p.period}` : formatRupees(p.amountPaise);
}
