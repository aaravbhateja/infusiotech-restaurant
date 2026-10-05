# BlinkRest

**Your restaurant, one blink away.** BlinkRest is a restaurant management and QR ordering platform built by [InfusioTech](https://www.infusiotech.com).

Guests scan a QR code on their table, browse the menu, order and pay from their phone, without installing anything. Restaurant staff run everything from one mobile app: live orders, menu, tables, payments, staff and analytics. Each person sees only what their role allows.

- **Live web app (guest ordering):** https://blinkrest.vercel.app
- **Staff app:** iOS and Android, built from the same codebase

---

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Architecture](#architecture)
- [Roles and permissions](#roles-and-permissions)
- [Online payments, KYC and the 97/3 split](#online-payments-kyc-and-the-973-split)
- [Getting started (local development)](#getting-started-local-development)
- [Backend setup (Supabase)](#backend-setup-supabase)
- [Deployment](#deployment)
- [Environment variables and secrets](#environment-variables-and-secrets)
- [Development workflow](#development-workflow)
- [Known gaps](#known-gaps)
- [Documentation](#documentation)

---

## How it works

```
 Guest's phone (browser)                     Staff phones (BlinkRest app)
 ───────────────────────                     ────────────────────────────
 1. Scans table QR code                      Owner / Manager / Waiter /
 2. Browses menu, adds to cart               Cashier / Kitchen staff
 3. Pays online or "call waiter for bill"
 4. Tracks order status live          ◄────► 5. Order appears in real time
                                             6. Accept → Preparing → Ready → Served
                    │                                  │
                    └──────────► Supabase ◄────────────┘
                     Postgres + Auth + Realtime + Edge Functions
                                   │
                                Razorpay
              (checkout + Route split: 97% restaurant / 3% platform)
```

1. **Owner signs up** in the app, creates the restaurant and becomes its Owner.
2. **Builds the menu** (categories, items, prices, photos) and **adds tables**. Each table gets a unique QR code.
3. **Guests scan the QR**, which opens `https://blinkrest.vercel.app/order/<token>` in their browser. No app or login needed.
4. **Orders show up live** for staff, who move them through the kitchen workflow while the guest's tracking screen updates.
5. **Payment** happens either online (Razorpay, once the restaurant has passed KYC) or at the table (cash/UPI recorded by staff).

---

## Features

### Guest ordering (web, no login)
- QR-based menu with categories, search, veg filter, photos and the restaurant's own brand colour
- Cart, special instructions, promo/offer codes, live bill breakdown with GST
- **Pay online** (UPI, cards, netbanking, wallets via Razorpay), shown only when the restaurant is cleared for online payments
- **Call waiter for bill**: pay at the table instead
- Live order tracking, a "call waiter" button and post-meal reviews

### Restaurant staff app (iOS / Android)
- **Role-specific home screens** for Owner, Manager, Waiter, Kitchen and Cashier
- **Live orders** with a validated state machine (new → accepted → preparing → ready → served) and kitchen stations
- **Menu management:** categories, items, prices, availability, photos, kitchen station per item
- **Tables and QR codes:** add tables, download/print/rotate QR codes, floor status, transfer orders between tables
- **Payments:** ledger with UPI/card/cash breakdown, cash recording, reconciliation, refunds
- **Online payments & KYC:** submit PAN, Aadhar and bank details to enable online payments (see [below](#online-payments-kyc-and-the-973-split))
- **Staff:** invite by code, role templates, per-person permission overrides, shifts
- **Offers** (percent, flat, free item; scoped by category or item, with usage limits), **customers/CRM**, **reviews**, **analytics**
- **Settings:** profile, logo/cover photo, business hours, GST, menu colours, order settings, security
- **Multi-restaurant:** one person can belong to several restaurants and switch between them
- Push notifications, offline banner, receipt printing/sharing
- Animated branded splash screen

### Platform admin console (`/admin`)
- For InfusioTech staff only (super admins): tenant search, platform stats, suspend/reactivate restaurants
- Support ticket queue with replies
- **KYC review queue:** a fallback for online-payment onboarding that didn't complete automatically
- Every admin action is reason-coded and written to an audit log

---

## Tech stack

| Layer | Technology |
|---|---|
| App (iOS, Android **and** web) | [Expo](https://expo.dev) SDK 57, React Native 0.86, React 19, TypeScript |
| Navigation | [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routes in `src/app/`) |
| Animation | React Native Reanimated 4 |
| Backend | [Supabase](https://supabase.com): Postgres, Auth, Row Level Security, Realtime, Storage |
| Server logic | Postgres functions (RPCs) + Supabase Edge Functions (Deno) |
| Payments | [Razorpay](https://razorpay.com) Checkout + Route (split settlements) |
| Auth | Email one-time code (OTP) or email + password; email delivery via Resend SMTP |
| Push notifications | Expo push service, triggered from Postgres via `pg_net` |
| Web hosting | [Vercel](https://vercel.com) (static Expo web export) |
| Native builds | EAS Build |

There is **one codebase** (`apps/blinkrest`) for everything: the guest web ordering page and the staff app on iOS and Android.

---

## Repository structure

```
.
├── apps/
│   └── blinkrest/              The Expo app (iOS, Android, web)
│       ├── src/
│       │   ├── app/            Screens. Every file is a route (Expo Router)
│       │   │   ├── order/[token].tsx      Guest QR ordering page (public)
│       │   │   ├── r/[slug]/[table].tsx   Friendly-URL alias for the same page
│       │   │   ├── (staff)/               Everything staff see after login
│       │   │   ├── admin/                 Platform admin console
│       │   │   └── login, otp, onboarding, welcome, …
│       │   ├── components/     Shared UI (PublicOrderScreen, BrandSplash, Logo, …)
│       │   ├── hooks/          useAuth (session + membership + permissions), …
│       │   ├── lib/            supabase client, razorpay checkout, helpers
│       │   └── theme/          Design tokens (colours, fonts, radii)
│       ├── assets/             Icons, splash image, fonts
│       ├── app.json            Expo config (name, icons, splash, plugins)
│       └── vercel.json         Web build + URL rewrites for Vercel
├── supabase/
│   ├── migrations/             Numbered SQL migrations: schema, RLS, RPCs (0001 → 0050)
│   ├── functions/              Edge Functions (Deno)
│   │   ├── _shared/            CORS + Razorpay helpers
│   │   ├── resolve-table/      QR token → restaurant + table
│   │   ├── quote-order/        Live bill pricing
│   │   ├── create-razorpay-order/  Opens a Razorpay order with the Route split
│   │   ├── create-order/       Verifies payment signature, creates the order
│   │   ├── call-waiter/        Guest "call waiter" button
│   │   ├── send-push/          Relays notifications to Expo push
│   │   ├── submit-tenant-kyc/  Saves KYC + creates Razorpay Linked Account
│   │   └── razorpay-webhook/   Razorpay account status → enables online payments
│   ├── seed.sql                Permission keys, system roles, subscription plans
│   └── config.toml             Local Supabase config
├── docs/                       PRD, technical design, DB schema, API, RBAC,
│                               QA plan, roadmap, pricing, onboarding, legal, SLA
├── DEPLOYMENT.md               Go-live checklist
└── README.md                   This file
```

---

## Architecture

### Security lives in the database
The real authorization boundary is **Postgres**, not the app. Hiding a button is never the only protection:

- Every table has **Row Level Security** that is deny-by-default and scoped to the user's current restaurant (`current_tenant_id()`).
- Sensitive writes go through **`SECURITY DEFINER` RPC functions** that check `has_permission('<key>')` before doing anything, and write to `audit_events`.
- The app's `RequireAccess` wrapper hides screens a role can't use, but the database enforces the same rule regardless.

### Guests never touch the database directly
Guests aren't logged in, so the public ordering flow goes through **Edge Functions** that use the service-role key:

1. `resolve-table` turns the QR token (hashed with SHA-256, never stored in plain text) into a restaurant and table.
2. `quote-order` prices the cart on the server. Prices are never trusted from the browser.
3. `create-razorpay-order` opens a payment for the server-calculated amount.
4. `create-order` **verifies Razorpay's HMAC signature** before marking anything paid, then calls `create_public_order()`, which is locked to the service role.

### Realtime
Staff screens subscribe to Postgres changes, so new orders, status changes and payments appear instantly. Guests poll a narrow `get_order_tracking()` function, because anonymous users can't read the `orders` table.

### Multi-tenancy
One Supabase project hosts every restaurant (a "tenant"). A user can belong to several restaurants through `tenant_memberships` and picks the active one (`users.active_tenant_id`).

---

## Roles and permissions

Five built-in role templates, each with sensible defaults. Owners can customise roles or grant and deny individual permissions per person.

| Role | Lands on | Default access |
|---|---|---|
| **Owner** | Owner home | Everything, including staff, settings, subscription, KYC/payouts, ownership transfer |
| **Manager** | Manager home | Orders, tables, menu view, customers, basic analytics, menu branding |
| **Waiter** | Waiter home | Their orders and tables, status updates |
| **Cashier** | Cashier home | Orders, payments, recording cash |
| **Kitchen Staff** | Kitchen home | Kitchen queue, preparation status |

Some permissions can only ever belong to the Owner: `staff.manage`, `settings.manage`, `subscription.manage`, `ownership.transfer` and `payments.kyc.manage`. The full matrix is in `docs/04_RBAC_Permissions_Matrix.pdf`, and the permission keys are in `supabase/seed.sql`.

---

## Online payments, KYC and the 97/3 split

Online payment is **off by default for every restaurant**. It turns on only after KYC is verified.

### The flow
1. **The restaurant submits KYC** in *Settings → Online payments & KYC*: business type, legal name, PAN, Aadhar, bank account and IFSC (plus business PAN and GSTIN for partnerships, LLPs and private limited companies).
2. The `submit-tenant-kyc` edge function saves it and **automatically creates a Razorpay Route Linked Account** (account, stakeholder, route product with settlement bank details).
3. **Razorpay reviews it.** This can take minutes or days, and the decision is Razorpay's.
4. Razorpay calls `razorpay-webhook` with the result. On `account.activated`, the restaurant's `pay_online_enabled` flips on automatically, with no manual step.
5. Guests now see **"Pay online now"** at checkout.

If automation fails (for example, missing contact details) or Razorpay asks for clarification, the submission shows up in the admin **KYC review queue** (`/admin/kyc`) for a human to handle.

### The money
Each online payment is opened with a Razorpay Route transfer:

| | Share | Example on a ₹1,000 order |
|---|---|---|
| Restaurant's bank account | **97%** | ₹970 |
| Platform (InfusioTech) | **3%** | ₹30 |
| Razorpay fee (~2% + GST ≈ 2.36%) | taken from the platform's 3% | −₹23.60 |
| **Platform net margin** | **≈ 0.64%** | **≈ ₹6.40** |

The restaurant always receives its full 97%: Razorpay's fee comes out of the platform's share. The split is calculated on the server from the final priced total and stored on each payment (`platform_fee_minor`, `restaurant_payout_minor`, `razorpay_transfer_id`).

### Enforced in three places
- The guest page hides "Pay online" unless the restaurant is cleared.
- `create-razorpay-order` refuses to open a payment unless KYC is verified and a linked account exists.
- `create_public_order()` rejects an online payment for a restaurant that isn't enabled, even if someone bypasses the first two.

### Privacy
The full **Aadhar number is never stored**: only the last 4 digits (for display) and a SHA-256 hash, as the Aadhaar Act requires. Restaurants only ever see masked bank details.

> **Before this works for real:** Razorpay Route must be enabled on the InfusioTech Razorpay account, and the webhook must be registered. See [Deployment](#deployment).

---

## Getting started (local development)

### Prerequisites
- **Node.js** 20+ and npm
- The **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)), or an iOS simulator / Android emulator
- A **Supabase project** (see [Backend setup](#backend-setup-supabase))

### Run the app

```bash
git clone https://github.com/aaravbhateja/infusiotech-restaurant.git
cd infusiotech-restaurant/apps/blinkrest
npm install
```

Create `apps/blinkrest/.env` (already ignored by git):

```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-public-key>
# Optional. Base URL printed into table QR codes:
EXPO_PUBLIC_ORDER_BASE_URL=https://blinkrest.vercel.app
```

Find both Supabase values in the Supabase dashboard under *Project Settings → API*.

Start the dev server:

```bash
npx expo start
```

- **Phone:** open Expo Go and scan the QR code in the terminal. Your phone and computer must be on the **same Wi-Fi**; if they aren't, use `npx expo start --tunnel`.
- **Web:** press `w`, or run `npx expo start --web`.
- **Simulator:** press `i` (iOS) or `a` (Android).

### First run, end to end
1. Sign in with your email (a one-time code is emailed to you) and create a restaurant. You're now its Owner.
2. **Menu:** add a category and an item.
3. **Tables:** add a table and open its QR code.
4. Open the QR link on another device, add an item and place an order ("call waiter for bill").
5. Back in the app, go to **Orders**. The order appears instantly. Move it through Accept → Preparing → Ready → Served.

---

## Backend setup (Supabase)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # run from the repo root

supabase db push                                 # applies supabase/migrations in order
```

Then run `supabase/seed.sql` once in the Supabase SQL editor. It sets up permission keys, the 5 role templates and the subscription plans, and it's safe to re-run.

**Email login:** turn on the Email provider under *Authentication → Providers*, and point *Authentication → SMTP Settings* at Resend (`smtp.resend.com`, port `465`, user `resend`, password = your Resend API key, sender on a verified domain). `DEPLOYMENT.md` has step-by-step instructions.

**Edge functions:**

```bash
supabase functions deploy resolve-table
supabase functions deploy quote-order
supabase functions deploy create-razorpay-order
supabase functions deploy create-order
supabase functions deploy call-waiter
supabase functions deploy send-push
supabase functions deploy submit-tenant-kyc
supabase functions deploy razorpay-webhook
```

**Secrets for the edge functions:**

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_... RAZORPAY_KEY_SECRET=...
supabase secrets set RAZORPAY_WEBHOOK_SECRET=...
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to edge functions automatically.)

---

## Deployment

### Web (guest ordering) → Vercel

```bash
cd apps/blinkrest
vercel login
vercel deploy --prod
```

`vercel.json` already sets the build (`npx expo export -p web` → `dist`) and the URL rewrites for dynamic routes such as `/order/:token`. Production environment variables live on the Vercel project (`vercel env ls`), not in `.env`.

> If you add a new screen, also add a rewrite for it in `vercel.json`. Otherwise, opening that URL directly or refreshing the browser on it returns a 404 on the web. `/settings/payments-kyc`, `/settings/branding` and `/admin/kyc` currently need entries.

### Native apps → EAS

```bash
cd apps/blinkrest
npx eas-cli@latest build --profile development --platform android   # or ios
```

`eas.json` hasn't been created yet; running `npx eas-cli@latest build:configure` creates it. Expo generates the native `ios/` and `android/` projects, so never edit them by hand. Configure native behaviour in `app.json` instead.

### Razorpay
1. Get **Route** enabled on the Razorpay account (*Dashboard → Route*, or ask Razorpay support). Razorpay has to approve this.
2. Create API keys (start in **Test Mode**) and set them as Supabase secrets (above).
3. Under *Settings → Webhooks*, add `https://<project-ref>.functions.supabase.co/razorpay-webhook`, subscribe to the `account.*` events and save the signing secret as `RAZORPAY_WEBHOOK_SECRET`.
4. Do one full test-mode KYC submission before going live.

---

## Environment variables and secrets

| Name | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` / Vercel | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` / Vercel | Public anon key (safe in the app; RLS protects data) |
| `EXPO_PUBLIC_ORDER_BASE_URL` | `.env` / Vercel | Base URL printed into table QR codes |
| `RAZORPAY_KEY_ID` | Supabase secrets | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | Supabase secrets | Razorpay API secret (orders, signature checks, Route) |
| `RAZORPAY_WEBHOOK_SECRET` | Supabase secrets | Verifies `razorpay-webhook` requests |
| `RESEND_API_KEY` | Supabase SMTP settings | Sends login codes by email |

Never commit secrets. The service-role key and Razorpay secret must only ever live in Supabase secrets, never in the app.

---

## Development workflow

```bash
cd apps/blinkrest
npx tsc --noEmit      # typecheck
npx expo lint         # lint
```

Run both before pushing.

**Database changes** always go in a **new** numbered migration (`supabase/migrations/0051_….sql`). Never edit a migration that has already been applied, because Supabase won't re-run it. Use `create or replace function` to change a function. If a function's parameters or return columns change, `drop function` the old one first.

**Expo:** use `npx expo install <package>` (not `npm install`) so versions match the SDK. Libraries with custom native code won't work in Expo Go; they need a development build.

**Branches:** feature work goes on a branch and is merged into `master`.

---

## Known gaps

- **Razorpay Route** isn't enabled on the account yet, so online payments and automated KYC can't run live until it is.
- **Item variants and add-ons** (sizes, extras) exist in the database and are priced correctly on the server, but there's no screen to create them yet, and the guest menu doesn't offer them.
- **Rate limiting** on public endpoints (order creation, table lookup) isn't implemented yet; add it at the edge before launch.
- **`menu.price.edit` / `menu.availability.edit`** exist as permission keys but menu writes are still gated on `menu.edit` as a whole.
- **Vercel rewrites** are missing for a few newer screens (see [Deployment](#deployment)).
- **`DEPLOYMENT.md` is partly out of date.** It still says Razorpay checkout, tax, analytics, the admin console and image uploads aren't built (they are), and references an old `/api/v1/webhooks/razorpay` URL. This README is the current source of truth.

---

## Documentation

The `docs/` folder has the full product and engineering documents (PDF and Word):

| # | Document |
|---|---|
| — | Product Requirements Document (PRD) |
| 01 | Technical Design Document |
| 02 | Database Schema |
| 03 | API Documentation |
| 04 | RBAC Permissions Matrix |
| 05 | UI/UX Design Brief |
| 06 | QA Test Plan |
| 07 | Development Roadmap |
| 08 | Deployment & DevOps Guide |
| 09 | Sales Proposal & Pricing |
| 10 | Restaurant Onboarding Guide |
| 11 | Terms, Privacy & Data Processing |
| 12 | Support SOP & SLA |

---

Built by **[InfusioTech](https://www.infusiotech.com)**.
