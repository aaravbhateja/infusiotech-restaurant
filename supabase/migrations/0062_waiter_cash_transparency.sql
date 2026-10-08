-- Cash transparency: who served each table, who collected the money, and a
-- handover step where the waiter submits collected cash to the cashier.
--
-- * orders.served_by       membership that marked the order served
-- * payments.collected_by  membership that recorded the payment
-- * payments.handover_id   the handover that moved this cash to the cashier
-- * cash_handovers         waiter -> cashier submission, confirmed by cashier
--
-- Waiters get payments.cash.collect (record cash for the tables they
-- serve). Cashier/Owner/Manager see everything through payments.view and
-- confirm handovers with payments.cash.receive (Owner gets it automatically
-- via the 0038 trigger; granted to Cashier and Manager below).

insert into public.permissions (key, description) values
  ('payments.cash.collect', 'Collect cash at the table and hand it over to the cashier (waiter)'),
  ('payments.cash.receive', 'Confirm cash handed over by waiters (cashier)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000003', id from public.permissions where key = 'payments.cash.collect'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.role_id, p.id
from (values ('00000000-0000-0000-0000-000000000004'::uuid), ('00000000-0000-0000-0000-000000000002'::uuid)) r(role_id)
cross join public.permissions p
where p.key = 'payments.cash.receive'
on conflict do nothing;

-- Waiters also need to see payment status on the orders they serve.
alter table public.orders add column served_by uuid references public.tenant_memberships (id);
alter table public.payments
  add column collected_by uuid references public.tenant_memberships (id),
  add column handover_id uuid,
  add column via_waiter boolean not null default false;

create table public.cash_handovers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waiter_membership_id uuid not null references public.tenant_memberships (id),
  amount_minor bigint not null check (amount_minor > 0),
  received_amount_minor bigint,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  note text,
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references public.tenant_memberships (id),
  confirmed_at timestamptz
);

create index cash_handovers_tenant_idx on public.cash_handovers (tenant_id, submitted_at desc);
create index cash_handovers_waiter_idx on public.cash_handovers (waiter_membership_id, submitted_at desc);

alter table public.payments
  add constraint payments_handover_fk foreign key (handover_id) references public.cash_handovers (id);
create index payments_collected_by_idx on public.payments (collected_by) where collected_by is not null;

alter table public.cash_handovers enable row level security;

-- Waiters see their own handovers; payments.view holders (owner, manager,
-- cashier) see all of the tenant's. All writes go through the RPCs below.
create policy cash_handovers_read on public.cash_handovers
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (waiter_membership_id = public.current_membership_id() or public.has_permission('payments.view'))
  );

-- Record who served the order (the waiter pressing "Served").
create or replace function public.set_order_served_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_status = 'served' and old.order_status is distinct from 'served' then
    new.served_by := public.current_membership_id();
  end if;
  return new;
end;
$$;

create trigger orders_set_served_by
  before update on public.orders
  for each row execute function public.set_order_served_by();

-- Cashiers can record any method (as before); waiters only cash, and only
-- for tables they served.
create or replace function public.record_cash_payment(p_order_id uuid, p_method text default 'cash')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_payment_id uuid;
  v_me uuid := public.current_membership_id();
  v_is_cashier boolean := public.has_permission('payments.cash.record');
begin
  if p_method not in ('cash', 'upi', 'card') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;

  select id, tenant_id, total_minor, currency, payment_status, order_status, served_by into v_order
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not v_is_cashier then
    if not public.has_permission('payments.cash.collect') or p_method <> 'cash' then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;
    if v_order.served_by is distinct from v_me then
      raise exception 'not_your_table' using errcode = 'P0001';
    end if;
  end if;

  if v_order.payment_status not in ('unpaid', 'pending') then
    raise exception 'invalid_payment_state' using errcode = 'P0001';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, verified_at, collected_by, via_waiter)
  values (v_order.tenant_id, p_order_id, 'cash', p_method, v_order.total_minor, v_order.currency, 'cash_received', now(), v_me, not v_is_cashier)
  returning id into v_payment_id;

  update public.orders set payment_status = 'cash_received' where id = p_order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_order.tenant_id, auth.uid(), 'payment.cash_recorded', 'payments', v_payment_id);

  return jsonb_build_object('payment_id', v_payment_id, 'payment_status', 'cash_received');
end;
$$;

grant execute on function public.record_cash_payment(uuid, text) to authenticated;

-- Waiter submits everything collected-and-not-yet-submitted to the cashier.
-- Only cash collected on the waiter path (via_waiter) is handed over;
-- a cashier's own counter payments are already in the drawer.
create or replace function public.submit_cash_handover(p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_membership_id();
  v_total bigint;
  v_id uuid;
begin
  if v_me is null or not public.has_permission('payments.cash.collect') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_minor), 0) into v_total
  from public.payments
  where tenant_id = public.current_tenant_id()
    and collected_by = v_me and via_waiter and handover_id is null
    and status = 'cash_received';

  if v_total <= 0 then
    raise exception 'nothing_to_hand_over' using errcode = 'P0001';
  end if;

  insert into public.cash_handovers (tenant_id, waiter_membership_id, amount_minor, note)
  values (public.current_tenant_id(), v_me, v_total, nullif(trim(p_note), ''))
  returning id into v_id;

  update public.payments set handover_id = v_id
  where tenant_id = public.current_tenant_id()
    and collected_by = v_me and via_waiter and handover_id is null
    and status = 'cash_received';

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id)
  values (public.current_tenant_id(), 'payments', 'cash', 'Cash handover waiting',
          'A waiter submitted ' || (v_total / 100.0)::numeric(12,2) || ' for confirmation.', 'cash_handovers', v_id);

  return v_id;
end;
$$;

-- Cashier counts what they were given. A different amount is allowed and
-- shows up as a shortage/excess in the report.
create or replace function public.confirm_cash_handover(p_handover_id uuid, p_received_minor bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.has_permission('payments.cash.receive') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select id, amount_minor, status into v_row
  from public.cash_handovers
  where id = p_handover_id and tenant_id = public.current_tenant_id()
  for update;

  if v_row.id is null then
    raise exception 'handover_not_found' using errcode = 'P0001';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;
  if p_received_minor is not null and p_received_minor < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  update public.cash_handovers
  set status = 'confirmed',
      received_amount_minor = coalesce(p_received_minor, amount_minor),
      confirmed_by = public.current_membership_id(),
      confirmed_at = now()
  where id = p_handover_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (public.current_tenant_id(), auth.uid(), 'cash.handover_confirmed', 'cash_handovers', p_handover_id);
end;
$$;

-- Per-waiter totals for the transparency screens. A waiter calling this
-- only sees their own row.
create or replace function public.waiter_cash_summary(p_from timestamptz default date_trunc('day', now()))
returns table (
  membership_id uuid,
  waiter_name text,
  tables_served bigint,
  orders_served bigint,
  collected_minor bigint,
  pending_handover_minor bigint,
  confirmed_minor bigint,
  shortage_minor bigint,
  held_by_waiter_minor bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select public.current_membership_id() as id, public.has_permission('payments.view') as sees_all),
  served as (
    select o.served_by as mid,
           count(distinct o.table_id) as tables_served,
           count(*) as orders_served
    from public.orders o
    where o.tenant_id = public.current_tenant_id() and o.served_by is not null and o.served_at >= p_from
    group by o.served_by
  ),
  cash as (
    select p.collected_by as mid,
           sum(p.amount_minor) as collected,
           sum(p.amount_minor) filter (where p.via_waiter and p.handover_id is null) as held
    from public.payments p
    where p.tenant_id = public.current_tenant_id() and p.provider = 'cash' and p.method = 'cash'
      and p.status in ('cash_received', 'reconciled') and p.collected_by is not null and p.created_at >= p_from
    group by p.collected_by
  ),
  hand as (
    select h.waiter_membership_id as mid,
           sum(h.amount_minor) filter (where h.status = 'pending') as pending,
           sum(h.received_amount_minor) filter (where h.status = 'confirmed') as confirmed,
           sum(h.amount_minor - h.received_amount_minor) filter (where h.status = 'confirmed') as shortage
    from public.cash_handovers h
    where h.tenant_id = public.current_tenant_id() and h.submitted_at >= p_from
    group by h.waiter_membership_id
  )
  select m.id,
         coalesce(u.display_name, u.email, 'Staff'),
         coalesce(s.tables_served, 0), coalesce(s.orders_served, 0),
         coalesce(c.collected, 0), coalesce(h.pending, 0), coalesce(h.confirmed, 0),
         coalesce(h.shortage, 0), coalesce(c.held, 0)
  from public.tenant_memberships m
  join public.users u on u.id = m.user_id
  cross join me
  left join served s on s.mid = m.id
  left join cash c on c.mid = m.id
  left join hand h on h.mid = m.id
  where m.tenant_id = public.current_tenant_id()
    and (s.mid is not null or c.mid is not null or h.mid is not null)
    and (me.sees_all or m.id = me.id)
  order by coalesce(c.collected, 0) desc;
$$;

-- Table-by-table: which waiter served it and who collected how much.
create or replace function public.table_service_report(p_from timestamptz default date_trunc('day', now()))
returns table (
  order_id uuid,
  order_number text,
  table_label text,
  served_at timestamptz,
  served_by_name text,
  total_minor bigint,
  payment_status text,
  payment_method text,
  collected_by_name text,
  handover_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.order_number::text, t.label, o.served_at,
         coalesce(su.display_name, su.email),
         o.total_minor, o.payment_status, p.method,
         coalesce(cu.display_name, cu.email),
         case when p.id is null then null when p.handover_id is null then 'with_waiter' else h.status end
  from public.orders o
  left join public.restaurant_tables t on t.id = o.table_id
  left join public.tenant_memberships sm on sm.id = o.served_by
  left join public.users su on su.id = sm.user_id
  left join lateral (
    select * from public.payments p2
    where p2.order_id = o.id and p2.status in ('cash_received', 'paid', 'reconciled')
    order by p2.created_at desc limit 1
  ) p on true
  left join public.tenant_memberships cm on cm.id = p.collected_by
  left join public.users cu on cu.id = cm.user_id
  left join public.cash_handovers h on h.id = p.handover_id
  where o.tenant_id = public.current_tenant_id()
    and o.served_by is not null and o.served_at >= p_from
    and (public.has_permission('payments.view') or o.served_by = public.current_membership_id())
  order by o.served_at desc;
$$;

revoke execute on function public.submit_cash_handover(text) from public, anon;
revoke execute on function public.confirm_cash_handover(uuid, bigint) from public, anon;
revoke execute on function public.waiter_cash_summary(timestamptz) from public, anon;
revoke execute on function public.table_service_report(timestamptz) from public, anon;
grant execute on function public.submit_cash_handover(text) to authenticated;
grant execute on function public.confirm_cash_handover(uuid, bigint) to authenticated;
grant execute on function public.waiter_cash_summary(timestamptz) to authenticated;
grant execute on function public.table_service_report(timestamptz) to authenticated;
