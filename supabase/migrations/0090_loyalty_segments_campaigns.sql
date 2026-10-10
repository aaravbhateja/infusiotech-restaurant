-- Customer growth: loyalty points, customer segments (win-back, birthdays,
-- big spenders, new), and campaign tracking with a simple ROI.

alter table public.customers
  add column birthday date,
  add column anniversary date,
  add column points_balance integer not null default 0 check (points_balance >= 0);

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  points integer not null,
  kind text not null check (kind in ('earn', 'redeem', 'adjust')),
  order_id uuid references public.orders (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index loyalty_ledger_customer_idx on public.loyalty_ledger (customer_id, created_at desc);
create unique index loyalty_one_earn_per_order on public.loyalty_ledger (order_id) where kind = 'earn';
alter table public.loyalty_ledger enable row level security;
create policy loyalty_ledger_read on public.loyalty_ledger for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('customers.view'));

-- Settings live in tenants.settings->'loyalty':
--   { enabled, earn_per_100 (points per ₹100 spent), point_value_minor (paise per point when redeemed) }
create or replace function public.set_loyalty_settings(p_enabled boolean, p_earn_per_100 numeric, p_point_value_minor integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_earn_per_100 < 0 or p_earn_per_100 > 100 or p_point_value_minor < 0 or p_point_value_minor > 10000 then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  update public.tenants
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{loyalty}',
        jsonb_build_object('enabled', p_enabled, 'earn_per_100', p_earn_per_100, 'point_value_minor', p_point_value_minor))
  where id = public.current_tenant_id();
end;
$$;
revoke execute on function public.set_loyalty_settings(boolean, numeric, integer) from public, anon;
grant execute on function public.set_loyalty_settings(boolean, numeric, integer) to authenticated;

-- Points are earned once, when an order with a known customer is paid in full.
create or replace function public.trg_loyalty_earn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_points integer;
begin
  if new.customer_id is null
     or new.payment_status not in ('paid', 'cash_received', 'reconciled')
     or old.payment_status in ('paid', 'cash_received', 'reconciled')
     or new.order_status in ('rejected', 'cancelled') then
    return null;
  end if;
  select settings->'loyalty' into v_cfg from public.tenants where id = new.tenant_id;
  if v_cfg is null or coalesce((v_cfg->>'enabled')::boolean, false) = false then
    return null;
  end if;
  v_points := floor(new.total_minor / 10000.0 * coalesce((v_cfg->>'earn_per_100')::numeric, 1));
  if v_points <= 0 then
    return null;
  end if;
  insert into public.loyalty_ledger (tenant_id, customer_id, points, kind, order_id, note)
  values (new.tenant_id, new.customer_id, v_points, 'earn', new.id, 'Order #' || new.order_number)
  on conflict do nothing;
  if found then
    update public.customers set points_balance = points_balance + v_points where id = new.customer_id;
  end if;
  return null;
end;
$$;
create trigger orders_loyalty_earn after update of payment_status on public.orders
  for each row execute function public.trg_loyalty_earn();

-- Link a customer (by phone) to an order the staff took.
create or replace function public.attach_customer_to_order(p_order_id uuid, p_phone text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tenant uuid := public.current_tenant_id();
  v_cust record;
begin
  if not (public.has_permission('orders.edit') or public.has_permission('payments.cash.record') or public.has_permission('orders.create')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_phone) < 10 then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  v_phone := right(v_phone, 10);
  if not exists (select 1 from public.orders where id = p_order_id and tenant_id = v_tenant) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  select * into v_cust from public.customers where tenant_id = v_tenant and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_phone limit 1;
  if v_cust.id is null then
    insert into public.customers (tenant_id, name, phone) values (v_tenant, nullif(trim(p_name), ''), v_phone) returning * into v_cust;
  elsif v_cust.name is null and nullif(trim(p_name), '') is not null then
    update public.customers set name = trim(p_name) where id = v_cust.id returning * into v_cust;
  end if;
  update public.orders set customer_id = v_cust.id where id = p_order_id;
  return jsonb_build_object('customer_id', v_cust.id, 'name', v_cust.name, 'points', v_cust.points_balance);
end;
$$;
revoke execute on function public.attach_customer_to_order(uuid, text, text) from public, anon;
grant execute on function public.attach_customer_to_order(uuid, text, text) to authenticated;

-- Spend points as a discount on an unpaid order.
create or replace function public.redeem_points(p_order_id uuid, p_points integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_cfg jsonb;
  v_value integer;
  v_cust record;
  v_discount bigint;
begin
  if not (public.has_permission('payments.cash.record') or public.has_permission('orders.edit')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id and tenant_id = public.current_tenant_id() for update;
  if v_order.id is null or v_order.customer_id is null then
    raise exception 'order_has_no_customer' using errcode = 'P0001';
  end if;
  if v_order.payment_status not in ('unpaid', 'pending') or v_order.order_status in ('rejected', 'cancelled') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;
  select settings->'loyalty' into v_cfg from public.tenants where id = v_order.tenant_id;
  if v_cfg is null or coalesce((v_cfg->>'enabled')::boolean, false) = false then
    raise exception 'loyalty_disabled' using errcode = 'P0001';
  end if;
  v_value := coalesce((v_cfg->>'point_value_minor')::integer, 100);
  select * into v_cust from public.customers where id = v_order.customer_id for update;
  if p_points is null or p_points <= 0 or p_points > v_cust.points_balance then
    raise exception 'invalid_points' using errcode = 'P0001';
  end if;

  -- Never discount more than what is still payable.
  v_discount := least(p_points::bigint * v_value, v_order.total_minor - v_order.amount_paid_minor);
  if v_discount <= 0 then
    raise exception 'nothing_to_discount' using errcode = 'P0001';
  end if;
  p_points := ceil(v_discount::numeric / v_value);

  update public.orders set discount_minor = discount_minor + v_discount where id = p_order_id;
  perform public.recalc_order_totals(p_order_id);
  update public.customers set points_balance = points_balance - p_points where id = v_cust.id;
  insert into public.loyalty_ledger (tenant_id, customer_id, points, kind, order_id, note)
  values (v_order.tenant_id, v_cust.id, -p_points, 'redeem', p_order_id, 'Redeemed on order #' || v_order.order_number);

  return jsonb_build_object('points_used', p_points, 'discount_minor', v_discount, 'points_left', v_cust.points_balance - p_points);
end;
$$;
revoke execute on function public.redeem_points(uuid, integer) from public, anon;
grant execute on function public.redeem_points(uuid, integer) to authenticated;

-- Segments for outreach. Only customers who agreed to marketing may be
-- messaged with promotions; the flag is returned so the app can enforce it.
create or replace function public.customer_segments()
returns table (customer_id uuid, name text, phone text, consent boolean, visits bigint, spend_minor bigint, last_order timestamptz, days_since integer, points integer, birthday date, segment text)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select c.id, c.name, c.phone, c.consent_marketing, c.points_balance, c.birthday, c.created_at,
           count(o.id) as visits, coalesce(sum(o.total_minor), 0)::bigint as spend, max(o.created_at) as last_order
    from public.customers c
    left join public.orders o on o.customer_id = c.id and o.order_status not in ('rejected', 'cancelled')
         and o.payment_status in ('paid', 'cash_received', 'reconciled')
    where c.tenant_id = public.current_tenant_id() and public.has_permission('customers.view') and c.phone is not null
    group by c.id
  ),
  seg as (
    select s.*, extract(day from (now() - s.last_order))::int as ds,
      case
        when s.birthday is not null and (to_char(s.birthday, 'MMDD') between to_char((now() at time zone 'Asia/Kolkata')::date, 'MMDD') and to_char((now() at time zone 'Asia/Kolkata')::date + 7, 'MMDD')) then 'Birthday this week'
        when s.last_order is not null and s.last_order < now() - interval '30 days' and s.last_order >= now() - interval '180 days' and s.visits >= 2 then 'Win-back'
        when s.spend >= 500000 and s.last_order >= now() - interval '60 days' then 'Big spender'
        when s.created_at >= now() - interval '14 days' then 'New'
        else null
      end as segment
    from stats s
  )
  select id, name, phone, consent_marketing, visits, spend, last_order, ds, points_balance, birthday, segment
  from seg where segment is not null order by segment, spend desc;
$$;
revoke execute on function public.customer_segments() from public, anon;
grant execute on function public.customer_segments() to authenticated;

-- Campaigns: staff send a message from their own WhatsApp and log it, so the
-- orders that follow can be attributed.
create table public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign text not null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  sent_by uuid references public.tenant_memberships (id),
  sent_at timestamptz not null default now()
);
create index campaign_sends_tenant_idx on public.campaign_sends (tenant_id, sent_at desc);
alter table public.campaign_sends enable row level security;
create policy campaign_sends_read on public.campaign_sends for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('customers.view'));
create policy campaign_sends_insert on public.campaign_sends for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('customers.view') and sent_by = public.current_membership_id());

create or replace function public.campaign_results()
returns table (campaign text, sent bigint, returned bigint, revenue_minor bigint, first_sent timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select cs.campaign, count(*)::bigint,
         count(distinct cs.customer_id) filter (where exists (
           select 1 from public.orders o where o.customer_id = cs.customer_id and o.created_at > cs.sent_at and o.created_at <= cs.sent_at + interval '14 days'
             and o.order_status not in ('rejected', 'cancelled') and o.payment_status in ('paid', 'cash_received', 'reconciled')))::bigint,
         coalesce(sum((select sum(o.total_minor) from public.orders o where o.customer_id = cs.customer_id and o.created_at > cs.sent_at and o.created_at <= cs.sent_at + interval '14 days'
             and o.order_status not in ('rejected', 'cancelled') and o.payment_status in ('paid', 'cash_received', 'reconciled'))), 0)::bigint,
         min(cs.sent_at)
  from public.campaign_sends cs
  where cs.tenant_id = public.current_tenant_id() and public.has_permission('customers.view')
  group by cs.campaign
  order by min(cs.sent_at) desc;
$$;
revoke execute on function public.campaign_results() from public, anon;
grant execute on function public.campaign_results() to authenticated;
