# InfusioTech Restaurant Ordering SaaS

Multi-tenant restaurant ordering platform: QR-based customer web ordering, a
single role-aware Flutter app for owners/staff, and a Supabase (Postgres +
Auth + RLS + Realtime) backend. Source documents are in `/docs`. See
**[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full go-live checklist.

## Structure

```
apps/
  web/            Next.js — customer-only: QR scan -> menu -> cart -> checkout -> tracking.
                  No login. Also hosts the shared backend API (/api/v1/*) used by both web and mobile.
  mobile/         Flutter — owner/manager/waiter/cashier/kitchen. Onboarding, staff,
                  menu, tables/QR, live orders. This is where all restaurant-side UI lives.
supabase/
  migrations/     Versioned schema, RLS policies, and the RPC functions that
                  enforce everything RLS can't (order state machine, token
                  generation, onboarding).
  seed.sql        Permission keys, system roles, default plans.
docs/             Source documents (PRD, TDD, DB schema, API, RBAC, etc.)
```

## Status: functional MVP, not yet deployed

Everything below works end-to-end locally once you provide your own
Supabase/Razorpay/SMS credentials (see DEPLOYMENT.md) — it hasn't been
deployed because that needs accounts only you can create.

- ✅ Multi-tenant schema + RLS, deny-by-default, with the real
  authorization boundary in Postgres (not just hidden UI).
- ✅ Owner onboarding, staff invite/accept, role-based permissions —
  mobile app.
- ✅ Menu + table/QR management — mobile app.
- ✅ Live order queue with a validated accept/prepare/ready/served state
  machine — mobile app.
- ✅ Customer menu browsing, cart, checkout (cash or Razorpay), order
  tracking — web app.
- ✅ Razorpay order creation + signature-verified webhook.
- ⬜ Analytics, CRM, Super Admin — not started (Phase 5 in the roadmap).
- ⬜ Image uploads, fine-grained price/availability permission split —
  noted as open items in DEPLOYMENT.md.

## Key decisions locked in (see `/docs` for full rationale)

- Staff login: phone + OTP.
- One active tenant membership per user (no multi-tenant staff in MVP).
- Payment gateway: Razorpay.
- No multi-branch support in MVP (`branch_id` deferred, not in schema yet).
