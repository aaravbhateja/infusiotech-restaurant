-- Operations: order types (dine-in / takeaway / delivery), delivery tracking,
-- channel pricing, GST on staff-entered orders, and credit / house accounts.

-- ── Order types and delivery ─────────────────────────────────────────────
alter table public.orders
  add column order_type text not null default 'dine_in' check (order_type in ('dine_in', 'takeaway', 'delivery')),
  add column contact_name text,
  add column delivery_address text,
  add column delivery_phone text,
  add column delivery_fee_minor bigint not null default 0 check (delivery_fee_minor >= 0),
  add column delivery_status text check (delivery_status in ('pending', 'out', 'delivered')),
  add column delivery_rider uuid references public.tenant_memberships (id),
  add column dispatched_at timestamptz,
  add column delivered_at timestamptz;
update public.orders set order_type = 'takeaway' where table_id is null;

-- Totals now include the delivery fee (taxed like the food) and keep the
-- discount within what is payable.
create or replace function public.recalc_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_discount bigint;
  v_fee bigint;
  v_subtotal bigint;
  v_gst numeric;
  v_tax bigint;
begin
  select tenant_id, discount_minor, delivery_fee_minor into v_tenant, v_discount, v_fee from public.orders where id = p_order_id;
  select coalesce(sum(line_total_minor), 0) into v_subtotal
  from public.order_items where order_id = p_order_id and voided_at is null;
  select gst_percent into v_gst from public.tenants where id = v_tenant;
  v_discount := least(coalesce(v_discount, 0), v_subtotal + v_fee);
  v_tax := round((v_subtotal + v_fee - v_discount) * (coalesce(v_gst, 0) / 100.0));
  update public.orders
  set subtotal_minor = v_subtotal, discount_minor = v_discount, tax_minor = v_tax,
      total_minor = v_subtotal + v_fee - v_discount + v_tax
  where id = p_order_id;
end;
$$;
revoke execute on function public.recalc_order_totals(uuid) from public, anon, authenticated;

-- Takeaway / delivery can be priced differently from dine-in.
-- tenants.settings->'channel_pricing' = { takeaway_percent, delivery_percent, delivery_fee_minor }
create or replace function public.set_channel_pricing(p_takeaway_percent numeric, p_delivery_percent numeric, p_delivery_fee_minor integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_takeaway_percent < -50 or p_takeaway_percent > 100 or p_delivery_percent < -50 or p_delivery_percent > 100
     or p_delivery_fee_minor < 0 or p_delivery_fee_minor > 100000 then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  update public.tenants
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{channel_pricing}',
        jsonb_build_object('takeaway_percent', p_takeaway_percent, 'delivery_percent', p_delivery_percent, 'delivery_fee_minor', p_delivery_fee_minor))
  where id = public.current_tenant_id();
end;
$$;
revoke execute on function public.set_channel_pricing(numeric, numeric, integer) from public, anon;
grant execute on function public.set_channel_pricing(numeric, numeric, integer) to authenticated;

-- Staff order entry, now with order type, customer and delivery details, and
-- GST like every other order.
drop function if exists public.create_staff_order(uuid, uuid, jsonb, int);
create or replace function public.create_staff_order(
  p_tenant_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_guest_count int default null,
  p_order_type text default null,
  p_customer_phone text default null,
  p_customer_name text default null,
  p_delivery_address text default null,
  p_delivery_fee_minor bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_type text;
  v_item jsonb;
  v_mi record;
  v_variant record;
  v_addon record;
  v_variant_ids uuid[];
  v_addon_ids uuid[];
  v_qty int;
  v_unit bigint;
  v_vsnap jsonb;
  v_asnap jsonb;
  v_pct numeric := 0;
  v_cfg jsonb;
  v_fee bigint := 0;
  v_phone text := right(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), 10);
  v_cust uuid;
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('orders.create') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  v_type := coalesce(p_order_type, case when p_table_id is null then 'takeaway' else 'dine_in' end);
  if v_type not in ('dine_in', 'takeaway', 'delivery') then
    raise exception 'invalid_order_type' using errcode = 'P0001';
  end if;
  if v_type = 'dine_in' and p_table_id is null then
    raise exception 'table_required' using errcode = 'P0001';
  end if;
  if v_type <> 'dine_in' and p_table_id is not null then
    p_table_id := null;
  end if;
  if p_table_id is not null then
    perform 1 from public.restaurant_tables where id = p_table_id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'table_not_found' using errcode = 'P0001';
    end if;
  end if;
  if v_type = 'delivery' and (length(v_phone) < 10 or length(trim(coalesce(p_delivery_address, ''))) = 0) then
    raise exception 'delivery_details_required' using errcode = 'P0001';
  end if;

  select settings->'channel_pricing' into v_cfg from public.tenants where id = p_tenant_id;
  if v_type = 'takeaway' then v_pct := coalesce((v_cfg->>'takeaway_percent')::numeric, 0); end if;
  if v_type = 'delivery' then
    v_pct := coalesce((v_cfg->>'delivery_percent')::numeric, 0);
    v_fee := coalesce(p_delivery_fee_minor, (v_cfg->>'delivery_fee_minor')::bigint, 0);
  end if;

  if length(v_phone) = 10 then
    select id into v_cust from public.customers where tenant_id = p_tenant_id and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_phone limit 1;
    if v_cust is null then
      insert into public.customers (tenant_id, name, phone) values (p_tenant_id, nullif(trim(p_customer_name), ''), v_phone) returning id into v_cust;
    end if;
  end if;

  v_order_number := to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.orders (
    tenant_id, table_id, customer_id, order_number, order_status, payment_status, subtotal_minor, tax_minor, discount_minor, total_minor,
    guest_count, taken_by, order_type, contact_name, delivery_address, delivery_phone, delivery_fee_minor, delivery_status
  ) values (
    p_tenant_id, p_table_id, v_cust, v_order_number, 'accepted', 'unpaid', 0, 0, 0, 0,
    p_guest_count, auth.uid(), v_type, nullif(trim(p_customer_name), ''),
    case when v_type = 'delivery' then trim(p_delivery_address) end, case when v_type = 'delivery' then v_phone end,
    v_fee, case when v_type = 'delivery' then 'pending' end
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price_minor into v_mi from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and tenant_id = p_tenant_id and is_available = true;
    if v_mi.id is null then
      raise exception 'menu_item_unavailable: %', v_item->>'menu_item_id' using errcode = 'P0001';
    end if;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;
    v_unit := v_mi.price_minor;
    v_vsnap := '[]'::jsonb;
    v_asnap := '[]'::jsonb;

    select array(select jsonb_array_elements_text(coalesce(v_item->'variant_ids', '[]'::jsonb)))::uuid[] into v_variant_ids;
    for v_variant in
      select iv.id, iv.name, iv.price_delta_minor from public.item_variants iv join public.item_variant_groups g on g.id = iv.group_id
      where iv.id = any(v_variant_ids) and iv.tenant_id = p_tenant_id and g.menu_item_id = v_mi.id and iv.is_available
    loop
      v_unit := v_unit + v_variant.price_delta_minor;
      v_vsnap := v_vsnap || jsonb_build_object('id', v_variant.id, 'name', v_variant.name, 'price_delta_minor', v_variant.price_delta_minor);
    end loop;
    select array(select jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)))::uuid[] into v_addon_ids;
    for v_addon in
      select ia.id, ia.name, ia.price_delta_minor from public.item_addons ia join public.item_addon_groups g on g.id = ia.group_id
      where ia.id = any(v_addon_ids) and ia.tenant_id = p_tenant_id and g.menu_item_id = v_mi.id and ia.is_available
    loop
      v_unit := v_unit + v_addon.price_delta_minor;
      v_asnap := v_asnap || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price_delta_minor', v_addon.price_delta_minor);
    end loop;

    v_unit := round(v_unit * (1 + v_pct / 100.0));

    insert into public.order_items (tenant_id, order_id, menu_item_id, item_name_snapshot, variant_snapshot, addon_snapshot, unit_price_minor, quantity, tax_minor, line_total_minor)
    values (p_tenant_id, v_order_id, v_mi.id, v_mi.name, v_vsnap, v_asnap, v_unit, v_qty, 0, v_unit * v_qty);
  end loop;

  perform public.recalc_order_totals(v_order_id);

  if p_table_id is not null then
    update public.restaurant_tables set floor_state = 'available' where id = p_table_id;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                            'total_minor', (select total_minor from public.orders where id = v_order_id));
end;
$$;
revoke execute on function public.create_staff_order(uuid, uuid, jsonb, int, text, text, text, text, bigint) from public, anon;
grant execute on function public.create_staff_order(uuid, uuid, jsonb, int, text, text, text, text, bigint) to authenticated;

-- Delivery workflow --------------------------------------------------------
create or replace function public.assign_rider(p_order_id uuid, p_rider uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('orders.edit') or public.has_permission('orders.status.update') or public.has_permission('orders.accept')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.orders set delivery_rider = p_rider
  where id = p_order_id and tenant_id = public.current_tenant_id() and order_type = 'delivery' and delivery_status in ('pending', 'out')
    and exists (select 1 from public.tenant_memberships m where m.id = p_rider and m.tenant_id = public.current_tenant_id() and m.status = 'active');
end;
$$;

create or replace function public.dispatch_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o record;
begin
  if not (public.has_permission('orders.edit') or public.has_permission('orders.status.update') or public.has_permission('orders.serve')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_o from public.orders where id = p_order_id and tenant_id = public.current_tenant_id() and order_type = 'delivery' for update;
  if v_o.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_o.order_status <> 'ready' or v_o.delivery_status <> 'pending' then
    raise exception 'not_ready_to_dispatch' using errcode = 'P0001';
  end if;
  update public.orders set delivery_status = 'out', dispatched_at = now(),
         delivery_rider = coalesce(delivery_rider, public.current_membership_id())
  where id = p_order_id;
end;
$$;

-- Delivered: the order is complete (stock is used, the rider is recorded as
-- having served it) and any cash on delivery can be recorded.
create or replace function public.complete_delivery(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o record;
begin
  if not (public.has_permission('orders.edit') or public.has_permission('orders.status.update') or public.has_permission('orders.serve')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_o from public.orders where id = p_order_id and tenant_id = public.current_tenant_id() and order_type = 'delivery' for update;
  if v_o.id is null or v_o.delivery_status <> 'out' then
    raise exception 'not_out_for_delivery' using errcode = 'P0001';
  end if;
  update public.orders set delivery_status = 'delivered', delivered_at = now(), order_status = 'served' where id = p_order_id;
end;
$$;

revoke execute on function public.assign_rider(uuid, uuid) from public, anon;
revoke execute on function public.dispatch_delivery(uuid) from public, anon;
revoke execute on function public.complete_delivery(uuid) from public, anon;
grant execute on function public.assign_rider(uuid, uuid) to authenticated;
grant execute on function public.dispatch_delivery(uuid) to authenticated;
grant execute on function public.complete_delivery(uuid) to authenticated;

-- A delivered / takeaway order has no table to release.
create or replace function public.trg_order_table_release()
returns trigger
language plpgsql
as $$
begin
  if new.order_status = 'served' and old.order_status is distinct from 'served' then
    new.served_at := now();
  end if;
  if new.table_released_at is null and (
    new.order_status in ('rejected', 'cancelled')
    or (new.order_status = 'served' and new.payment_status in ('paid', 'cash_received', 'reconciled'))
    or (new.order_status = 'served' and new.order_type <> 'dine_in')
  ) then
    new.table_released_at := now();
  end if;
  return new;
end;
$$;

-- ── Credit / house accounts ──────────────────────────────────────────────
alter table public.customers
  add column credit_limit_minor bigint not null default 0 check (credit_limit_minor >= 0),
  add column account_balance_minor bigint not null default 0;

create table public.account_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  amount_minor bigint not null,                       -- + charged to the account, - paid off
  kind text not null check (kind in ('charge', 'payment', 'adjust')),
  method text check (method in ('cash', 'upi', 'card', 'bank')),
  order_id uuid references public.orders (id) on delete set null,
  note text,
  created_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now()
);
create index account_entries_customer_idx on public.account_entries (customer_id, created_at desc);
alter table public.account_entries enable row level security;
create policy account_entries_read on public.account_entries for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.has_permission('payments.view') or public.has_permission('customers.view')));

create or replace function public.set_credit_limit(p_customer uuid, p_limit_minor bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('payments.refund') and not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_limit_minor < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  update public.customers set credit_limit_minor = p_limit_minor where id = p_customer and tenant_id = public.current_tenant_id();
end;
$$;

-- Charge (part of) a bill to the guest's house account; recorded like any
-- other payment so the bill is settled, with the money owed tracked here.
create or replace function public.charge_to_account(p_order_id uuid, p_amount_minor bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_o record;
  v_c record;
  v_amount bigint;
  v_pay uuid;
  v_me uuid := public.current_membership_id();
begin
  if not public.has_permission('payments.cash.record') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_o from public.orders where id = p_order_id and tenant_id = public.current_tenant_id() for update;
  if v_o.id is null or v_o.customer_id is null then
    raise exception 'order_has_no_customer' using errcode = 'P0001';
  end if;
  if v_o.payment_status not in ('unpaid', 'pending') or v_o.order_status in ('rejected', 'cancelled') then
    raise exception 'invalid_payment_state' using errcode = 'P0001';
  end if;
  select * into v_c from public.customers where id = v_o.customer_id for update;
  v_amount := coalesce(p_amount_minor, v_o.total_minor - v_o.amount_paid_minor);
  if v_amount <= 0 or v_amount > v_o.total_minor - v_o.amount_paid_minor then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if v_c.account_balance_minor + v_amount > v_c.credit_limit_minor then
    raise exception 'credit_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, verified_at, collected_by, via_waiter)
  values (v_o.tenant_id, p_order_id, 'cash', 'credit', v_amount, v_o.currency, 'cash_received', now(), v_me, false) returning id into v_pay;
  update public.orders set amount_paid_minor = amount_paid_minor + v_amount where id = p_order_id;
  update public.customers set account_balance_minor = account_balance_minor + v_amount where id = v_c.id;
  insert into public.account_entries (tenant_id, customer_id, amount_minor, kind, order_id, note, created_by)
  values (v_o.tenant_id, v_c.id, v_amount, 'charge', p_order_id, 'Order #' || v_o.order_number, v_me);

  return jsonb_build_object('payment_id', v_pay, 'balance_minor', v_c.account_balance_minor + v_amount, 'limit_minor', v_c.credit_limit_minor);
end;
$$;

-- The guest pays something off. The money goes into the till (counted in the
-- cashier's drawer for cash) but is not new sales: that was recognised when
-- it was charged.
create or replace function public.settle_account(p_customer uuid, p_amount_minor bigint, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
begin
  if not public.has_permission('payments.cash.record') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_method not in ('cash', 'upi', 'card', 'bank') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  select * into v_c from public.customers where id = p_customer and tenant_id = public.current_tenant_id() for update;
  if v_c.id is null then
    raise exception 'customer_not_found' using errcode = 'P0001';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > v_c.account_balance_minor then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  update public.customers set account_balance_minor = account_balance_minor - p_amount_minor where id = p_customer;
  insert into public.account_entries (tenant_id, customer_id, amount_minor, kind, method, note, created_by)
  values (v_c.tenant_id, p_customer, -p_amount_minor, 'payment', p_method, 'Payment received', public.current_membership_id());
  return jsonb_build_object('balance_minor', v_c.account_balance_minor - p_amount_minor);
end;
$$;

revoke execute on function public.set_credit_limit(uuid, bigint) from public, anon;
revoke execute on function public.charge_to_account(uuid, bigint) from public, anon;
revoke execute on function public.settle_account(uuid, bigint, text) from public, anon;
grant execute on function public.set_credit_limit(uuid, bigint) to authenticated;
grant execute on function public.charge_to_account(uuid, bigint) to authenticated;
grant execute on function public.settle_account(uuid, bigint, text) to authenticated;

-- ── Reservations and waitlist ───────────────────────────────────────────
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  phone text,
  party_size int not null check (party_size between 1 and 100),
  reserved_for timestamptz,                    -- null = walk-in waitlist
  status text not null default 'booked' check (status in ('booked', 'waiting', 'seated', 'no_show', 'cancelled')),
  table_id uuid references public.restaurant_tables (id) on delete set null,
  note text,
  created_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now()
);
create index reservations_tenant_idx on public.reservations (tenant_id, reserved_for);
alter table public.reservations enable row level security;
create policy reservations_read on public.reservations for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('tables.view'));
create policy reservations_write on public.reservations for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('tables.assign'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('tables.assign'));
alter publication supabase_realtime add table public.reservations;

-- A rough quote for a walk-in party: how long tables usually stay taken, and
-- how many parties are already waiting.
create or replace function public.waitlist_estimate()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_dwell numeric;
  v_tables int;
  v_waiting int;
begin
  if not public.has_permission('tables.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select coalesce(percentile_cont(0.5) within group (order by extract(epoch from (coalesce(table_released_at, served_at, now()) - created_at)) / 60.0), 45)
  into v_dwell
  from (select created_at, served_at, table_released_at from public.orders
        where tenant_id = v_tenant and order_type = 'dine_in' and order_status = 'served' and created_at >= now() - interval '30 days'
        order by created_at desc limit 100) x;
  v_dwell := least(greatest(v_dwell, 20), 120);
  select count(*) into v_tables from public.restaurant_tables where tenant_id = v_tenant and status = 'active';
  select count(*) into v_waiting from public.reservations where tenant_id = v_tenant and status = 'waiting';
  return jsonb_build_object(
    'dwell_minutes', round(v_dwell),
    'waiting', v_waiting,
    'estimate_minutes', greatest(5, round(((v_waiting + 1) * v_dwell / greatest(v_tables, 1)) / 5.0) * 5)
  );
end;
$$;
revoke execute on function public.waitlist_estimate() from public, anon;
grant execute on function public.waitlist_estimate() to authenticated;
