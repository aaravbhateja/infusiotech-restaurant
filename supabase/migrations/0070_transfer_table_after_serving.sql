-- Guests who have been served are still sitting at the table until the bill
-- is requested/paid (0059), so staff must be able to move them to another
-- table in that window. An order can be moved while it still holds its
-- table: any status except rejected/cancelled, and not yet released.
-- "Occupied" is now the same definition every screen uses.
create or replace function public.transfer_order_table(p_order_id uuid, p_to_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_status text;
  v_released timestamptz;
begin
  if not public.has_permission('tables.assign') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select tenant_id, order_status, table_released_at into v_tenant_id, v_order_status, v_released
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_tenant_id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if v_order_status in ('rejected', 'cancelled') or v_released is not null then
    raise exception 'order_already_closed' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.restaurant_tables where id = p_to_table_id and tenant_id = v_tenant_id) then
    raise exception 'table_not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders
    where table_id = p_to_table_id
      and tenant_id = v_tenant_id
      and order_status not in ('rejected', 'cancelled')
      and table_released_at is null
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
