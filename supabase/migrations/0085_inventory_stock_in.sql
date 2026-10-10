-- Quick stock-in (opening stock, or a purchase without a purchase order),
-- recorded at a cost so the weighted-average cost stays right.
create or replace function public.add_stock_with_cost(p_item uuid, p_qty numeric, p_unit_cost_minor numeric, p_note text default null, p_expiry date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 or p_unit_cost_minor is null or p_unit_cost_minor < 0 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select tenant_id into v_tenant from public.inventory_items where id = p_item;
  if v_tenant is distinct from public.current_tenant_id() then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  perform public.inventory_move(p_item, p_qty, 'purchase', p_unit_cost_minor, coalesce(nullif(trim(p_note), ''), 'Stock in'), null, null, p_expiry);
end;
$$;
revoke execute on function public.add_stock_with_cost(uuid, numeric, numeric, text, date) from public, anon;
grant execute on function public.add_stock_with_cost(uuid, numeric, numeric, text, date) to authenticated;
