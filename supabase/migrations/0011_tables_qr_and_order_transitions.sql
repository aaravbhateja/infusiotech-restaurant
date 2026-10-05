-- Table + QR creation (raw token generated/hashed server-side, same pattern
-- as staff invitations) and a validated order-status state machine.

create or replace function public.create_table_with_qr(
  p_tenant_id uuid,
  p_label text,
  p_capacity int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_table_id uuid;
  v_raw_token text;
  v_token_hash text;
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('tables.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.restaurant_tables (tenant_id, label, capacity)
  values (p_tenant_id, p_label, p_capacity)
  returning id into v_table_id;

  v_raw_token := encode(gen_random_bytes(18), 'base64');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  insert into public.qr_assets (tenant_id, table_id, public_token_hash, asset_type)
  values (p_tenant_id, v_table_id, v_token_hash, 'qr');

  return jsonb_build_object('table_id', v_table_id, 'raw_token', v_raw_token);
end;
$$;

revoke execute on function public.create_table_with_qr(uuid, text, int) from public, anon;
grant execute on function public.create_table_with_qr(uuid, text, int) to authenticated;

comment on function public.create_table_with_qr(uuid, text, int) is
  'Creates a table and its QR asset together, returning the one-time raw token to encode into the printed QR URL (?t=<raw_token>). The token is never stored — only its hash.';

-- Reissue a QR code for an existing table (old one stops working immediately).
create or replace function public.reissue_table_qr(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant_id uuid;
  v_raw_token text;
  v_token_hash text;
begin
  select tenant_id into v_tenant_id from public.restaurant_tables where id = p_table_id;

  if v_tenant_id is null or v_tenant_id <> public.current_tenant_id()
     or not public.has_permission('tables.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update public.qr_assets set status = 'revoked'
  where table_id = p_table_id and status = 'active';

  v_raw_token := encode(gen_random_bytes(18), 'base64');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  insert into public.qr_assets (tenant_id, table_id, public_token_hash, asset_type)
  values (v_tenant_id, p_table_id, v_token_hash, 'qr');

  return jsonb_build_object('raw_token', v_raw_token);
end;
$$;

revoke execute on function public.reissue_table_qr(uuid) from public, anon;
grant execute on function public.reissue_table_qr(uuid) to authenticated;

-- Validated order-status state machine. RLS (orders_update) only confirms
-- the caller holds *some* order permission; this function is where the
-- actual transition legality + the specific permission per transition is
-- enforced, per the PRD's "New -> Accepted -> Preparing -> Ready -> Served,
-- or rejected/cancelled with a reason" lifecycle.
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_required_permission text;
  v_valid_transition boolean := false;
begin
  select id, tenant_id, order_status into v_order
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if p_new_status = 'accepted' and v_order.order_status = 'new' then
    v_valid_transition := true;
    v_required_permission := 'orders.accept';
  elsif p_new_status = 'preparing' and v_order.order_status = 'accepted' then
    v_valid_transition := true;
    v_required_permission := 'orders.status.update';
  elsif p_new_status = 'ready' and v_order.order_status = 'preparing' then
    v_valid_transition := true;
    v_required_permission := 'orders.status.update';
  elsif p_new_status = 'served' and v_order.order_status = 'ready' then
    v_valid_transition := true;
    v_required_permission := 'orders.status.update';
  elsif p_new_status = 'rejected' and v_order.order_status = 'new' then
    v_valid_transition := true;
    v_required_permission := 'orders.reject';
  elsif p_new_status = 'cancelled' and v_order.order_status in ('new', 'accepted', 'preparing') then
    v_valid_transition := true;
    v_required_permission := 'orders.cancel';
  end if;

  if not v_valid_transition then
    raise exception 'invalid_transition: % -> %', v_order.order_status, p_new_status using errcode = 'P0001';
  end if;

  if not public.has_permission(v_required_permission) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_new_status in ('rejected', 'cancelled') and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.orders
  set order_status = p_new_status,
      cancel_reason = case when p_new_status in ('rejected', 'cancelled') then p_reason else cancel_reason end
  where id = p_order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, before_summary, after_summary)
  values (
    v_order.tenant_id, auth.uid(), 'order.transition', 'orders', p_order_id,
    jsonb_build_object('order_status', v_order.order_status),
    jsonb_build_object('order_status', p_new_status, 'reason', p_reason)
  );

  return jsonb_build_object('order_id', p_order_id, 'order_status', p_new_status);
end;
$$;

revoke execute on function public.transition_order_status(uuid, text, text) from public, anon;
grant execute on function public.transition_order_status(uuid, text, text) to authenticated;

comment on function public.transition_order_status(uuid, text, text) is
  'The only sanctioned way to change order_status: validates the transition is legal from the current state, requires the specific permission for that transition (not just "some" order permission), and requires a reason for reject/cancel.';

-- Cash recording and reconciliation: narrow RPCs instead of a general
-- payments UPDATE policy, so a Cashier can flip status but not edit amount
-- or provider_reference.
create or replace function public.record_cash_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_payment_id uuid;
begin
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

  insert into public.payments (tenant_id, order_id, provider, amount_minor, currency, status, verified_at)
  values (v_order.tenant_id, p_order_id, 'cash', v_order.total_minor, v_order.currency, 'cash_received', now())
  returning id into v_payment_id;

  update public.orders set payment_status = 'cash_received' where id = p_order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_order.tenant_id, auth.uid(), 'payment.cash_recorded', 'payments', v_payment_id);

  return jsonb_build_object('payment_id', v_payment_id, 'payment_status', 'cash_received');
end;
$$;

revoke execute on function public.record_cash_payment(uuid) from public, anon;
grant execute on function public.record_cash_payment(uuid) to authenticated;

create or replace function public.reconcile_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
begin
  select id, tenant_id, order_id, status into v_payment
  from public.payments
  where id = p_payment_id and tenant_id = public.current_tenant_id();

  if v_payment.id is null then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;

  if not public.has_permission('payments.reconcile') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_payment.status <> 'cash_received' then
    raise exception 'invalid_payment_state' using errcode = 'P0001';
  end if;

  update public.payments set status = 'reconciled' where id = p_payment_id;
  update public.orders set payment_status = 'reconciled' where id = v_payment.order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_payment.tenant_id, auth.uid(), 'payment.reconciled', 'payments', p_payment_id);

  return jsonb_build_object('payment_id', p_payment_id, 'payment_status', 'reconciled');
end;
$$;

revoke execute on function public.reconcile_payment(uuid) from public, anon;
grant execute on function public.reconcile_payment(uuid) to authenticated;
