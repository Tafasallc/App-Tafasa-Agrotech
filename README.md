# Tafasa Agrotech — Farmer/Buyer App (connected to Supabase)

This reads and writes real data from the same Supabase backend as the
admin dashboard. Set up the backend first (see the `tafasa-backend`
project's README and `supabase/schema.sql`).

## 1. Configure environment
```
cp .env.example .env.local
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your
Supabase project (Project Settings -> API). Use the same values as the
admin dashboard — they're the same backend.

## 2. Install & run locally
```
npm install
npm run dev
```
Open http://localhost:5173.

## What's connected
- **Prices tab**: reads live `price_aggregates` — anything an admin edits
  in the dashboard shows up here on next load.
- **Marketplace tab**: reads live `listings` (active only).
- **Sell tab**: posting a listing writes a real row into `listings`,
  which then appears in the Marketplace tab and in the admin dashboard.

## What's still mock / not yet wired up
- **Offers / deal negotiation**: the "Send offer" button on a listing is
  still local-only (no `offers` table wired up yet — that's a good next
  addition to the schema and this screen).
- **Masked contact / proxy calling**: still a UI mockup — the real voice
  bridging logic (from the earlier design) isn't implemented here since
  it depends on Africa's Talking Voice API, which needs a small backend
  function, not just direct database access.
- **Deals tab**: still fully mock data.

## Phone OTP (now real)
Registration sends and verifies a real SMS code via Supabase Phone Auth.
Before this works you must:
1. Enable Phone Auth + connect Twilio in your Supabase project (see the
   backend README, step 5).
2. Run `supabase/migrations/002_profiles.sql` in the SQL Editor — this
   creates the `profiles` table that stores each phone-verified account,
   linked to the admin verification queue.

Once set up: a new user registers → gets a real SMS code → verifying it
creates a Supabase Auth account + a `profiles` row + a queue entry the
admin dashboard can approve. Returning users who still have a valid
session skip straight past registration on next visit.


## Deploying
Same pattern as the admin dashboard — Vercel or Netlify (configs already
included). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as
environment variables in your hosting dashboard.

Deploy this as a **separate project/URL** from the admin dashboard — e.g.
`app.tafasaagrotech.com` for this, `admin.tafasaagrotech.com` for the
dashboard — even though they share the same Supabase backend.
