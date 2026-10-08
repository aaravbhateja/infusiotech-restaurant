-- 'Collected' now totals every payment the person recorded (cash, UPI, card);
-- only the cash part is held/handed over.
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
           sum(p.amount_minor) filter (where p.via_waiter and p.method = 'cash' and p.handover_id is null) as held
    from public.payments p
    where p.tenant_id = public.current_tenant_id() and p.provider = 'cash'
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

revoke execute on function public.waiter_cash_summary(timestamptz) from public, anon;
grant execute on function public.waiter_cash_summary(timestamptz) to authenticated;
