-- "Transfer" on the table detail screen had no handler wired up at all.
-- A table's occupied/free state is derived purely from whether it has an
-- active order (see the client's FLOOR_TO_STATUS mapping — floor_state only
-- ever holds available/reserved/cleaning), so moving an order's table_id is
-- the entire operation: the old table reads free again and the new one
-- reads occupied on the next load, with no separate state to reconcile.
create or replace function public.transfer_order_table(p_order_id uuid, p_to_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_status text;
begin
  if not public.has_permission('tables.assign') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select tenant_id, order_status into v_tenant_id, v_order_status
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_tenant_id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if v_order_status in ('served', 'rejected', 'cancelled') then
    raise exception 'order_already_closed' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.restaurant_tables where id = p_to_table_id and tenant_id = v_tenant_id) then
    raise exception 'table_not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_to_table_id
      and tenant_id = v_tenant_id
      and order_status not in ('served', 'rejected', 'cancelled')
  ) then
    raise exception 'destination_table_occupied' using errcode = 'P0001';
  end if;

  update public.orders set table_id = p_to_table_id where id = p_order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_tenant_id, auth.uid(), 'order.table_transfer', 'orders', p_order_id);
end;
$$;

revoke execute on function public.transfer_order_table(uuid, uuid) from public, anon;
grant execute on function public.transfer_order_table(uuid, uuid) to authenticated;
