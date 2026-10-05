-- Row Level Security. Deny-by-default: RLS enabled on every tenant-owned table,
-- with explicit policies only. No policy = no access, by any role.
--
-- Permission keys referenced here come from 04_RBAC_Permissions_Matrix.
-- RLS gates "does this membership have the relevant permission at all" —
-- fine-grained transition/field rules (e.g. which order_status transitions
-- are legal) are enforced in the server API layer, not here.
--
-- Public (anon) access is limited to read-only storefront data: active tenant
-- branding, active menu, and plan pricing. Order/payment/customer writes from
-- the public web app always go through a server route using the service-role
-- client, which performs its own price/tenant/table-token validation.

alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.qr_assets enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.item_variant_groups enable row level security;
alter table public.item_variants enable row level security;
alter table public.item_addon_groups enable row level security;
alter table public.item_addons enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.audit_events enable row level security;

-- ── tenants ─────────────────────────────────────────────────────────────
-- Public read is intentionally broad (name/slug/branding power the public
-- menu page); tighten to a view exposing only public-safe columns before
-- production if contact_email/contact_phone should not be world-readable.
create policy tenants_public_read on public.tenants
  for select to anon, authenticated
  using (status = 'active');

create policy tenants_member_update on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id() and public.has_permission('settings.manage'));

-- ── users ───────────────────────────────────────────────────────────────
create policy users_self_read on public.users
  for select to authenticated
  using (id = auth.uid());

create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid());

-- ── roles / permissions / role_permissions (reference data) ───────────────
create policy roles_read on public.roles
  for select to authenticated
  using (tenant_id is null or tenant_id = public.current_tenant_id());

create policy permissions_read on public.permissions
  for select to anon, authenticated
  using (true);

create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (
    role_id in (
      select id from public.roles
      where tenant_id is null or tenant_id = public.current_tenant_id()
    )
  );

-- ── tenant_memberships ──────────────────────────────────────────────────
create policy memberships_self_or_staff_read on public.tenant_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.has_permission('staff.view'))
  );

create policy memberships_manage_update on public.tenant_memberships
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('staff.manage'));

-- Note: membership creation happens via the staff-invitation-accept server
-- route (service role) and tenant-creation flow, not direct client inserts.

-- ── user_permission_overrides ───────────────────────────────────────────
create policy overrides_read on public.user_permission_overrides
  for select to authenticated
  using (
    membership_id in (
      select id from public.tenant_memberships where tenant_id = public.current_tenant_id()
    )
    and public.has_permission('staff.view')
  );

create policy overrides_write on public.user_permission_overrides
  for all to authenticated
  using (
    membership_id in (
      select id from public.tenant_memberships where tenant_id = public.current_tenant_id()
    )
    and public.has_permission('staff.manage')
  )
  with check (
    membership_id in (
      select id from public.tenant_memberships where tenant_id = public.current_tenant_id()
    )
    and public.has_permission('staff.manage')
  );

-- ── staff_invitations ───────────────────────────────────────────────────
create policy invitations_read on public.staff_invitations
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('staff.view'));

create policy invitations_insert on public.staff_invitations
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('staff.invite'));

create policy invitations_update on public.staff_invitations
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('staff.manage'));

-- ── plans / subscriptions ───────────────────────────────────────────────
create policy plans_public_read on public.plans
  for select to anon, authenticated
  using (is_active = true);

create policy subscriptions_read on public.subscriptions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- ── restaurant_tables / qr_assets ───────────────────────────────────────
create policy tables_read on public.restaurant_tables
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('tables.view'));

create policy tables_write on public.restaurant_tables
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('tables.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('tables.manage'));

create policy qr_assets_read on public.qr_assets
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('tables.view'));

create policy qr_assets_write on public.qr_assets
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('tables.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('tables.manage'));

-- QR token resolution (anon scanning a code) is done server-side via the
-- service-role client, never by querying qr_assets directly from the browser —
-- this keeps tokens from being enumerable through RLS-filtered reads.

-- ── menu: categories / items / variants / add-ons ──────────────────────
create policy menu_categories_public_read on public.menu_categories
  for select to anon, authenticated
  using (is_active = true);

create policy menu_categories_staff_read on public.menu_categories
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.view'));

-- Split by operation: a single "for all" policy can't require menu.create
-- on insert but only menu.edit on update — with_check applies to both, so
-- requiring menu.create there would block an edit-only Manager from ever
-- updating a row.
create policy menu_categories_insert on public.menu_categories
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.create'));

create policy menu_categories_update on public.menu_categories
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy menu_categories_delete on public.menu_categories
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy menu_items_public_read on public.menu_items
  for select to anon, authenticated
  using (is_available = true);

create policy menu_items_staff_read on public.menu_items
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.view'));

create policy menu_items_insert on public.menu_items
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.create'));

create policy menu_items_update on public.menu_items
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy menu_items_delete on public.menu_items
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy variant_groups_public_read on public.item_variant_groups
  for select to anon, authenticated using (true);

create policy variant_groups_write on public.item_variant_groups
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy variants_public_read on public.item_variants
  for select to anon, authenticated using (is_available = true);

create policy variants_write on public.item_variants
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy addon_groups_public_read on public.item_addon_groups
  for select to anon, authenticated using (true);

create policy addon_groups_write on public.item_addon_groups
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy addons_public_read on public.item_addons
  for select to anon, authenticated using (is_available = true);

create policy addons_write on public.item_addons
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

-- menu.price.edit / menu.availability.edit are enforced in the API layer
-- (field-level restrictions are impractical to express cleanly in RLS).

-- ── customers ───────────────────────────────────────────────────────────
create policy customers_read on public.customers
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('customers.view'));

-- Customer records are created by the public order-creation server route
-- (service role) and not writable directly by staff clients in MVP.

-- ── orders / order_items ───────────────────────────────────────────────
create policy orders_read on public.orders
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('orders.view'));

-- No direct UPDATE policy on orders: status changes go exclusively through
-- transition_order_status() (supabase/migrations/0011), which validates the
-- state machine and requires the specific permission for that transition —
-- a blanket "has some order permission" UPDATE policy would let a Waiter
-- with only orders.status.update directly set order_status to anything,
-- or edit totals/order_number, bypassing the state machine entirely.

-- Order creation is always server-side (service role) — the server
-- recalculates prices/taxes/totals and never trusts client-supplied values.

create policy order_items_read on public.order_items
  for select to authenticated
  using (
    order_id in (
      select id from public.orders where tenant_id = public.current_tenant_id()
    )
    and public.has_permission('orders.view')
  );

-- ── payments / refunds ─────────────────────────────────────────────────
create policy payments_read on public.payments
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('payments.view'));

-- No direct UPDATE policy: a blanket "has cash.record or reconcile" policy
-- would let a Cashier edit amount_minor/provider_reference on any payment,
-- not just flip status. Cash recording and reconciliation go through
-- dedicated RPCs instead (supabase/migrations/0011) that touch only the
-- fields each action is meant to change.

-- Payment creation/webhook verification is server-side only (service role).

create policy refunds_read on public.refunds
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('payments.refund'));

create policy refunds_insert on public.refunds
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('payments.refund'));

-- ── audit_events ────────────────────────────────────────────────────────
-- Stand-in gate: audit visibility requires settings.manage until a dedicated
-- audit.view permission key is added. Writes are service-role only.
create policy audit_events_read on public.audit_events
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
