-- Seed data: permission keys, system role templates + their default grants,
-- and subscription plans. Idempotent — safe to re-run (supabase db reset).

insert into public.permissions (key, description) values
  ('orders.view', 'View orders'),
  ('orders.accept', 'Accept incoming orders'),
  ('orders.reject', 'Reject/cancel orders'),
  ('orders.cancel', 'Cancel orders'),
  ('orders.status.update', 'Update order preparation/ready/served status'),
  ('tables.view', 'View tables'),
  ('tables.manage', 'Create/edit/disable tables and QR/NFC assets'),
  ('payments.view', 'View payment status'),
  ('payments.cash.record', 'Record cash received'),
  ('payments.reconcile', 'Reconcile payments'),
  ('payments.refund', 'Issue refunds'),
  ('menu.view', 'View menu'),
  ('menu.create', 'Create menu items'),
  ('menu.edit', 'Edit menu items'),
  ('menu.price.edit', 'Change item prices'),
  ('menu.availability.edit', 'Toggle item availability'),
  ('customers.view', 'View customer records'),
  ('customers.export', 'Export customer data'),
  ('analytics.basic.view', 'View basic analytics'),
  ('analytics.advanced.view', 'View advanced analytics'),
  ('staff.view', 'View staff list'),
  ('staff.invite', 'Invite new staff'),
  ('staff.manage', 'Edit staff roles/permissions, suspend/revoke access'),
  ('settings.manage', 'Manage restaurant settings'),
  ('subscription.manage', 'Manage subscription/billing'),
  ('ownership.transfer', 'Transfer tenant ownership')
on conflict (key) do nothing;

-- System role templates (tenant_id null).
insert into public.roles (id, tenant_id, name, is_system_role) values
  ('00000000-0000-0000-0000-000000000001', null, 'Owner', true),
  ('00000000-0000-0000-0000-000000000002', null, 'Manager', true),
  ('00000000-0000-0000-0000-000000000003', null, 'Waiter', true),
  ('00000000-0000-0000-0000-000000000004', null, 'Cashier', true),
  ('00000000-0000-0000-0000-000000000005', null, 'Kitchen Staff', true)
on conflict (id) do nothing;

-- Owner: every permission.
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000001', id from public.permissions
on conflict do nothing;

-- Manager: operational + reporting defaults. No staff/settings/subscription
-- by default — owner grants those explicitly via overrides if desired.
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000002', id from public.permissions
where key in (
  'orders.view', 'orders.accept', 'orders.reject', 'orders.cancel', 'orders.status.update',
  'tables.view', 'tables.manage',
  'payments.view',
  'menu.view',
  'customers.view',
  'analytics.basic.view'
)
on conflict do nothing;

-- Waiter: assigned orders/tables and status updates.
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000003', id from public.permissions
where key in ('orders.view', 'orders.status.update', 'tables.view')
on conflict do nothing;

-- Cashier: order/payment visibility plus cash recording (reconcile only if granted).
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000004', id from public.permissions
where key in ('orders.view', 'payments.view', 'payments.cash.record')
on conflict do nothing;

-- Kitchen Staff: kitchen queue and preparation status only.
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000005', id from public.permissions
where key in ('orders.view', 'orders.status.update')
on conflict do nothing;

-- Subscription plans (indicative pricing from the PRD; confirm before launch).
insert into public.plans (key, name, price_minor, currency, entitlements) values
  ('starter', 'Starter', 299900, 'INR',
    '{"mobile_app": false, "tables_crm": false, "analytics": "none"}'::jsonb),
  ('growth', 'Growth', 599900, 'INR',
    '{"mobile_app": true, "tables_crm": true, "analytics": "basic"}'::jsonb),
  ('premium', 'Premium', 999900, 'INR',
    '{"mobile_app": true, "tables_crm": true, "analytics": "advanced", "multi_branch": true}'::jsonb)
on conflict (key) do nothing;
