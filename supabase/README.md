# Supabase backend

The Supabase CLI isn't installed on this machine yet.

## One-time setup

1. Install the CLI: https://supabase.com/docs/guides/cli (`npm install -g supabase` or via Scoop on Windows).
2. From the repo root:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>   # or `supabase init` for local-only dev
   ```
3. Apply the schema:
   ```
   supabase db push          # applies supabase/migrations/* to the linked project
   ```
   or for local dev with Docker:
   ```
   supabase start
   supabase db reset         # applies migrations + supabase/seed.sql
   ```
4. Configure phone/OTP auth: set an SMS provider (Twilio, MSG91, etc.) under
   Authentication → Providers → Phone in the Supabase dashboard, or via
   `supabase secrets set` for local dev. Staff/owner login depends on this.

## Structure

```
migrations/
  0001_extensions.sql
  0002_tenancy_core.sql       tenants, users, roles, permissions, memberships, invitations
  0003_auth_helpers.sql       current_tenant_id(), has_permission(), my_permissions()
  0004_subscriptions.sql      plans, subscriptions
  0005_restaurant_ops.sql     tables, QR/NFC assets, menu, variants, add-ons
  0006_commerce.sql           customers, orders, order_items, payments, refunds, audit_events
  0007_rls_policies.sql       RLS enabled + policies on every tenant table
  0008_create_order_function.sql       create_public_order() — server-trusted order creation
  0009_onboarding_and_invitations.sql  create_tenant_and_owner(), accept_staff_invitation()
  0010_staff_invitation_rpc.sql        create_staff_invitation()
  0011_tables_qr_and_order_transitions.sql
    create_table_with_qr(), reissue_table_qr(), transition_order_status(),
    record_cash_payment(), reconcile_payment()
seed.sql                      permission keys, system role templates, default role grants, plans
config.toml                   local dev config (needs an SMS provider filled in)
functions/                    Edge Functions — none yet; webhook/order logic lives in
                               Postgres RPCs + apps/web/src/app/api/v1 instead
```

### Why so many RPC functions instead of plain table writes?

Anywhere an action needs to (a) generate and hash a secret token, (b)
validate a state transition before writing, or (c) touch more than one
table atomically, it's a `security definer` Postgres function, not a direct
`INSERT`/`UPDATE` through RLS. RLS alone can gate *whether* a write is
allowed, but can't easily express "this specific status transition is
legal from the current status" or "generate this token server-side and
never let the hash be reversible." Every such function is `revoke`d from
`anon`/`public` and `grant`ed only to `authenticated`, and re-checks
`has_permission()` / `current_tenant_id()` itself — it does not rely on the
caller already having passed an RLS check.

## Design notes carried over from the docs

- **Deny by default.** Every tenant table has RLS enabled with explicit
  policies only — no policy means no access, for any role including
  `authenticated`.
- **Public access is read-only storefront data**: active tenant branding,
  active menu, plan pricing. Order/payment/customer creation from the public
  web app always goes through a server route using the service-role client
  (see `apps/web/src/lib/supabase/service.ts`), which does its own
  price/tenant/table-token validation — the client is never trusted for
  totals, per the TDD.
- **One active `tenant_membership` per user** (MVP decision) — enforced by a
  partial unique index, not just application logic.
- **Fine-grained rules RLS can't express cleanly** (which order_status
  transitions are legal, `menu.price.edit` vs `menu.edit` at the field
  level) are enforced in the server API layer on top of the coarser RLS
  gate, not instead of it.
