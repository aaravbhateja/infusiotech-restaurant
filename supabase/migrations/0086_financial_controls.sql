-- Owner financial controls: expenses, profit & loss estimate, payment-mode
-- reconciliation, loss prevention (discounts / voids / refunds / reprints),
-- staff activity, and a scheduled daily summary.

insert into public.permissions (key, description) values
  ('expenses.manage', 'Record and edit expenses'),
  ('reports.financial.view', 'View profit & loss, reconciliation and loss-prevention reports')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('expenses.manage', 'reports.financial.view')
where r.name = 'Manager' on conflict do nothing;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category text not null check (category in ('rent', 'salary', 'utilities', 'raw_material', 'marketing', 'maintenance', 'delivery', 'other')),
  amount_minor bigint not null check (amount_minor > 0),
  expense_date date not null default current_date,
  paid_via text not null default 'cash' check (paid_via in ('cash', 'upi', 'card', 'bank')),
  note text,
  created_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now()
);
create index expenses_tenant_date_idx on public.expenses (tenant_id, expense_date desc);
alter table public.expenses enable row level security;

create policy expenses_read on public.expenses for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('reports.financial.view'));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('expenses.manage') and created_by = public.current_membership_id());
create policy expenses_update on public.expenses for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('expenses.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('expenses.manage'));
create policy expenses_delete on public.expenses for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('expenses.manage'));

-- Profit & loss (an ESTIMATE: sales net of GST and discounts, less the cost of
-- food actually used and recorded expenses). Dates are restaurant-local.
create or replace function public.profit_loss(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_from timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
  v_gross bigint; v_disc bigint; v_tax bigint; v_orders int; v_refunds bigint; v_cogs numeric; v_exp bigint;
begin
  if not public.has_permission('reports.financial.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select coalesce(sum(subtotal_minor), 0), coalesce(sum(discount_minor), 0), coalesce(sum(tax_minor), 0), count(*)
  into v_gross, v_disc, v_tax, v_orders
  from public.orders
  where tenant_id = v_tenant and created_at >= v_from and created_at < v_to
    and order_status not in ('rejected', 'cancelled') and payment_status in ('paid', 'cash_received', 'reconciled');

  select coalesce(sum(r.amount_minor), 0) into v_refunds
  from public.refunds r where r.tenant_id = v_tenant and r.created_at >= v_from and r.created_at < v_to and r.status in ('pending', 'completed');

  select coalesce(sum(-qty_delta * unit_cost_minor), 0) into v_cogs from public.stock_movements
  where tenant_id = v_tenant and kind in ('sale', 'sale_reversal') and created_at >= v_from and created_at < v_to;

  select coalesce(sum(amount_minor), 0) into v_exp from public.expenses
  where tenant_id = v_tenant and expense_date between p_from and p_to;

  return jsonb_build_object(
    'orders', v_orders,
    'gross_sales_minor', v_gross,
    'discounts_minor', v_disc,
    'refunds_minor', v_refunds,
    'net_sales_minor', v_gross - v_disc - v_refunds,
    'gst_collected_minor', v_tax,
    'cogs_minor', round(v_cogs),
    'gross_profit_minor', v_gross - v_disc - v_refunds - round(v_cogs),
    'expenses_minor', v_exp,
    'operating_profit_minor', v_gross - v_disc - v_refunds - round(v_cogs) - v_exp,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'amount_minor', total) order by total desc)
      from (select category, sum(amount_minor) as total from public.expenses
            where tenant_id = v_tenant and expense_date between p_from and p_to group by category) e), '[]'::jsonb)
  );
end;
$$;

-- Money in by payment mode, and anything that does not add up.
create or replace function public.payment_reconciliation(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_from timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
begin
  if not public.has_permission('reports.financial.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'by_mode', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'count', n, 'amount_minor', total) order by total desc)
      from (select case when p.provider = 'razorpay' then 'online' else coalesce(p.method, 'cash') end as mode,
                   count(*) as n, sum(p.amount_minor) as total
            from public.payments p
            where p.tenant_id = v_tenant and p.created_at >= v_from and p.created_at < v_to
              and p.status in ('paid', 'cash_received', 'reconciled')
            group by 1) m), '[]'::jsonb),
    'refunded_minor', (select coalesce(sum(amount_minor), 0) from public.refunds where tenant_id = v_tenant and created_at >= v_from and created_at < v_to and status in ('pending', 'completed')),
    'pending_refunds', (select count(*) from public.refunds where tenant_id = v_tenant and status = 'pending'),
    'cash_with_waiters_minor', (select coalesce(sum(amount_minor), 0) from public.payments where tenant_id = v_tenant and via_waiter and method = 'cash' and handover_id is null and status = 'cash_received'),
    'handovers_pending', (select count(*) from public.cash_handovers where tenant_id = v_tenant and status = 'pending'),
    'handover_shortage_minor', (select coalesce(sum(amount_minor - received_amount_minor), 0) from public.cash_handovers where tenant_id = v_tenant and status = 'confirmed' and submitted_at >= v_from and submitted_at < v_to),
    'unreconciled_gateway', (select count(*) from public.payments where tenant_id = v_tenant and provider = 'razorpay' and status = 'paid' and created_at >= v_from and created_at < v_to),
    'paid_orders_without_payment', (
      select count(*) from public.orders o
      where o.tenant_id = v_tenant and o.created_at >= v_from and o.created_at < v_to
        and o.payment_status in ('paid', 'cash_received', 'reconciled')
        and not exists (select 1 from public.payments p where p.order_id = o.id)),
    'orders_total_vs_payments_mismatch', (
      select count(*) from public.orders o
      where o.tenant_id = v_tenant and o.created_at >= v_from and o.created_at < v_to
        and o.payment_status in ('paid', 'cash_received', 'reconciled') and o.order_status not in ('cancelled', 'rejected')
        and (select coalesce(sum(p.amount_minor), 0) from public.payments p where p.order_id = o.id and p.status in ('paid', 'cash_received', 'reconciled', 'refunded')) <> o.total_minor)
  );
end;
$$;

-- Discounts, voids, refunds, cancellations, reprints: who and how much.
create or replace function public.loss_prevention(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_from timestamptz := (p_from::timestamp at time zone 'Asia/Kolkata');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Kolkata');
begin
  if not public.has_permission('reports.financial.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'discount_total_minor', (select coalesce(sum(discount_minor), 0) from public.orders where tenant_id = v_tenant and created_at >= v_from and created_at < v_to and order_status not in ('rejected', 'cancelled')),
    'discount_orders', (select count(*) from public.orders where tenant_id = v_tenant and created_at >= v_from and created_at < v_to and discount_minor > 0 and order_status not in ('rejected', 'cancelled')),
    'manual_discount_requests', (select count(*) from public.discount_requests where tenant_id = v_tenant and created_at >= v_from and created_at < v_to),
    'manual_discounts_approved_minor', (select coalesce(sum(amount_minor), 0) from public.discount_requests where tenant_id = v_tenant and status = 'approved' and created_at >= v_from and created_at < v_to),
    'voided_items', (select count(*) from public.order_items where tenant_id = v_tenant and voided_at >= v_from and voided_at < v_to),
    'voided_value_minor', (select coalesce(sum(line_total_minor), 0) from public.order_items where tenant_id = v_tenant and voided_at >= v_from and voided_at < v_to),
    'refunds_count', (select count(*) from public.refunds where tenant_id = v_tenant and created_at >= v_from and created_at < v_to),
    'refunds_minor', (select coalesce(sum(amount_minor), 0) from public.refunds where tenant_id = v_tenant and created_at >= v_from and created_at < v_to),
    'cancelled_orders', (select count(*) from public.orders where tenant_id = v_tenant and created_at >= v_from and created_at < v_to and order_status = 'cancelled' and coalesce(cancel_reason, '') not like 'Merged%'),
    'rejected_orders', (select count(*) from public.orders where tenant_id = v_tenant and created_at >= v_from and created_at < v_to and order_status = 'rejected'),
    'bill_reprints', (select count(*) from public.audit_events where tenant_id = v_tenant and action = 'bill.reprinted' and created_at >= v_from and created_at < v_to),
    'voids_by_staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', n, 'count', c, 'value_minor', v) order by c desc)
      from (select coalesce(u.display_name, u.email, 'Staff') as n, count(*) as c, coalesce(sum(oi.line_total_minor), 0) as v
            from public.order_items oi
            left join public.tenant_memberships m on m.id = oi.voided_by
            left join public.users u on u.id = m.user_id
            where oi.tenant_id = v_tenant and oi.voided_at >= v_from and oi.voided_at < v_to
            group by 1 order by c desc limit 8) x), '[]'::jsonb),
    'top_void_reasons', coalesce((
      select jsonb_agg(jsonb_build_object('reason', r, 'count', c) order by c desc)
      from (select lower(void_reason) as r, count(*) as c from public.order_items
            where tenant_id = v_tenant and voided_at >= v_from and voided_at < v_to group by 1 order by c desc limit 5) x), '[]'::jsonb)
  );
end;
$$;

-- Staff activity: orders served, cash collected, and what sensitive actions
-- each person performed.
create or replace function public.staff_activity(p_from date, p_to date)
returns table (name text, role text, orders_served bigint, collected_minor bigint, voids bigint, refunds bigint, reprints bigint, actions bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(u.display_name, u.email, 'Staff'), r.name,
         (select count(*) from public.orders o where o.served_by = m.id and o.served_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and o.served_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')),
         (select coalesce(sum(p.amount_minor), 0) from public.payments p where p.collected_by = m.id and p.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and p.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata') and p.status in ('paid', 'cash_received', 'reconciled')),
         (select count(*) from public.audit_events a where a.actor_user_id = m.user_id and a.tenant_id = m.tenant_id and a.action = 'order.item_voided' and a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')),
         (select count(*) from public.audit_events a where a.actor_user_id = m.user_id and a.tenant_id = m.tenant_id and a.action = 'payment.refunded' and a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')),
         (select count(*) from public.audit_events a where a.actor_user_id = m.user_id and a.tenant_id = m.tenant_id and a.action = 'bill.reprinted' and a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')),
         (select count(*) from public.audit_events a where a.actor_user_id = m.user_id and a.tenant_id = m.tenant_id and a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata') and a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
  from public.tenant_memberships m
  join public.users u on u.id = m.user_id
  join public.roles r on r.id = m.role_id
  where m.tenant_id = public.current_tenant_id() and m.status = 'active' and public.has_permission('reports.financial.view')
  order by 8 desc;
$$;

revoke execute on function public.profit_loss(date, date) from public, anon;
revoke execute on function public.payment_reconciliation(date, date) from public, anon;
revoke execute on function public.loss_prevention(date, date) from public, anon;
revoke execute on function public.staff_activity(date, date) from public, anon;
grant execute on function public.profit_loss(date, date) to authenticated;
grant execute on function public.payment_reconciliation(date, date) to authenticated;
grant execute on function public.loss_prevention(date, date) to authenticated;
grant execute on function public.staff_activity(date, date) to authenticated;

-- Daily summary notification, 23:00 India time (17:30 UTC), to Owner/Manager.
create or replace function public.send_daily_summaries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_sales bigint; v_n int; v_cash bigint; v_digital bigint; v_top text; v_count integer := 0;
  v_from timestamptz := (((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata');
  v_to timestamptz := v_from + interval '1 day';
begin
  for t in select id, name from public.tenants where status = 'active'
  loop
    select coalesce(sum(total_minor), 0), count(*) into v_sales, v_n from public.orders
    where tenant_id = t.id and created_at >= v_from and created_at < v_to
      and order_status not in ('rejected', 'cancelled') and payment_status in ('paid', 'cash_received', 'reconciled');
    continue when v_n = 0;

    select coalesce(sum(amount_minor) filter (where provider = 'cash' and coalesce(method, 'cash') = 'cash'), 0),
           coalesce(sum(amount_minor) filter (where not (provider = 'cash' and coalesce(method, 'cash') = 'cash')), 0)
    into v_cash, v_digital from public.payments
    where tenant_id = t.id and created_at >= v_from and created_at < v_to and status in ('paid', 'cash_received', 'reconciled');

    select oi.item_name_snapshot into v_top from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.tenant_id = t.id and o.created_at >= v_from and o.created_at < v_to and oi.voided_at is null
    group by oi.item_name_snapshot order by sum(oi.quantity) desc limit 1;

    insert into public.notifications (tenant_id, category, icon, title, body, audience_roles)
    values (t.id, 'system', 'chart', 'Today · ₹' || to_char(v_sales / 100.0, 'FM99,99,99,990') || ' from ' || v_n || ' orders',
            'Cash ₹' || to_char(v_cash / 100.0, 'FM99,99,99,990') || ' · Digital ₹' || to_char(v_digital / 100.0, 'FM99,99,99,990')
            || coalesce(' · Best seller: ' || v_top, ''), array['Manager']);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.send_daily_summaries() from public, anon, authenticated;
select cron.schedule('daily-summary', '30 17 * * *', $$select public.send_daily_summaries()$$);
