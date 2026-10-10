-- Orders created through the public API (aggregators, own apps, kiosks).
-- Takeaway or delivery only; staff accept them like any other incoming order.
-- Safe to retry: the same (source, external_id) never creates a second order.

alter table public.orders
  add column source text,
  add column external_id text;
create unique index orders_external_unique on public.orders (tenant_id, source, external_id) where external_id is not null;

alter table public.api_keys drop constraint api_keys_scopes_check;
alter table public.api_keys add constraint api_keys_scopes_check
  check (scopes <> '{}' and scopes <@ array['orders:read', 'orders:write', 'payments:read', 'menu:read', 'menu:write']);

-- p: {
--   source: "zomato",            -- who is sending it (letters, digits, - _)
--   external_id: "ZB-1234",      -- their order id (makes retries safe)
--   type: "takeaway" | "delivery",
--   customer: { name, phone },
--   delivery: { address, fee_minor? },
--   note: "less spicy",
--   items: [ { menu_item_id, quantity, variant_ids?, addon_ids? } ]
-- }
create or replace function public.api_create_order(p_tenant uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
  v_source text := lower(coalesce(nullif(trim(p->>'source'), ''), 'api'));
  v_ext text := nullif(trim(p->>'external_id'), '');
  v_type text := coalesce(p->>'type', 'takeaway');
  v_phone text := right(regexp_replace(coalesce(p#>>'{customer,phone}', ''), '\D', '', 'g'), 10);
  v_name text := nullif(trim(p#>>'{customer,name}'), '');
  v_addr text := nullif(trim(p#>>'{delivery,address}'), '');
  v_note text := nullif(trim(p->>'note'), '');
  v_existing record;
  v_cfg jsonb;
  v_pct numeric := 0;
  v_fee bigint := 0;
  v_cust uuid;
  v_order uuid;
  v_number text;
  v_status text;
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
  v_lines int := 0;
begin
  if v_source !~ '^[a-z0-9_-]{1,30}$' then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if v_ext is null or length(v_ext) > 80 then
    raise exception 'external_id_required' using errcode = 'P0001';
  end if;
  if v_type not in ('takeaway', 'delivery') then
    raise exception 'invalid_type' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') not between 1 and 50 then
    raise exception 'items_required' using errcode = 'P0001';
  end if;
  if v_type = 'delivery' and (length(v_phone) < 10 or v_addr is null) then
    raise exception 'delivery_details_required' using errcode = 'P0001';
  end if;

  -- Retries return the order that already exists.
  select id, order_number, order_status, total_minor into v_existing
  from public.orders where tenant_id = p_tenant and source = v_source and external_id = v_ext;
  if v_existing.id is not null then
    return jsonb_build_object('order_id', v_existing.id, 'number', v_existing.order_number, 'status', v_existing.order_status,
                              'total_minor', v_existing.total_minor, 'duplicate', true);
  end if;

  select coalesce((settings->>'accepting_orders')::boolean, true) as accepting,
         coalesce((settings->>'auto_accept')::boolean, false) as auto_accept,
         status, settings->'channel_pricing' as cp
    into v_t from public.tenants where id = p_tenant;
  if v_t.status is distinct from 'active' or not v_t.accepting then
    raise exception 'not_accepting_orders' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders where tenant_id = p_tenant and source is not null and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'too_many_orders' using errcode = 'P0001';
  end if;

  v_cfg := v_t.cp;
  if v_type = 'takeaway' then v_pct := coalesce((v_cfg->>'takeaway_percent')::numeric, 0); end if;
  if v_type = 'delivery' then
    v_pct := coalesce((v_cfg->>'delivery_percent')::numeric, 0);
    v_fee := coalesce((p#>>'{delivery,fee_minor}')::bigint, (v_cfg->>'delivery_fee_minor')::bigint, 0);
    if v_fee < 0 or v_fee > 100000 then
      raise exception 'invalid_fee' using errcode = 'P0001';
    end if;
  end if;

  if length(v_phone) = 10 then
    select id into v_cust from public.customers where tenant_id = p_tenant and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_phone limit 1;
    if v_cust is null then
      insert into public.customers (tenant_id, name, phone) values (p_tenant, v_name, v_phone) returning id into v_cust;
    end if;
  end if;

  v_status := case when v_t.auto_accept then 'accepted' else 'new' end;
  v_number := to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.orders (
    tenant_id, table_id, customer_id, order_number, order_status, payment_status, subtotal_minor, tax_minor, discount_minor, total_minor,
    order_type, contact_name, delivery_address, delivery_phone, delivery_fee_minor, delivery_status, special_instructions, source, external_id
  ) values (
    p_tenant, null, v_cust, v_number, v_status, 'unpaid', 0, 0, 0, 0,
    v_type, v_name, case when v_type = 'delivery' then v_addr end, case when v_type = 'delivery' then v_phone end,
    v_fee, case when v_type = 'delivery' then 'pending' end, left(v_note, 500), v_source, v_ext
  ) returning id into v_order;

  for v_item in select * from jsonb_array_elements(p->'items')
  loop
    if coalesce(v_item->>'menu_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_menu_item' using errcode = 'P0001';
    end if;
    select id, name, price_minor into v_mi from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and tenant_id = p_tenant and is_available = true;
    if v_mi.id is null then
      raise exception 'menu_item_unavailable: %', v_item->>'menu_item_id' using errcode = 'P0001';
    end if;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;
    v_unit := v_mi.price_minor;
    v_vsnap := '[]'::jsonb;
    v_asnap := '[]'::jsonb;

    select array(select jsonb_array_elements_text(coalesce(v_item->'variant_ids', '[]'::jsonb)))::uuid[] into v_variant_ids;
    for v_variant in
      select iv.id, iv.name, iv.price_delta_minor from public.item_variants iv join public.item_variant_groups g on g.id = iv.group_id
      where iv.id = any(v_variant_ids) and iv.tenant_id = p_tenant and g.menu_item_id = v_mi.id and iv.is_available
    loop
      v_unit := v_unit + v_variant.price_delta_minor;
      v_vsnap := v_vsnap || jsonb_build_object('id', v_variant.id, 'name', v_variant.name, 'price_delta_minor', v_variant.price_delta_minor);
    end loop;
    select array(select jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)))::uuid[] into v_addon_ids;
    for v_addon in
      select ia.id, ia.name, ia.price_delta_minor from public.item_addons ia join public.item_addon_groups g on g.id = ia.group_id
      where ia.id = any(v_addon_ids) and ia.tenant_id = p_tenant and g.menu_item_id = v_mi.id and ia.is_available
    loop
      v_unit := v_unit + v_addon.price_delta_minor;
      v_asnap := v_asnap || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price_delta_minor', v_addon.price_delta_minor);
    end loop;

    v_unit := round(v_unit * (1 + v_pct / 100.0));
    insert into public.order_items (tenant_id, order_id, menu_item_id, item_name_snapshot, variant_snapshot, addon_snapshot, unit_price_minor, quantity, tax_minor, line_total_minor)
    values (p_tenant, v_order, v_mi.id, v_mi.name, v_vsnap, v_asnap, v_unit, v_qty, 0, v_unit * v_qty);
    v_lines := v_lines + 1;
  end loop;

  perform public.recalc_order_totals(v_order);

  return jsonb_build_object('order_id', v_order, 'number', v_number, 'status', v_status,
                            'total_minor', (select total_minor from public.orders where id = v_order), 'duplicate', false);
end;
$$;
revoke execute on function public.api_create_order(uuid, jsonb) from public, anon, authenticated;

-- A cancel an integration may request for its own order, while it is still new.
create or replace function public.api_cancel_order(p_tenant uuid, p_id uuid, p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select order_status into v_status from public.orders where id = p_id and tenant_id = p_tenant and source is not null for update;
  if v_status is null then return 'not_found'; end if;
  if v_status not in ('new', 'accepted') then return 'too_late'; end if;
  update public.orders set order_status = 'cancelled', cancel_reason = 'Cancelled by ' || coalesce(p_source, 'integration') where id = p_id;
  return 'ok';
end;
$$;
revoke execute on function public.api_cancel_order(uuid, uuid, text) from public, anon, authenticated;
