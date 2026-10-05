-- Kitchen and Waiter shared one coarse permission (orders.status.update)
-- for every post-accept transition, so a Waiter could technically mark an
-- order "preparing"/"ready" and Kitchen Staff could mark it "served" — the
-- Owner wants the kitchen to own preparing/ready and the waiter to own only
-- serving. Split into two scoped permissions; Owner/Manager keep the broad
-- one so they can still do everything.
insert into public.permissions (key, description) values
  ('orders.prepare', 'Move an order through preparing/ready (kitchen)'),
  ('orders.serve', 'Mark a ready order as served (waiter)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000005', id from public.permissions where key = 'orders.prepare'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000003', id from public.permissions where key = 'orders.serve'
on conflict do nothing;

-- Narrow their defaults to exactly this: Kitchen Staff no longer gets the
-- broad permission (it would otherwise let them also mark orders served),
-- and Waiter no longer gets it either (it would let them skip the kitchen).
delete from public.role_permissions
where role_id = '00000000-0000-0000-0000-000000000005' -- Kitchen Staff
  and permission_id = (select id from public.permissions where key = 'orders.status.update');

delete from public.role_permissions
where role_id = '00000000-0000-0000-0000-000000000003' -- Waiter
  and permission_id = (select id from public.permissions where key = 'orders.status.update');

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
  v_table_label text;
begin
  select id, tenant_id, order_status, order_number, table_id into v_order
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
    v_required_permission := 'orders.prepare';
  elsif p_new_status = 'ready' and v_order.order_status = 'preparing' then
    v_valid_transition := true;
    v_required_permission := 'orders.prepare';
  elsif p_new_status = 'served' and v_order.order_status = 'ready' then
    v_valid_transition := true;
    v_required_permission := 'orders.serve';
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

  if not (public.has_permission(v_required_permission) or public.has_permission('orders.status.update')) then
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

  -- Waiters only see this via the tenant-wide notification feed (there's no
  -- per-table waiter assignment), same as every other notification here.
  if p_new_status = 'ready' and v_order.table_id is not null then
    select label into v_table_label from public.restaurant_tables where id = v_order.table_id;
    insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id)
    values (
      v_order.tenant_id, 'orders', 'bell',
      coalesce(v_table_label, 'Order') || ' is ready',
      'Order #' || v_order.order_number || ' is ready for pickup.',
      'orders', p_order_id
    );
  end if;

  return jsonb_build_object('order_id', p_order_id, 'order_status', p_new_status);
end;
$$;
