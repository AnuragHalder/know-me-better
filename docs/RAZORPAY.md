# Razorpay rollout

Everything needed to take payments for Who Knows Me Better, in order. Business steps are marked
**(you)**; code steps are marked **(app)**. Not legal or tax advice: have a CA check GST and
business registration.

## 0. What we sell

Single source of truth: `src/lib/pricing.ts` (shown on `/pricing`).

| Product id         | Name             | Price   | Type                  |
| ------------------ | ---------------- | ------- | --------------------- |
| `reveal`           | Reveal answers   | ₹29     | one-time, one quiz    |
| `full_board`       | Full leaderboard | ₹49     | one-time, one quiz    |
| `second_chance`    | Second chance    | ₹10     | one-time, one attempt |
| `edition_birthday` | Birthday edition | ₹49     | one-time, one quiz    |
| `edition_couples`  | Couples edition  | ₹99     | one-time, one quiz    |
| `pro_monthly`      | Pro, monthly     | ₹99/mo  | subscription          |
| `pro_yearly`       | Pro, yearly      | ₹699/yr | subscription          |

A test (`src/lib/pricing.test.ts`) fails if this list and the database's allowed products drift
apart.

## 1. Business readiness (you)

- [ ] Decide the legal entity: your name as an individual, or a sole proprietorship (Udyam
      registration + current account in the business name). Razorpay may require a business
      account for website payments.
- [ ] Public contact email on the domain, e.g. `hello@whoknowsmebetter.in` (GoDaddy
      Professional Email is already bought).
- [ ] Fill in `src/lib/business.ts`: legal name exactly as on PAN/KYC, email, phone, full
      address, jurisdiction city, grievance officer. While any `[placeholder]` remains, every
      policy page shows a red "Draft" notice.
- [ ] GST: registration is usually required once turnover crosses the threshold for services.
      Ask your CA. When registered, add the GSTIN to `business.ts`; it appears on the Contact
      page.

## 2. Website must be live and complete before you submit (you + app)

Razorpay's reviewers open the site. Check each item on the live domain, signed out:

- [ ] `https://whoknowsmebetter.in` loads over HTTPS (see `docs/LAUNCH.md`).
- [ ] Footer on every page links to all of these, and each opens without signing in:

| Razorpay asks for            | Our page                             |
| ---------------------------- | ------------------------------------ |
| About us                     | https://whoknowsmebetter.in/about    |
| Contact us                   | https://whoknowsmebetter.in/contact  |
| Pricing details              | https://whoknowsmebetter.in/pricing  |
| Terms and conditions         | https://whoknowsmebetter.in/terms    |
| Privacy policy               | https://whoknowsmebetter.in/privacy  |
| Cancellation & refund policy | https://whoknowsmebetter.in/refunds  |
| Shipping / delivery policy   | https://whoknowsmebetter.in/delivery |

Common alternative addresses (`/privacy-policy`, `/refund-policy`, `/shipping`,
`/contact-us`, `/terms-and-conditions`, …) redirect to these automatically.

- [ ] No "Draft" notice on any policy page (all business details filled in).
- [ ] Name, address, email and phone on `/contact` match your Razorpay KYC exactly.
- [ ] Prices on `/pricing` are in ₹ and match what checkout will charge.

## 3. Add the website in Razorpay (you)

Dashboard → **Account & Settings** → **Business website detail** (under "Website and app
settings").

- **Option A: Add additional website/app details.** Keeps your existing web app working.
  Only offered to accounts in the e-commerce category; reviewed manually. Up to 5 extra sites.
- **Option B: Edit the existing website.** Replaces the other app's URL. Only if you no longer
  take payments there.
- **Option C: Neither available, or the business category doesn't fit.** Contact Razorpay
  support from the dashboard, or open a new account for the new business.

When asked, describe the business plainly:

> Who Knows Me Better (whoknowsmebetter.in) is an online friendship-quiz web app. Users create
> a quiz about themselves and share it with friends. Playing is free. We sell optional digital
> features delivered instantly in the app: revealing friends' answers, full leaderboards,
> themed editions and a Pro subscription (₹10–₹699). No real-money gaming, betting or prizes.

Paste the page URLs from the table above. Expect follow-up questions; reply from the
registered email.

## 4. Test mode setup (you, then app)

1. Dashboard top bar → switch to **Test Mode**.
2. **Account & Settings → API Keys → Generate test key**. You get a Key ID (`rzp_test_…`) and
   Key Secret, shown once.
3. **Account & Settings → Webhooks → Add new webhook**:
   - URL: `https://whoknowsmebetter.in/api/razorpay/webhook` (built in Phase 8)
   - Secret: a long random string you make up (save it; it becomes `RAZORPAY_WEBHOOK_SECRET`)
   - Active events: `order.paid`, `payment.captured`, `payment.failed`, `refund.processed`,
     and for Pro: `subscription.activated`, `subscription.charged`, `subscription.cancelled`,
     `subscription.halted`, `subscription.completed`
4. **Payment capture:** set to **Automatic** (Account & Settings → Payment capture), so
   successful payments are captured without a separate API call.
5. **Subscriptions** (for Pro): enable the Subscriptions product if prompted, then create two
   **Plans**: "Pro monthly" ₹99 every 1 month, "Pro yearly" ₹699 every 1 year. Note the
   `plan_…` IDs.
6. In **Vercel → Settings → Environment Variables**, add for **Preview and Production**
   (never `NEXT_PUBLIC_`):

| Name                        | Value                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `RAZORPAY_KEY_ID`           | `rzp_test_…`                                                   |
| `RAZORPAY_KEY_SECRET`       | test key secret                                                |
| `RAZORPAY_WEBHOOK_SECRET`   | the webhook secret from step 3                                 |
| `RAZORPAY_PLAN_PRO_MONTHLY` | `plan_…` (test)                                                |
| `RAZORPAY_PLAN_PRO_YEARLY`  | `plan_…` (test)                                                |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → secret / service_role |

## 5. How the app will take payment (app, Phase 8)

1. Signed-in user taps an unlock. The server looks up the price in `src/lib/pricing.ts` (never
   trusts a price from the browser) and creates a Razorpay **Order**, saving a `purchases` row
   with status `created`.
2. Razorpay Checkout opens (UPI, cards, net banking, wallets).
3. On success the browser sends the payment signature to the server, which **verifies the
   HMAC signature** and shows "unlocking…".
4. Razorpay's **webhook** (`order.paid` / `payment.captured`), verified with
   `RAZORPAY_WEBHOOK_SECRET`, marks the purchase `paid` using the service role. This is the
   only thing that grants access, so closing the tab mid-payment still unlocks.
5. Webhooks are idempotent: repeated deliveries of the same payment change nothing.
6. `refund.processed` marks the purchase `refunded` and removes the unlock.

## 6. Test payments (you)

In test mode, use Razorpay's test UPI ID / test cards from their docs. Check:

- [ ] Each one-time product unlocks the right thing on the right quiz only.
- [ ] Closing the tab right after paying still unlocks (webhook path).
- [ ] A failed payment unlocks nothing and shows a clear message.
- [ ] Pro monthly and yearly activate, renew (Razorpay can simulate) and cancel correctly.
- [ ] A refund from the dashboard removes the unlock.

## 7. Go live (you)

1. Razorpay must approve the website and complete KYC (dashboard shows "Activated").
2. Switch to **Live Mode**, generate **live** API keys, recreate the webhook and the two Pro
   plans in live mode (test and live are separate).
3. In Vercel, replace the Razorpay values **for Production only** with live ones; keep test
   values on Preview so pull-request previews never charge real money.
4. Redeploy production. Make one real ₹10 purchase, then refund it from the dashboard.

## 8. After launch

- Settlements arrive in your bank on Razorpay's schedule (shown under Settlements).
- Respond to refund emails within the times promised on `/refunds`.
- Disputes/chargebacks appear in the dashboard; respond with the purchase record from the
  `purchases` table.
- Keep payment records as long as tax law requires (privacy policy says ~8 years).
