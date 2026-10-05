-- Repeat guests were getting a fresh customers row per order (every call to
-- create_public_order() inserted unconditionally), so "returning customer"
-- stats were meaningless. One customer row per (tenant, phone) going forward.
create unique index customers_tenant_phone_key
  on public.customers (tenant_id, phone)
  where phone is not null;

create or replace function public.create_public_order(
  p_table_token_hash text,
  p_items jsonb,
  p_customer jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_table_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal_minor bigint := 0;
  v_item jsonb;
  v_menu_item record;
  v_variant record;
  v_addon record;
  v_variant_ids uuid[];
  v_addon_ids uuid[];
  v_quantity int;
  v_unit_price_minor bigint;
  v_line_total_minor bigint;
  v_variant_snapshot jsonb;
  v_addon_snapshot jsonb;
begin
  select qa.tenant_id, qa.table_id
    into v_tenant_id, v_table_id
  from public.qr_assets qa
  where qa.public_token_hash = p_table_token_hash
    and qa.status = 'active';

  if v_tenant_id is null then
    raise exception 'invalid_or_inactive_table_token' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  if p_customer is not null and (p_customer->>'phone') is not null then
    insert into public.customers (tenant_id, name, phone)
    values (v_tenant_id, p_customer->>'name', p_customer->>'phone')
    on conflict (tenant_id, phone) where phone is not null
    do update set name = coalesce(excluded.name, public.customers.name)
    returning id into v_customer_id;
  end if;

  v_order_number := to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.orders (
    tenant_id, table_id, customer_id, order_number,
    order_status, payment_status, subtotal_minor, tax_minor, discount_minor, total_minor
  ) values (
    v_tenant_id, v_table_id, v_customer_id, v_order_number,
    'new', 'unpaid', 0, 0, 0, 0
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price_minor, currency, tax_code
      into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and tenant_id = v_tenant_id
      and is_available = true;

    if v_menu_item.id is null then
      raise exception 'menu_item_unavailable: %', v_item->>'menu_item_id' using errcode = 'P0001';
    end if;

    v_quantity := coalesce((v_item->>'quantity')::int, 0);
    if v_quantity <= 0 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;

    v_unit_price_minor := v_menu_item.price_minor;
    v_variant_snapshot := '[]'::jsonb;
    v_addon_snapshot := '[]'::jsonb;

    select array(select jsonb_array_elements_text(coalesce(v_item->'variant_ids', '[]'::jsonb)))::uuid[]
      into v_variant_ids;

    if v_variant_ids is not null then
      for v_variant in
        select iv.id, iv.name, iv.price_delta_minor
        from public.item_variants iv
        join public.item_variant_groups g on g.id = iv.group_id
        where iv.id = any(v_variant_ids)
          and iv.tenant_id = v_tenant_id
          and g.menu_item_id = v_menu_item.id
          and iv.is_available = true
      loop
        v_unit_price_minor := v_unit_price_minor + v_variant.price_delta_minor;
        v_variant_snapshot := v_variant_snapshot || jsonb_build_object(
          'id', v_variant.id, 'name', v_variant.name, 'price_delta_minor', v_variant.price_delta_minor
        );
      end loop;
    end if;

    select array(select jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)))::uuid[]
      into v_addon_ids;

    if v_addon_ids is not null then
      for v_addon in
        select ia.id, ia.name, ia.price_delta_minor
        from public.item_addons ia
        join public.item_addon_groups g on g.id = ia.group_id
        where ia.id = any(v_addon_ids)
          and ia.tenant_id = v_tenant_id
          and g.menu_item_id = v_menu_item.id
          and ia.is_available = true
      loop
        v_unit_price_minor := v_unit_price_minor + v_addon.price_delta_minor;
        v_addon_snapshot := v_addon_snapshot || jsonb_build_object(
          'id', v_addon.id, 'name', v_addon.name, 'price_delta_minor', v_addon.price_delta_minor
        );
      end loop;
    end if;

    v_line_total_minor := v_unit_price_minor * v_quantity;
    v_subtotal_minor := v_subtotal_minor + v_line_total_minor;

    insert into public.order_items (
      tenant_id, order_id, menu_item_id, item_name_snapshot,
      variant_snapshot, addon_snapshot, unit_price_minor, quantity, tax_minor, line_total_minor
    ) values (
      v_tenant_id, v_order_id, v_menu_item.id, v_menu_item.name,
      v_variant_snapshot, v_addon_snapshot, v_unit_price_minor, v_quantity, 0, v_line_total_minor
    );
  end loop;

  update public.orders
  set subtotal_minor = v_subtotal_minor,
      total_minor = v_subtotal_minor
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'tenant_id', v_tenant_id,
    'total_minor', v_subtotal_minor,
    'order_status', 'new',
    'payment_status', 'unpaid'
  );
end;
$$;

revoke execute on function public.create_public_order(text, jsonb, jsonb) from public, anon, authenticated;

-- Aggregated customer stats for the Customers list/detail screens.
-- security_invoker makes the view honour the querying user's RLS on the
-- underlying customers/orders tables (Postgres 15+), so no separate policy
-- is needed on the view itself.

create view public.customer_summaries
with (security_invoker = true)
as
select
  c.id,
  c.tenant_id,
  c.name,
  c.phone,
  c.email,
  c.created_at,
  count(o.id) as order_count,
  coalesce(sum(o.total_minor), 0) as total_spend_minor,
  max(o.created_at) as last_order_at
from public.customers c
left join public.orders o on o.customer_id = c.id
group by c.id;
