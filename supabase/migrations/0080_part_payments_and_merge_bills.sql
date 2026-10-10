-- Split / partial payments and merging bills.
--
-- An order can now be paid in several parts (split between guests, or cash +
-- UPI). orders.amount_paid_minor tracks what has been collected; the order
-- flips to paid the moment the parts cover the total, and stays "unpaid"
-- (with a balance) until then.

alter table public.orders add column amount_paid_minor bigint not null default 0;
alter table public.orders add column merged_into uuid references public.orders (id);

-- Everything already paid has been paid in full.
update public.orders set amount_paid_minor = total_minor
where payment_status in ('paid', 'cash_received', 'reconciled');

-- If voiding or editing makes the total fall to what was already collected,
-- the order is settled automatically. Named to run before orders_table_release.
create or replace function public.trg_order_settle_when_covered()
returns trigger
language plpgsql
as $$
begin
  if new.payment_status in ('unpaid', 'pending') and new.amount_paid_minor > 0
     and new.amount_paid_minor >= new.total_minor then
    new.payment_status := 'cash_received';
  end if;
  return new;
end;
$$;

create trigger orders_settle_when_covered
  before update on public.orders
  for each row execute function public.trg_order_settle_when_covered();

create or replace function public.record_payment_amount(p_order_id uuid, p_method text, p_amount_minor bigint default null)
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
  v_remaining bigint;
  v_amount bigint;
  v_status text;
begin
  if p_method not in ('cash', 'upi', 'card') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;

  select id, tenant_id, total_minor, currency, payment_status, order_status, amount_paid_minor into v_order
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id()
  for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not v_is_cashier then
    if not public.has_permission('payments.cash.collect') then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;
    if v_order.order_status <> 'served' then
      raise exception 'order_not_served' using errcode = 'P0001';
    end if;
  end if;

  if v_order.payment_status not in ('unpaid', 'pending') then
    raise exception 'invalid_payment_state' using errcode = 'P0001';
  end if;

  v_remaining := v_order.total_minor - v_order.amount_paid_minor;
  v_amount := coalesce(p_amount_minor, v_remaining);
  if v_amount <= 0 or v_amount > v_remaining then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, verified_at, collected_by, via_waiter)
  values (v_order.tenant_id, p_order_id, 'cash', p_method, v_amount, v_order.currency, 'cash_received', now(), v_me, not v_is_cashier)
  returning id into v_payment_id;

  -- The settle trigger flips payment_status once the parts cover the total.
  update public.orders set amount_paid_minor = amount_paid_minor + v_amount where id = p_order_id
  returning payment_status into v_status;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_order.tenant_id, auth.uid(), 'payment.cash_recorded', 'payments', v_payment_id);

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_status,
    'paid_minor', v_order.amount_paid_minor + v_amount,
    'remaining_minor', v_remaining - v_amount
  );
end;
$$;

revoke execute on function public.record_payment_amount(uuid, text, bigint) from public, anon;
grant execute on function public.record_payment_amount(uuid, text, bigint) to authenticated;

-- The existing one-tap "pay in full" now pays whatever is still due.
create or replace function public.record_cash_payment(p_order_id uuid, p_method text default 'cash')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_payment_amount(p_order_id, p_method, null);
end;
$$;
grant execute on function public.record_cash_payment(uuid, text) to authenticated;

-- A refund only marks the order refunded once nothing else is still held.
create or replace function public.apply_refund(p_payment_id uuid, p_amount_minor bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay record;
  v_refunded bigint;
  v_amount bigint;
begin
  select * into v_pay from public.payments where id = p_payment_id and tenant_id = public.current_tenant_id() for update;
  if v_pay.id is null then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if v_pay.status not in ('paid', 'cash_received', 'reconciled') then
    raise exception 'payment_not_refundable' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount_minor), 0) into v_refunded from public.refunds
  where payment_id = p_payment_id and status in ('pending', 'completed');
  v_amount := coalesce(p_amount_minor, v_pay.amount_minor - v_refunded);
  if v_amount <= 0 or v_amount > v_pay.amount_minor - v_refunded then
    raise exception 'invalid_refund_amount' using errcode = 'P0001';
  end if;

  insert into public.refunds (tenant_id, payment_id, amount_minor, reason, status)
  values (v_pay.tenant_id, p_payment_id, v_amount, p_reason,
          case when v_pay.provider = 'cash' then 'completed' else 'pending' end);

  if v_refunded + v_amount >= v_pay.amount_minor then
    update public.payments set status = 'refunded' where id = p_payment_id;
    if not exists (
      select 1 from public.payments
      where order_id = v_pay.order_id and id <> p_payment_id and status in ('paid', 'cash_received', 'reconciled')
    ) then
      update public.orders set payment_status = 'refunded' where id = v_pay.order_id;
    end if;
  end if;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (v_pay.tenant_id, auth.uid(), 'payment.refunded', 'payments', p_payment_id,
          jsonb_build_object('amount_minor', v_amount, 'reason', p_reason));
end;
$$;
revoke execute on function public.apply_refund(uuid, bigint, text) from public, anon, authenticated;

-- A merged-away order is cancelled with this reason; don't announce it.
create or replace function public.trg_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  if new.order_status = 'cancelled' and old.order_status <> 'cancelled' then
    if coalesce(new.cancel_reason, '') not like 'Merged into%' then
      perform public.notify(new.tenant_id, 'orders', 'x', 'Order #' || new.order_number || ' cancelled', new.cancel_reason, 'orders', new.id);
    end if;
  elsif new.order_status = 'rejected' and old.order_status <> 'rejected' then
    perform public.notify(new.tenant_id, 'orders', 'x', 'Order #' || new.order_number || ' rejected', new.cancel_reason, 'orders', new.id);
  elsif new.order_status = 'accepted' and old.order_status = 'new' then
    select label into v_table from public.restaurant_tables where id = new.table_id;
    perform public.notify(new.tenant_id, 'orders', 'flame', 'Order to prepare · #' || new.order_number, coalesce(v_table, 'Takeaway'), 'orders', new.id);
  end if;
  return new;
end;
$$;

-- Merge two served, unpaid bills into one (e.g. two tables that sat together
-- and now want a single bill). Items move to the target order; the source is
-- closed as "Merged into #target" and its table is freed.
create or replace function public.merge_orders(p_target_id uuid, p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_t record;
  v_s record;
begin
  if not public.has_permission('tables.assign') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_target_id = p_source_id then
    raise exception 'same_order' using errcode = 'P0001';
  end if;

  select * into v_t from public.orders where id = p_target_id and tenant_id = v_tenant for update;
  select * into v_s from public.orders where id = p_source_id and tenant_id = v_tenant for update;
  if v_t.id is null or v_s.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_t.order_status <> 'served' or v_s.order_status <> 'served'
     or v_t.table_released_at is not null or v_s.table_released_at is not null then
    raise exception 'orders_not_mergeable' using errcode = 'P0001';
  end if;
  if v_t.payment_status not in ('unpaid', 'pending') or v_s.payment_status not in ('unpaid', 'pending')
     or v_s.amount_paid_minor > 0 then
    raise exception 'orders_not_mergeable' using errcode = 'P0001';
  end if;

  update public.order_items set order_id = p_target_id, round = v_t.current_round where order_id = p_source_id;

  update public.orders
  set order_status = 'cancelled', cancel_reason = 'Merged into #' || v_t.order_number,
      merged_into = p_target_id, table_released_at = now(),
      subtotal_minor = 0, tax_minor = 0, discount_minor = 0, total_minor = 0
  where id = p_source_id;

  -- Keep the larger discount on the combined bill; recompute totals.
  update public.orders set discount_minor = greatest(discount_minor, v_s.discount_minor) where id = p_target_id;
  perform public.recalc_order_totals(p_target_id);

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (v_tenant, auth.uid(), 'order.merged', 'orders', p_target_id, jsonb_build_object('source', p_source_id));

  return jsonb_build_object('order_id', p_target_id);
end;
$$;

revoke execute on function public.merge_orders(uuid, uuid) from public, anon;
grant execute on function public.merge_orders(uuid, uuid) to authenticated;
