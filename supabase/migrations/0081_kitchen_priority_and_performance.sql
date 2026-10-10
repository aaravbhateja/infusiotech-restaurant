-- Kitchen: rush priority, and an event log of every status change so prep
-- times and delays can be measured (kitchen performance analytics).

alter table public.orders
  add column priority text not null default 'normal' check (priority in ('normal', 'rush'));

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  round smallint not null default 1,
  at timestamptz not null default now(),
  actor_user_id uuid references public.users (id)
);
create index order_events_order_idx on public.order_events (order_id, at);
create index order_events_tenant_idx on public.order_events (tenant_id, at desc);
alter table public.order_events enable row level security;

create policy order_events_read on public.order_events
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('analytics.basic.view'));

create or replace function public.trg_log_order_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.order_status is distinct from old.order_status then
    insert into public.order_events (tenant_id, order_id, status, round, actor_user_id)
    values (new.tenant_id, new.id, new.order_status, new.current_round, auth.uid());
  end if;
  return null;
end;
$$;

create trigger orders_log_event_ins after insert on public.orders
  for each row execute function public.trg_log_order_event();
create trigger orders_log_event_upd after update of order_status on public.orders
  for each row execute function public.trg_log_order_event();

-- Orders already in flight: record where they stand now.
insert into public.order_events (tenant_id, order_id, status, round, at)
select tenant_id, id, order_status, current_round, created_at from public.orders;

create or replace function public.set_order_priority(p_order_id uuid, p_priority text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_label text;
begin
  if p_priority not in ('normal', 'rush') then
    raise exception 'invalid_priority' using errcode = 'P0001';
  end if;
  if not (public.has_permission('orders.edit') or public.has_permission('orders.status.update')
          or public.has_permission('orders.accept')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id and tenant_id = public.current_tenant_id();
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.order_status in ('served', 'rejected', 'cancelled') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;

  update public.orders set priority = p_priority where id = p_order_id;

  if p_priority = 'rush' and v_order.priority <> 'rush' then
    select label into v_label from public.restaurant_tables where id = v_order.table_id;
    insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
    values (v_order.tenant_id, 'orders', 'bolt', 'RUSH order · ' || coalesce(v_label, 'Takeaway'),
            'Order #' || v_order.order_number || ' needs to go out fast.', 'orders', p_order_id,
            array['Kitchen Staff', 'Manager']);
  end if;
end;
$$;
revoke execute on function public.set_order_priority(uuid, text) from public, anon;
grant execute on function public.set_order_priority(uuid, text) to authenticated;

-- Prep time = from when the kitchen got the order (accepted) to ready, for
-- each order round. Late = a late alert was raised (0076).
create or replace function public.kitchen_performance(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_result jsonb;
begin
  if not public.has_permission('analytics.basic.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  with spans as (
    select r.order_id, r.round, r.at as ready_at,
           (select max(a.at) from public.order_events a
            where a.order_id = r.order_id and a.round = r.round and a.status in ('accepted', 'new') and a.at <= r.at) as start_at
    from public.order_events r
    where r.tenant_id = v_tenant and r.status = 'ready' and r.at >= p_from and r.at < p_to
  ),
  mins as (
    select order_id, round, extract(epoch from (ready_at - start_at)) / 60.0 as minutes
    from spans where start_at is not null
  ),
  dish as (
    select oi.item_name_snapshot as name, avg(m.minutes) as avg_minutes, count(*) as times
    from mins m
    join public.order_items oi on oi.order_id = m.order_id and oi.round = m.round and oi.voided_at is null
    group by oi.item_name_snapshot
  )
  select jsonb_build_object(
    'orders_prepared', (select count(*) from mins),
    'avg_prep_minutes', (select round(avg(minutes)::numeric, 1) from mins),
    'slowest_minutes', (select round(max(minutes)::numeric, 1) from mins),
    'late_orders', (select count(*) from public.orders o where o.tenant_id = v_tenant and o.late_alerted_at >= p_from and o.late_alerted_at < p_to),
    'rush_orders', (select count(*) from public.orders o where o.tenant_id = v_tenant and o.priority = 'rush' and o.created_at >= p_from and o.created_at < p_to),
    'slowest_dishes', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'avg_minutes', round(avg_minutes::numeric, 1), 'times', times) order by avg_minutes desc)
                                from (select * from dish where times >= 2 order by avg_minutes desc limit 5) d), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.kitchen_performance(timestamptz, timestamptz) from public, anon;
grant execute on function public.kitchen_performance(timestamptz, timestamptz) to authenticated;

