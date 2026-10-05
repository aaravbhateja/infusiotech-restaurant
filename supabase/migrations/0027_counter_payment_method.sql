-- The cashier previously had one "Collect cash" button regardless of how
-- the guest actually paid at the counter (cash, UPI, or a card machine) —
-- every counter payment was recorded as provider='cash' even when it
-- plainly wasn't. Staff now pick the real method, so the payments ledger
-- reflects what was actually collected.

create or replace function public.record_cash_payment(p_order_id uuid, p_method text default 'cash')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_payment_id uuid;
begin
  if p_method not in ('cash', 'upi', 'card') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;

  select id, tenant_id, total_minor, currency, payment_status into v_order
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not public.has_permission('payments.cash.record') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_order.payment_status not in ('unpaid', 'pending') then
    raise exception 'invalid_payment_state' using errcode = 'P0001';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, verified_at)
  values (v_order.tenant_id, p_order_id, 'cash', p_method, v_order.total_minor, v_order.currency, 'cash_received', now())
  returning id into v_payment_id;

  update public.orders set payment_status = 'cash_received' where id = p_order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_order.tenant_id, auth.uid(), 'payment.cash_recorded', 'payments', v_payment_id);

  return jsonb_build_object('payment_id', v_payment_id, 'payment_status', 'cash_received');
end;
$$;
