-- Offers/coupons, reviews, in-app notifications, support tickets, plus a
-- few permission keys the UI needs that 0002/seed.sql didn't anticipate.

insert into public.permissions (key, description) values
  ('orders.create', 'Take orders on behalf of a guest (dine-in/takeaway)'),
  ('orders.discount', 'Apply manual or coupon discounts to an order'),
  ('tables.assign', 'Seat guests and transfer orders between tables'),
  ('offers.manage', 'Create, edit and pause offers/coupons'),
  ('reviews.reply', 'Reply to customer reviews')
on conflict (key) do nothing;

-- Extend role defaults for the new keys (system roles only; owner already
-- has every permission via the "all permissions" grant in seed.sql).
insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000002', id from public.permissions
where key in ('orders.create', 'orders.discount', 'tables.assign', 'offers.manage', 'reviews.reply')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000003', id from public.permissions
where key in ('orders.create', 'tables.assign')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000004', id from public.permissions
where key in ('orders.create', 'orders.discount')
on conflict do nothing;

-- ── offers ──────────────────────────────────────────────────────────────
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('percent', 'flat', 'free_item')),
  value_minor bigint,
  value_percent numeric(5, 2),
  free_menu_item_id uuid references public.menu_items (id),
  max_discount_minor bigint,
  min_order_minor bigint not null default 0,
  auto_apply boolean not null default false,
  scope text not null default 'all' check (scope in ('all', 'category', 'item')),
  category_ids uuid[] not null default '{}',
  item_ids uuid[] not null default '{}',
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit int,
  per_customer_limit int not null default 1,
  is_active boolean not null default true,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index offers_tenant_id_idx on public.offers (tenant_id);

create table public.offer_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid references public.customers (id),
  discount_minor bigint not null,
  created_at timestamptz not null default now()
);

create index offer_redemptions_offer_id_idx on public.offer_redemptions (offer_id);
create index offer_redemptions_tenant_id_idx on public.offer_redemptions (tenant_id);

-- ── reviews ─────────────────────────────────────────────────────────────
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid references public.customers (id),
  customer_name text,
  rating int not null check (rating between 1 and 5),
  food_rating int check (food_rating between 1 and 5),
  service_rating int check (service_rating between 1 and 5),
  speed_rating int check (speed_rating between 1 and 5),
  comment text,
  reply text,
  replied_by uuid references public.users (id),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index reviews_tenant_id_idx on public.reviews (tenant_id);

-- ── notifications (in-app feed, per tenant; read state per membership) ───
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category text not null check (category in ('orders', 'payments', 'staff', 'system', 'reviews')),
  icon text not null default 'bell',
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index notifications_tenant_id_idx on public.notifications (tenant_id, created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, membership_id)
);

-- ── support tickets ─────────────────────────────────────────────────────
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references public.users (id),
  kind text not null check (kind in ('problem', 'question', 'feature')),
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'planned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_tenant_id_idx on public.support_tickets (tenant_id);

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table public.offers enable row level security;
alter table public.offer_redemptions enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.support_tickets enable row level security;

create policy offers_read on public.offers
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy offer_redemptions_read on public.offer_redemptions
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('offers.manage'));

create policy reviews_read on public.reviews
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy notifications_read on public.notifications
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy notification_reads_own on public.notification_reads
  for all to authenticated
  using (membership_id = public.current_membership_id())
  with check (membership_id = public.current_membership_id());

create policy support_tickets_read on public.support_tickets
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy support_tickets_create on public.support_tickets
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());

-- ── RPCs ────────────────────────────────────────────────────────────────

create or replace function public.notify(
  p_tenant_id uuid,
  p_category text,
  p_icon text,
  p_title text,
  p_body text default null,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id)
  values (p_tenant_id, p_category, p_icon, p_title, p_body, p_entity_type, p_entity_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.trg_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify(
    new.tenant_id, 'orders', 'bolt',
    'New order #' || new.order_number,
    '₹' || to_char(new.total_minor / 100.0, 'FM999999990.00'),
    'orders', new.id
  );
  return new;
end;
$$;

create trigger on_order_created
  after insert on public.orders
  for each row execute function public.trg_notify_new_order();

create or replace function public.trg_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_status = 'cancelled' and old.order_status <> 'cancelled' then
    perform public.notify(new.tenant_id, 'orders', 'x', 'Order #' || new.order_number || ' cancelled', new.cancel_reason, 'orders', new.id);
  elsif new.order_status = 'rejected' and old.order_status <> 'rejected' then
    perform public.notify(new.tenant_id, 'orders', 'x', 'Order #' || new.order_number || ' rejected', new.cancel_reason, 'orders', new.id);
  end if;
  return new;
end;
$$;

create trigger on_order_status_changed
  after update of order_status on public.orders
  for each row execute function public.trg_notify_order_status();

create or replace function public.trg_notify_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
begin
  if new.status in ('paid', 'cash_received') then
    select order_number into v_order_number from public.orders where id = new.order_id;
    perform public.notify(
      new.tenant_id, 'payments', 'rupee',
      'Payment received · ₹' || to_char(new.amount_minor / 100.0, 'FM999999990.00'),
      coalesce('Order #' || v_order_number, null),
      'payments', new.id
    );
  end if;
  return new;
end;
$$;

create trigger on_payment_recorded
  after insert on public.payments
  for each row execute function public.trg_notify_payment();

create or replace function public.trg_notify_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify(
    new.tenant_id, 'reviews', 'star',
    'New ' || new.rating || '★ review' || coalesce(' from ' || new.customer_name, ''),
    left(new.comment, 140),
    'reviews', new.id
  );
  return new;
end;
$$;

create trigger on_review_created
  after insert on public.reviews
  for each row execute function public.trg_notify_review();

create or replace function public.trg_notify_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
begin
  select name into v_role_name from public.roles where id = new.role_id;
  perform public.notify(
    new.tenant_id, 'staff', 'users',
    'Invitation sent to ' || coalesce(new.display_name, new.contact),
    v_role_name,
    'staff_invitations', new.id
  );
  return new;
end;
$$;

create trigger on_staff_invited
  after insert on public.staff_invitations
  for each row execute function public.trg_notify_invitation();

-- Mark a single notification read for the caller's membership.
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_reads (notification_id, membership_id)
  values (p_notification_id, public.current_membership_id())
  on conflict do nothing;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id <> public.current_tenant_id() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.notification_reads (notification_id, membership_id)
  select n.id, public.current_membership_id()
  from public.notifications n
  where n.tenant_id = p_tenant_id
  on conflict do nothing;
end;
$$;

revoke execute on function public.mark_all_notifications_read(uuid) from public, anon;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

-- Create / toggle offers (offers.manage required).
create or replace function public.create_offer(p_tenant_id uuid, p_offer jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('offers.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.offers (
    tenant_id, code, kind, value_minor, value_percent, free_menu_item_id,
    max_discount_minor, min_order_minor, auto_apply, scope, category_ids, item_ids,
    days_of_week, starts_at, ends_at, usage_limit, per_customer_limit, created_by
  ) values (
    p_tenant_id,
    upper(p_offer->>'code'),
    p_offer->>'kind',
    (p_offer->>'value_minor')::bigint,
    (p_offer->>'value_percent')::numeric,
    nullif(p_offer->>'free_menu_item_id', '')::uuid,
    (p_offer->>'max_discount_minor')::bigint,
    coalesce((p_offer->>'min_order_minor')::bigint, 0),
    coalesce((p_offer->>'auto_apply')::boolean, false),
    coalesce(p_offer->>'scope', 'all'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_offer->'category_ids') x), '{}'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p_offer->'item_ids') x), '{}'),
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(p_offer->'days_of_week') x), '{0,1,2,3,4,5,6}'),
    coalesce((p_offer->>'starts_at')::timestamptz, now()),
    nullif(p_offer->>'ends_at', '')::timestamptz,
    nullif(p_offer->>'usage_limit', '')::int,
    coalesce((p_offer->>'per_customer_limit')::int, 1),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_offer(uuid, jsonb) from public, anon;
grant execute on function public.create_offer(uuid, jsonb) to authenticated;

create or replace function public.set_offer_active(p_offer_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.offers where id = p_offer_id;
  if v_tenant_id is null or v_tenant_id <> public.current_tenant_id() or not public.has_permission('offers.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.offers set is_active = p_active where id = p_offer_id;
end;
$$;

revoke execute on function public.set_offer_active(uuid, boolean) from public, anon;
grant execute on function public.set_offer_active(uuid, boolean) to authenticated;

-- Reply to a review (reviews.reply required).
create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.reviews where id = p_review_id;
  if v_tenant_id is null or v_tenant_id <> public.current_tenant_id() or not public.has_permission('reviews.reply') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.reviews set reply = p_reply, replied_by = auth.uid(), replied_at = now() where id = p_review_id;
end;
$$;

revoke execute on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

-- Create a support ticket for the caller's tenant.
create or replace function public.create_support_ticket(p_tenant_id uuid, p_kind text, p_title text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_tenant_id <> public.current_tenant_id() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.support_tickets (tenant_id, created_by, kind, title, body)
  values (p_tenant_id, auth.uid(), p_kind, p_title, p_body)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_support_ticket(uuid, text, text, text) from public, anon;
grant execute on function public.create_support_ticket(uuid, text, text, text) to authenticated;

-- Owner-controlled permission overrides on a staff member's membership.
-- Owner-only keys can never be overridden onto someone else, matching the
-- comment on public.user_permission_overrides.
create or replace function public.set_permission_override(
  p_membership_id uuid,
  p_permission_key text,
  p_effect text -- 'grant' | 'deny' | 'clear'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_permission_id uuid;
  v_owner_only constant text[] := array['staff.manage', 'settings.manage', 'subscription.manage', 'ownership.transfer'];
begin
  select tenant_id into v_tenant_id from public.tenant_memberships where id = p_membership_id;
  if v_tenant_id is null or v_tenant_id <> public.current_tenant_id() or not public.has_permission('staff.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_permission_key = any(v_owner_only) then
    raise exception 'owner_only_permission' using errcode = 'P0001';
  end if;

  select id into v_permission_id from public.permissions where key = p_permission_key;
  if v_permission_id is null then
    raise exception 'unknown_permission' using errcode = 'P0001';
  end if;

  if p_effect = 'clear' then
    delete from public.user_permission_overrides
    where membership_id = p_membership_id and permission_id = v_permission_id;
  else
    insert into public.user_permission_overrides (membership_id, permission_id, effect, updated_by)
    values (p_membership_id, v_permission_id, p_effect, auth.uid())
    on conflict (membership_id, permission_id) do update
      set effect = excluded.effect, updated_by = excluded.updated_by, updated_at = now();
  end if;
end;
$$;

revoke execute on function public.set_permission_override(uuid, text, text) from public, anon;
grant execute on function public.set_permission_override(uuid, text, text) to authenticated;

create or replace function public.reset_permission_overrides(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.tenant_memberships where id = p_membership_id;
  if v_tenant_id is null or v_tenant_id <> public.current_tenant_id() or not public.has_permission('staff.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  delete from public.user_permission_overrides where membership_id = p_membership_id;
end;
$$;

revoke execute on function public.reset_permission_overrides(uuid) from public, anon;
grant execute on function public.reset_permission_overrides(uuid) to authenticated;

-- Change a membership's role template (used when the owner picks a different
-- role card on the Staff Permissions screen). Clears existing overrides.
create or replace function public.set_membership_role(p_membership_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_role_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.tenant_memberships where id = p_membership_id;
  if v_tenant_id is null or v_tenant_id <> public.current_tenant_id() or not public.has_permission('staff.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select tenant_id into v_role_tenant_id from public.roles where id = p_role_id;
  if v_role_tenant_id is not null and v_role_tenant_id <> v_tenant_id then
    raise exception 'role_not_found' using errcode = 'P0001';
  end if;

  update public.tenant_memberships set role_id = p_role_id where id = p_membership_id;
  delete from public.user_permission_overrides where membership_id = p_membership_id;
end;
$$;

revoke execute on function public.set_membership_role(uuid, uuid) from public, anon;
grant execute on function public.set_membership_role(uuid, uuid) to authenticated;
