-- AI assistance: usage limits, an aggregate-only business snapshot for
-- "ask your data", and data-driven upsell pairings (no language model needed).

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('describe', 'ask')),
  used_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now()
);
create index ai_usage_tenant_day_idx on public.ai_usage (tenant_id, created_at desc);
alter table public.ai_usage enable row level security;
-- No policies: only the SECURITY DEFINER functions below touch it.

-- Counts one AI request against the restaurant's daily allowance and returns
-- how many are left. Raises when the permission is missing or the day's
-- allowance is used up, so a runaway script cannot run up the bill.
create or replace function public.ai_consume(p_kind text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant integer := 40;
  v_used integer;
begin
  if p_kind = 'describe' and not public.has_permission('menu.edit') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_kind = 'ask' and not public.has_permission('analytics.advanced.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_kind not in ('describe', 'ask') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  select count(*) into v_used from public.ai_usage
  where tenant_id = public.current_tenant_id() and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  if v_used >= v_limit then
    raise exception 'ai_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.ai_usage (tenant_id, kind, used_by) values (public.current_tenant_id(), p_kind, public.current_membership_id());
  return v_limit - v_used - 1;
end;
$$;
revoke execute on function public.ai_consume(text) from public, anon;
grant execute on function public.ai_consume(text) to authenticated;

-- Everything the assistant is allowed to know: totals and rankings, never
-- names, phone numbers or individual bills.
create or replace function public.ai_business_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_from timestamptz;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_out jsonb;
begin
  if not public.has_permission('analytics.advanced.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  v_from := (((now() at time zone 'Asia/Kolkata')::date - (v_days - 1))::timestamp at time zone 'Asia/Kolkata');

  with o as (
    select * from public.orders
    where tenant_id = v_tenant and created_at >= v_from
      and order_status not in ('rejected', 'cancelled') and payment_status in ('paid', 'cash_received', 'reconciled')
  )
  select jsonb_build_object(
    'period_days', v_days,
    'currency', 'INR',
    'note', 'All money values are in rupees. Dates and hours are India time.',
    'total_sales', coalesce((select round(sum(total_minor) / 100.0) from o), 0),
    'orders', (select count(*) from o),
    'average_bill', coalesce((select round(avg(total_minor) / 100.0) from o), 0),
    'discounts_given', coalesce((select round(sum(discount_minor) / 100.0) from o), 0),
    'gst_collected', coalesce((select round(sum(tax_minor) / 100.0) from o), 0),
    'sales_by_day', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'sales', s, 'orders', n) order by d)
        from (select (created_at at time zone 'Asia/Kolkata')::date as d, round(sum(total_minor) / 100.0) as s, count(*) as n from o group by 1) x), '[]'::jsonb),
    'sales_by_weekday', coalesce((select jsonb_agg(jsonb_build_object('weekday', w, 'sales', s, 'orders', n) order by dow)
        from (select to_char(created_at at time zone 'Asia/Kolkata', 'Dy') as w, extract(dow from created_at at time zone 'Asia/Kolkata') as dow, round(sum(total_minor) / 100.0) as s, count(*) as n from o group by 1, 2) x), '[]'::jsonb),
    'sales_by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'sales', s, 'orders', n) order by h)
        from (select extract(hour from created_at at time zone 'Asia/Kolkata')::int as h, round(sum(total_minor) / 100.0) as s, count(*) as n from o group by 1) x), '[]'::jsonb),
    'order_types', coalesce((select jsonb_agg(jsonb_build_object('type', order_type, 'orders', n, 'sales', s))
        from (select order_type, count(*) as n, round(sum(total_minor) / 100.0) as s from o group by 1) x), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object('item', name, 'qty', q, 'sales', s) order by q desc)
        from (select oi.item_name_snapshot as name, sum(oi.quantity) as q, round(sum(oi.line_total_minor) / 100.0) as s
              from public.order_items oi join o on o.id = oi.order_id where oi.voided_at is null
              group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'slowest_items', coalesce((select jsonb_agg(jsonb_build_object('item', name, 'qty', q) order by q)
        from (select mi.name, coalesce(sum(oi.quantity), 0) as q
              from public.menu_items mi
              left join public.order_items oi on oi.menu_item_id = mi.id and oi.voided_at is null and oi.order_id in (select id from o)
              where mi.tenant_id = v_tenant and mi.manual_available
              group by mi.id, mi.name order by 2 limit 8) x), '[]'::jsonb),
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amount', s))
        from (select p.method, round(sum(p.amount_minor) / 100.0) as s from public.payments p
              where p.order_id in (select id from o) and p.status in ('paid', 'cash_received', 'reconciled') group by 1) x), '[]'::jsonb),
    'voided_items', (select count(*) from public.order_items where tenant_id = v_tenant and voided_at >= v_from),
    'refunds_total', coalesce((select round(sum(amount_minor) / 100.0) from public.refunds where tenant_id = v_tenant and created_at >= v_from), 0),
    'new_customers', (select count(*) from public.customers where tenant_id = v_tenant and created_at >= v_from),
    'repeat_customers', (select count(*) from (select customer_id from o where customer_id is not null group by 1 having count(*) > 1) x)
  ) into v_out;
  return v_out;
end;
$$;
revoke execute on function public.ai_business_snapshot(integer) from public, anon;
grant execute on function public.ai_business_snapshot(integer) to authenticated;

-- "Goes well with": the dishes most often ordered together with the ones
-- already in the cart (last 90 days). Pure statistics.
create or replace function public.item_pairings(p_item_ids uuid[], p_limit integer default 4)
returns table (menu_item_id uuid, name text, price_minor bigint, together bigint)
language sql
stable
security definer
set search_path = public
as $$
  select mi.id, mi.name, mi.price_minor, count(distinct b.order_id)::bigint as together
  from public.order_items a
  join public.order_items b on b.order_id = a.order_id and b.menu_item_id <> a.menu_item_id
  join public.menu_items mi on mi.id = b.menu_item_id
  join public.orders o on o.id = a.order_id
  where a.tenant_id = public.current_tenant_id()
    and public.has_permission('menu.view')
    and a.menu_item_id = any(p_item_ids)
    and not (b.menu_item_id = any(p_item_ids))
    and a.voided_at is null and b.voided_at is null
    and o.created_at >= now() - interval '90 days'
    and mi.is_available and mi.combo_of is null
  group by mi.id, mi.name, mi.price_minor
  having count(distinct b.order_id) >= 2
  order by together desc, mi.name
  limit least(greatest(coalesce(p_limit, 4), 1), 10);
$$;
revoke execute on function public.item_pairings(uuid[], integer) from public, anon;
grant execute on function public.item_pairings(uuid[], integer) to authenticated;
