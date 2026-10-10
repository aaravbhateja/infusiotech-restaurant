-- Read/write helpers used only by the public-api edge function (service role).
-- Every one takes the tenant from the verified API key, never from the request.

create or replace function public.api_orders(p_tenant uuid, p_since timestamptz, p_status text, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.api_order_json(x.id) order by x.created_at), '[]'::jsonb)
  from (
    select o.id, o.created_at from public.orders o
    where o.tenant_id = p_tenant
      and (p_since is null or o.created_at >= p_since)
      and (p_status is null or o.order_status = p_status)
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

create or replace function public.api_order(p_tenant uuid, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.api_order_json(o.id) from public.orders o where o.id = p_id and o.tenant_id = p_tenant;
$$;

create or replace function public.api_payments(p_tenant uuid, p_since timestamptz, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'order_id', x.order_id, 'order_number', x.order_number, 'method', x.method,
    'amount_minor', x.amount_minor, 'currency', x.currency, 'status', x.status, 'created_at', x.created_at) order by x.created_at), '[]'::jsonb)
  from (
    select p.*, o.order_number from public.payments p join public.orders o on o.id = p.order_id
    where p.tenant_id = p_tenant and (p_since is null or p.created_at >= p_since)
    order by p.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

create or replace function public.api_menu(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mi.id, 'name', mi.name, 'category', c.name, 'description', mi.description,
    'price_minor', mi.price_minor, 'available', mi.is_available, 'veg_labels', mi.dietary_labels,
    'prep_minutes', mi.prep_minutes) order by c.sort_order, mi.sort_order, mi.name), '[]'::jsonb)
  from public.menu_items mi join public.menu_categories c on c.id = mi.category_id
  where mi.tenant_id = p_tenant;
$$;

create or replace function public.api_set_availability(p_tenant uuid, p_item uuid, p_available boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.menu_items set is_available = p_available where id = p_item and tenant_id = p_tenant;
  return found;
end;
$$;

revoke execute on function public.api_orders(uuid, timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.api_order(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.api_payments(uuid, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.api_menu(uuid) from public, anon, authenticated;
revoke execute on function public.api_set_availability(uuid, uuid, boolean) from public, anon, authenticated;
