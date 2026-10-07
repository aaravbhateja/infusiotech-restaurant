# Deployment guide

Everything in this repo is written and builds cleanly, but going live needs
accounts and secrets only you can provide: a Supabase project, a Vercel
project, a Razorpay account, a Resend account for email/OTP, and (for the
mobile app) the Flutter SDK plus Play Console / App Store Connect accounts.
This doc is the exact sequence.

## 1. Supabase project (backend)

1. Create a project at https://supabase.com (pick a region close to your
   users — e.g. Mumbai/Singapore for India).
2. Install the CLI: `npm install -g supabase`.
3. From the repo root: `supabase login`, then `supabase link --project-ref <your-project-ref>`.
4. Apply the schema: `supabase db push` (runs every file in
   `supabase/migrations/` in order).
5. Seed reference data: open the SQL editor in the Supabase dashboard and
   run `supabase/seed.sql` once (permission keys, system roles, plans —
   idempotent, safe to re-run).
6. **Enable email/OTP auth via Resend** (login is a one-time code emailed
   to the user — no telecom DLT registration needed, unlike SMS):
   1. Sign up at https://resend.com (free: 3,000 emails/month, 100/day).
   2. Buy a domain if you don't have one (any registrar — Namecheap,
      Cloudflare, GoDaddy; ~$10/year, no business registration required,
      just ownership). In Resend: Domains → Add Domain, then add the SPF
      and DKIM DNS records it gives you at your registrar. Resend won't
      deliver to real recipients until this domain is verified.
   3. API Keys → create a key (starts with `re_`) — this doubles as your
      SMTP password.
   4. Authentication → Providers → Email: turn email auth **on**.
   5. Authentication → SMTP Settings (or `supabase/config.toml`
      `[auth.email.smtp]` for local dev): host `smtp.resend.com`, port
      `465`, user `resend`, password your Resend API key, sender address
      any `@yourdomain.com` address on the domain you just verified.
   6. Set the secret (from the repo root): `supabase secrets set RESEND_API_KEY=re_xxxxx`.
   7. Send yourself a test code from the mobile app's or web app's login
      screen to confirm delivery before inviting real staff.
7. Copy from Settings → API: Project URL, `anon` public key, and
   `service_role` secret key. You'll need all three below.

## 2. Razorpay (payments)

1. Create an account at https://razorpay.com, complete KYC for live mode
   (test mode works immediately for development).
2. Settings → API Keys → generate a Key ID + Key Secret.
3. Settings → Webhooks → add webhook URL
   `https://<your-web-domain>/api/v1/webhooks/razorpay`, subscribe to
   `payment.captured` and `payment.failed`, and copy the webhook secret.

## 3. The app is one Expo/React Native codebase (`apps/blinkrest`)

There is no separate Next.js web app or Flutter mobile app — `apps/blinkrest`
is a single Expo Router project that builds for iOS, Android, **and web**
from the same source. The web build is what table QR codes point guests to
(`src/app/order/[token].tsx`); every other screen is the staff-facing app.

### Web (customer QR ordering) — deployed on Vercel

Already live at **https://blinkrest.com** (also reachable at
`https://www.blinkrest.com` and the original `https://blinkrest.vercel.app`),
deployed from
`apps/blinkrest` with:
```
buildCommand: npx expo export -p web
outputDirectory: dist
```
(see `apps/blinkrest/vercel.json` — it also rewrites `/order/:token`,
`/menu/:id`, `/table/:id`, etc. to their statically-exported `[param].html`
file, since Expo's static web export doesn't pre-render unknown dynamic
params). Production env vars are set directly on the Vercel project
(`vercel env ls` from `apps/blinkrest`), not read from `.env`:
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_ORDER_BASE_URL=https://blinkrest.com   # must match wherever this is deployed
```
To redeploy after changes: `cd apps/blinkrest && vercel deploy --prod`.

The marketing landing page at `https://blinkrest.com/` is plain HTML in
`apps/blinkrest/landing/`. The Vercel build command runs
`node scripts/add-landing.js` after `expo export`, which copies it over
`dist/index.html` (fonts and images go to `dist/landing/`). To add the real
Google Play and App Store links, fill in the `STORE` object near the bottom
of `landing/index.html`.

The domain `blinkrest.com` is registered at Spaceship and uses Spaceship's
nameservers (its Google Workspace mail records live there, so don't switch
to Vercel's nameservers). It is attached to the Vercel project, with these
records in Spaceship → Advanced DNS:
```
A      @     76.76.21.21
CNAME  www   cname.vercel-dns.com
```
To use a different domain, add it to the Vercel project (`vercel domains add
<domain> blinkrest`), set those records at its DNS provider, then update
`EXPO_PUBLIC_ORDER_BASE_URL` to match and redeploy — new table QR codes (and
any reissued ones) will use the new base URL. QR codes printed earlier with
the `blinkrest.vercel.app` address keep working.

Razorpay is not wired into checkout yet — online payment is still a design
placeholder in the customer flow; today's only working payment path is
"pay at counter" (cash, recorded by staff via the app).

### Native (owner/manager/waiter/cashier/kitchen)

Built and run with EAS from `apps/blinkrest`:
```
cd apps/blinkrest
npx eas-cli build --profile development --platform android   # or ios
```
See `apps/blinkrest/README.md`/`eas.json` (once configured) for build
profiles. No `--dart-define`s or separate native project setup — Expo
handles the native projects via Continuous Native Generation.

## 4. First-run walkthrough (prove it end-to-end)

1. Open the app (native or `npx expo start --web` locally), sign in with an
   email address (OTP arrives via Resend), create a new restaurant — you're
   now the Owner.
2. **Menu** → add a category → add an item with a price.
3. **Tables** → add a table → a QR code appears immediately (this is the
   only time it's shown — tap **New QR** on the table later to reissue if
   you lose the printed copy, which retires the old one).
4. Scan that QR with any phone, or open the printed URL directly (it's
   `https://blinkrest.com/order/<token>` in production) — the menu
   you just built should load.
5. Add an item, place the order (pay at counter).
6. Back in the app → **Orders** — the order appears in real time; tap it to
   Accept → Start preparing → Mark ready → Mark served.
7. **Staff** → invite a teammate by phone number → share the invite code
   shown → they sign in on the app and enter it under "I have a staff
   invite code."

## What's still open before a real commercial launch

These are flagged throughout the code/docs and intentionally deferred,
matching the PRD's own "decisions before build" list:

- **Tax calculation** is a stub (`tax_minor = 0` always) — real tax/invoice
  rules need confirming first (PRD §20).
- **`menu.price.edit` / `menu.availability.edit`** are separate permission
  keys in the RBAC matrix but not yet enforced at that granularity — RLS
  currently gates menu writes on `menu.edit` as a whole (see the comment in
  `supabase/migrations/0007_rls_policies.sql`).
- **Webhook replay protection** is "naturally idempotent" (re-applying the
  same status is harmless) rather than a dedicated processed-event-id
  table — fine for MVP, worth hardening before high volume.
- **No analytics, CRM export, or Super Admin surface yet** — Phase 5 in the
  roadmap.
- **Image uploads for menu items** aren't wired (Supabase Storage bucket +
  upload UI) — `image_path` exists in the schema but nothing writes to it.
- **Rate limiting** on public endpoints (order creation, table-session
  lookup) isn't implemented — add at the edge (Vercel/Cloudflare) before
  launch, per the API doc's security contract.
