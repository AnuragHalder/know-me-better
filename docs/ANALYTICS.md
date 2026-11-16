# Usage tracking

Two sources, both free, neither uses cookies or tracks individuals.

## 1. Page visits: Vercel Web Analytics

Vercel → know-me-better → **Analytics** → **Enable** (Web Analytics). The app already loads the
script on Vercel deployments (`src/app/layout.tsx`). You get visitors, page views, top pages,
referrers (WhatsApp, Instagram…), countries and devices. Data starts from the moment it's enabled.

## 2. What people do: the usage page, `/admin`

Counts straight from the database:

- people (accounts and guest players), this week and all time
- **most played**: quiz plays, story walks, Fake It / Same Brain / Killer games, with average players
- **is sharing working**: share-to-play rate, plays per quiz, finish rate
- the last 14 days, day by day
- payments: paid, revenue, failed, left checkout (test payments included while test keys are in use)

Only people listed in `public.app_admins` can open it; everyone else gets a 404. Add yourself once
in **Supabase → SQL Editor** (use the email you sign in with):

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'YOUR-EMAIL@example.com';
```

Then sign in and open `https://whoknowsmebetter.in/admin`.
