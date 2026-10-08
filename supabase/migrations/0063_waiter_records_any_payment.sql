-- Waiters record the payment when a guest taps "Call waiter for bill":
-- UPI, card or cash, for any served order (the guest's table may have been
-- served by a colleague). Only CASH is handed over to the cashier; UPI/card
-- go straight to the restaurant's account but are still attributed to the
-- waiter who recorded them.

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

  select id, tenant_id, total_minor, currency, payment_status, order_status into v_order
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

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

-- Hand over only the cash, never UPI/card.
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
    and collected_by = v_me and via_waiter and method = 'cash' and handover_id is null
    and status = 'cash_received';

  if v_total <= 0 then
    raise exception 'nothing_to_hand_over' using errcode = 'P0001';
  end if;

  insert into public.cash_handovers (tenant_id, waiter_membership_id, amount_minor, note)
  values (public.current_tenant_id(), v_me, v_total, nullif(trim(p_note), ''))
  returning id into v_id;

  update public.payments set handover_id = v_id
  where tenant_id = public.current_tenant_id()
    and collected_by = v_me and via_waiter and method = 'cash' and handover_id is null
    and status = 'cash_received';

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id)
  values (public.current_tenant_id(), 'payments', 'cash', 'Cash handover waiting',
          'A waiter submitted ' || (v_total / 100.0)::numeric(12,2) || ' for confirmation.', 'cash_handovers', v_id);

  return v_id;
end;
$$;

revoke execute on function public.submit_cash_handover(text) from public, anon;
grant execute on function public.submit_cash_handover(text) to authenticated;
