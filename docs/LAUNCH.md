# Launch checklist

Moving Who Knows Me Better to **whoknowsmebetter.in** and making it ready for real users.
Do the sections in order. Payments have their own guide: `docs/RAZORPAY.md`.

## 1. Domain → Vercel (GoDaddy + Vercel)

GoDaddy account: customer number 726015466.

1. GoDaddy → whoknowsmebetter.in → **DNS → Nameservers**: set to **GoDaddy default**. (If the
   page errors right after purchase, wait a few hours or ask GoDaddy chat to do it.)
2. Vercel → project → **Settings → Domains** → add `whoknowsmebetter.in`, and
   `www.whoknowsmebetter.in` redirecting to it.
3. GoDaddy → **DNS → DNS Records**:
   - Edit the **A** record for `@` → the IP Vercel shows.
   - Edit the **CNAME** for `www` → the value Vercel shows.
   - Don't touch MX / TXT records (Professional Email needs them).
   - **Forwarding** must be off.
4. Wait until Vercel shows **Valid Configuration** for both, then open
   https://whoknowsmebetter.in.

## 2. Vercel environment variables

Vercel → **Settings → Environment Variables**. "Prod" = Production, "Prev" = Preview.

| Name                            | Where                      | Value / notes                                          |
| ------------------------------- | -------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Prod + Prev                | already set                                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod + Prev                | already set                                            |
| `NEXT_PUBLIC_SITE_URL`          | Prod                       | `https://whoknowsmebetter.in`                          |
| `CANONICAL_HOST`                | Prod                       | `whoknowsmebetter.in`. Add **only after** step 1 works |
| `OPENAI_API_KEY`                | Prod + Prev                | for AI questions (Phase 5b)                            |
| Razorpay values                 | see `docs/RAZORPAY.md` § 4 |

After changing variables: **Deployments → latest production → Redeploy**.

`CANONICAL_HOST` makes the old `know-me-better-sage.vercel.app` and `www.` addresses redirect
to the main domain, keeping the path, so old shared quiz links keep working. Previews are never
redirected.

## 3. Supabase sign-in settings

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://whoknowsmebetter.in`
- **Redirect URLs** (keep the others):
  - `https://whoknowsmebetter.in/**`
  - `https://*-anurageconomics-4821.vercel.app/**` (pull-request previews)
  - `http://localhost:3000/**`

Supabase → **Authentication → Sign In / Providers**: Email on, Google on, **Allow anonymous
sign-ins** on (friends play as guests).

## 4. Google sign-in

Google Cloud console → **Google Auth Platform**:

- **Branding:** app name **Who Knows Me Better**; support email; home page
  `https://whoknowsmebetter.in`; privacy policy `https://whoknowsmebetter.in/privacy`; terms
  `https://whoknowsmebetter.in/terms`; authorised domain `whoknowsmebetter.in`.
- **Audience:** if the app is in **Testing**, only listed test users can sign in. Click
  **Publish app** to make it available to everyone. Basic scopes (email, profile) don't need
  Google's full verification, but Google may review the branding before showing your app name.
- **Clients:** the redirect URI stays the Supabase one
  (`https://<project-id>.supabase.co/auth/v1/callback`).

## 5. Email that reaches people

Without custom SMTP, Supabase only emails your own team, 2 per hour.

1. Brevo (free tier) → add domain `whoknowsmebetter.in`, copy its DNS records into GoDaddy
   (alongside the existing email records), wait for "authenticated".
2. Brevo → **SMTP & API → SMTP** → generate an SMTP key.
3. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   host `smtp-relay.brevo.com`, port `587`, user = Brevo login, password = SMTP key,
   sender `hello@whoknowsmebetter.in`, name `Who Knows Me Better`.
4. **Magic Link** template: subject "Your Who Knows Me Better sign-in code"; body includes the
   link and `{{ .Token }}` (the app accepts either).
5. Supabase → **Rate Limits**: raise email sends per hour to what Brevo allows.

## 6. Before you announce it

- [ ] Every policy page live with no "Draft" notice (`src/lib/business.ts` filled in).
- [ ] Sign in with Google and with email on the real domain, on a phone.
- [ ] Make a quiz, open its link signed out in another browser, play it end to end.
- [ ] Share a link on WhatsApp: the preview shows the name and description.
- [ ] Supabase project is on a plan that won't pause (free projects pause after a week idle).
- [ ] OpenAI spending limit set (OpenAI → Settings → Limits).
- [ ] Razorpay: website approved and test payments pass (`docs/RAZORPAY.md`).
