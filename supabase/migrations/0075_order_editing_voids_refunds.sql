-- Phase 1: edit a live order (add items / void items) with a revised KOT for
-- the kitchen, manager approval for sensitive actions, and refunds.
--
--   orders.edit      add items to / request voids on an open order
--   orders.void      void an item directly (no approval needed)
--   payments.refund  refund a payment directly (no approval needed)
-- Staff with orders.edit / payments.cash.record but without the direct
-- permission raise an approval request; a manager approves or rejects it.

insert into public.permissions (key, description) values
  ('orders.edit', 'Add items to or request item voids on an open order'),
  ('orders.void', 'Void order items without needing approval'),
  ('payments.refund', 'Refund payments without needing approval')
on conflict (key) do nothing;

-- Backfill on every role by name (system templates and tenant clones alike,
-- same reason as 0064).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'orders.edit'
where r.name in ('Manager', 'Waiter') on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('orders.void', 'payments.refund')
where r.name = 'Manager' on conflict do nothing;

alter table public.order_items
  add column voided_at timestamptz,
  add column void_reason text,
  add column voided_by uuid references public.tenant_memberships (id),
  add column added_after_kot boolean not null default false;

alter table public.orders
  add column kot_revision smallint not null default 0,
  add column kot_revised_at timestamptz;

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('void_item', 'refund')),
  entity_id uuid not null,
  amount_minor bigint,
  reason text not null,
  summary text,
  requested_by uuid not null references public.tenant_memberships (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.tenant_memberships (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index approval_requests_tenant_idx on public.approval_requests (tenant_id, created_at desc);
alter table public.approval_requests enable row level security;

create policy approval_requests_read on public.approval_requests
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (requested_by = public.current_membership_id()
         or public.has_permission('orders.void') or public.has_permission('payments.refund'))
  );

alter publication supabase_realtime add table public.approval_requests;

-- Recompute totals from the live (non-voided) lines. The original discount
-- is kept but can never exceed the new subtotal.
create or replace function public.recalc_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_discount bigint;
  v_subtotal bigint;
  v_gst numeric;
  v_tax bigint;
begin
  select tenant_id, discount_minor into v_tenant, v_discount from public.orders where id = p_order_id;
  select coalesce(sum(line_total_minor), 0) into v_subtotal
  from public.order_items where order_id = p_order_id and voided_at is null;
  select gst_percent into v_gst from public.tenants where id = v_tenant;
  v_discount := least(coalesce(v_discount, 0), v_subtotal);
  v_tax := round((v_subtotal - v_discount) * (coalesce(v_gst, 0) / 100.0));
  update public.orders
  set subtotal_minor = v_subtotal, discount_minor = v_discount, tax_minor = v_tax,
      total_minor = v_subtotal - v_discount + v_tax
  where id = p_order_id;
end;
$$;
revoke execute on function public.recalc_order_totals(uuid) from public, anon, authenticated;

-- Add items to an open order. Before it is served the kitchen gets a revised
-- KOT (items flagged NEW); after it is served it becomes a new round, like a
-- guest ordering again.
create or replace function public.add_order_items(p_order_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item jsonb;
  v_mi record;
  v_variant record;
  v_addon record;
  v_variant_ids uuid[];
  v_addon_ids uuid[];
  v_qty int;
  v_unit bigint;
  v_vsnap jsonb;
  v_asnap jsonb;
  v_round smallint;
  v_after_kot boolean;
  v_label text;
  v_new_status text;
  v_auto boolean;
begin
  if not public.has_permission('orders.edit') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id() for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.order_status in ('rejected', 'cancelled') or v_order.payment_status not in ('unpaid', 'pending') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;
  if v_order.order_status = 'served' and v_order.table_released_at is not null then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;

  select coalesce((settings->>'auto_accept')::boolean, false) into v_auto from public.tenants where id = v_order.tenant_id;

  if v_order.order_status = 'served' then
    v_round := v_order.current_round + 1;
    v_after_kot := false;
    v_new_status := case when v_auto then 'accepted' else 'new' end;
  else
    v_round := v_order.current_round;
    v_after_kot := v_order.order_status in ('accepted', 'preparing', 'ready');
    v_new_status := case when v_order.order_status = 'ready' then 'preparing' else v_order.order_status end;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price_minor into v_mi from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and tenant_id = v_order.tenant_id and is_available = true;
    if v_mi.id is null then
      raise exception 'menu_item_unavailable: %', v_item->>'menu_item_id' using errcode = 'P0001';
    end if;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;
    v_unit := v_mi.price_minor;
    v_vsnap := '[]'::jsonb;
    v_asnap := '[]'::jsonb;

    select array(select jsonb_array_elements_text(coalesce(v_item->'variant_ids', '[]'::jsonb)))::uuid[] into v_variant_ids;
    for v_variant in
      select iv.id, iv.name, iv.price_delta_minor
      from public.item_variants iv join public.item_variant_groups g on g.id = iv.group_id
      where iv.id = any(v_variant_ids) and iv.tenant_id = v_order.tenant_id and g.menu_item_id = v_mi.id and iv.is_available
    loop
      v_unit := v_unit + v_variant.price_delta_minor;
      v_vsnap := v_vsnap || jsonb_build_object('id', v_variant.id, 'name', v_variant.name, 'price_delta_minor', v_variant.price_delta_minor);
    end loop;

    select array(select jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)))::uuid[] into v_addon_ids;
    for v_addon in
      select ia.id, ia.name, ia.price_delta_minor
      from public.item_addons ia join public.item_addon_groups g on g.id = ia.group_id
      where ia.id = any(v_addon_ids) and ia.tenant_id = v_order.tenant_id and g.menu_item_id = v_mi.id and ia.is_available
    loop
      v_unit := v_unit + v_addon.price_delta_minor;
      v_asnap := v_asnap || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price_delta_minor', v_addon.price_delta_minor);
    end loop;

    insert into public.order_items (
      tenant_id, order_id, menu_item_id, item_name_snapshot, variant_snapshot, addon_snapshot,
      unit_price_minor, quantity, tax_minor, line_total_minor, round, added_after_kot
    ) values (
      v_order.tenant_id, p_order_id, v_mi.id, v_mi.name, v_vsnap, v_asnap,
      v_unit, v_qty, 0, v_unit * v_qty, v_round, v_after_kot
    );
  end loop;

  perform public.recalc_order_totals(p_order_id);

  update public.orders
  set order_status = v_new_status, current_round = v_round,
      kot_revision = kot_revision + 1, kot_revised_at = now()
  where id = p_order_id;

  select label into v_label from public.restaurant_tables where id = v_order.table_id;
  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (v_order.tenant_id, 'orders', 'flame', 'Order revised · ' || coalesce(v_label, 'Takeaway'),
          'Order #' || v_order.order_number || ': items were added.', 'orders', p_order_id,
          array['Kitchen Staff', 'Waiter', 'Manager']);

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_order.tenant_id, auth.uid(), 'order.items_added', 'orders', p_order_id);

  return jsonb_build_object('order_id', p_order_id, 'order_status', v_new_status);
end;
$$;

-- The actual void, shared by the direct path and approval.
create or replace function public.apply_void_item(p_item_id uuid, p_reason text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_order record;
  v_left int;
  v_label text;
begin
  select * into v_item from public.order_items where id = p_item_id;
  if v_item.id is null or v_item.voided_at is not null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  if v_order.tenant_id <> public.current_tenant_id() then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if v_order.order_status in ('rejected', 'cancelled') or v_order.payment_status not in ('unpaid', 'pending') then
    raise exception 'order_not_editable' using errcode = 'P0001';
  end if;

  update public.order_items
  set voided_at = now(), void_reason = p_reason, voided_by = p_actor
  where id = p_item_id;

  perform public.recalc_order_totals(v_order.id);
  select count(*) into v_left from public.order_items where order_id = v_order.id and voided_at is null;

  if v_left = 0 and v_order.order_status <> 'served' then
    update public.orders set order_status = 'cancelled', cancel_reason = 'All items voided', table_released_at = now() where id = v_order.id;
  else
    update public.orders set kot_revision = kot_revision + 1, kot_revised_at = now() where id = v_order.id;
  end if;

  select label into v_label from public.restaurant_tables where id = v_order.table_id;
  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (v_order.tenant_id, 'orders', 'x', 'Order revised · ' || coalesce(v_label, 'Takeaway'),
          'Order #' || v_order.order_number || ': ' || v_item.quantity || '× ' || v_item.item_name_snapshot || ' cancelled (' || p_reason || ').',
          'orders', v_order.id, array['Kitchen Staff', 'Waiter', 'Manager']);

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (v_order.tenant_id, auth.uid(), 'order.item_voided', 'order_items', p_item_id, jsonb_build_object('reason', p_reason));
end;
$$;
revoke execute on function public.apply_void_item(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.void_order_item(p_item_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_membership_id();
  v_item record;
  v_order_number text;
  v_id uuid;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select oi.*, o.order_number into v_item from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_item_id and oi.tenant_id = public.current_tenant_id();
  if v_item.id is null or v_item.voided_at is not null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  if public.has_permission('orders.void') then
    perform public.apply_void_item(p_item_id, trim(p_reason), v_me);
    return jsonb_build_object('status', 'voided');
  end if;

  if not public.has_permission('orders.edit') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.approval_requests where entity_id = p_item_id and kind = 'void_item' and status = 'pending') then
    raise exception 'request_already_pending' using errcode = 'P0001';
  end if;

  insert into public.approval_requests (tenant_id, kind, entity_id, reason, summary, requested_by)
  values (public.current_tenant_id(), 'void_item', p_item_id, trim(p_reason),
          'Order #' || v_item.order_number || ': void ' || v_item.quantity || '× ' || v_item.item_name_snapshot, v_me)
  returning id into v_id;

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (public.current_tenant_id(), 'orders', 'percent', 'Approval needed · void item',
          'Order #' || v_item.order_number || ': ' || trim(p_reason), 'approval_requests', v_id, array['Manager']);

  return jsonb_build_object('status', 'pending_approval', 'request_id', v_id);
end;
$$;

-- Refund execution, shared by the direct path and approval.
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

  -- Cash/UPI/card taken at the counter is handed back by staff, so it is
  -- recorded as done. A gateway payment stays pending until it is actually
  -- refunded through the payment provider.
  insert into public.refunds (tenant_id, payment_id, amount_minor, reason, status)
  values (v_pay.tenant_id, p_payment_id, v_amount, p_reason,
          case when v_pay.provider = 'cash' then 'completed' else 'pending' end);

  if v_refunded + v_amount >= v_pay.amount_minor then
    update public.payments set status = 'refunded' where id = p_payment_id;
    update public.orders set payment_status = 'refunded' where id = v_pay.order_id;
  end if;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (v_pay.tenant_id, auth.uid(), 'payment.refunded', 'payments', p_payment_id,
          jsonb_build_object('amount_minor', v_amount, 'reason', p_reason));
end;
$$;
revoke execute on function public.apply_refund(uuid, bigint, text) from public, anon, authenticated;

create or replace function public.refund_payment(p_payment_id uuid, p_amount_minor bigint default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay record;
  v_id uuid;
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select p.*, o.order_number into v_pay from public.payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id and p.tenant_id = public.current_tenant_id();
  if v_pay.id is null then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;

  if public.has_permission('payments.refund') then
    perform public.apply_refund(p_payment_id, p_amount_minor, trim(p_reason));
    return jsonb_build_object('status', 'refunded');
  end if;

  if not public.has_permission('payments.cash.record') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  insert into public.approval_requests (tenant_id, kind, entity_id, amount_minor, reason, summary, requested_by)
  values (public.current_tenant_id(), 'refund', p_payment_id, p_amount_minor, trim(p_reason),
          'Order #' || v_pay.order_number || ': refund ' || coalesce((p_amount_minor / 100.0)::numeric(12,2)::text, 'full amount'),
          public.current_membership_id())
  returning id into v_id;

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (public.current_tenant_id(), 'payments', 'rupee', 'Approval needed · refund',
          'Order #' || v_pay.order_number || ': ' || trim(p_reason), 'approval_requests', v_id, array['Manager']);
  return jsonb_build_object('status', 'pending_approval', 'request_id', v_id);
end;
$$;

create or replace function public.review_approval_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
begin
  select * into v_req from public.approval_requests
  where id = p_request_id and tenant_id = public.current_tenant_id() for update;
  if v_req.id is null then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;
  if (v_req.kind = 'void_item' and not public.has_permission('orders.void'))
     or (v_req.kind = 'refund' and not public.has_permission('payments.refund')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_req.kind = 'void_item' then
      perform public.apply_void_item(v_req.entity_id, v_req.reason, v_req.requested_by);
    else
      perform public.apply_refund(v_req.entity_id, v_req.amount_minor, v_req.reason);
    end if;
  end if;

  update public.approval_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = public.current_membership_id(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_request_id;

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (public.current_tenant_id(), 'orders', 'bell',
          'Request ' || case when p_approve then 'approved' else 'rejected' end || ' · ' || v_req.kind,
          v_req.summary, 'approval_requests', p_request_id, array['Waiter', 'Cashier', 'Manager']);
end;
$$;

revoke execute on function public.add_order_items(uuid, jsonb) from public, anon;
revoke execute on function public.void_order_item(uuid, text) from public, anon;
revoke execute on function public.refund_payment(uuid, bigint, text) from public, anon;
revoke execute on function public.review_approval_request(uuid, boolean, text) from public, anon;
grant execute on function public.add_order_items(uuid, jsonb) to authenticated;
grant execute on function public.void_order_item(uuid, text) to authenticated;
grant execute on function public.refund_payment(uuid, bigint, text) to authenticated;
grant execute on function public.review_approval_request(uuid, boolean, text) to authenticated;
