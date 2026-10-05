-- Real per-staff shift tracking and order attribution — previously a
-- waiter's "on-shift" timer and "orders taken today" would have had to be
-- fabricated, since nothing recorded who took an order or when a shift
-- started.

alter table public.orders add column taken_by uuid references public.users (id);

create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index staff_shifts_membership_idx on public.staff_shifts (membership_id, started_at desc);
create unique index staff_shifts_one_open_per_membership on public.staff_shifts (membership_id) where ended_at is null;

alter table public.staff_shifts enable row level security;

create policy staff_shifts_self_read on public.staff_shifts
  for select to authenticated
  using (membership_id = public.current_membership_id() or (tenant_id = public.current_tenant_id() and public.has_permission('staff.view')));

create or replace function public.start_shift()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
  v_id uuid;
begin
  v_membership_id := public.current_membership_id();
  if v_membership_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.staff_shifts (tenant_id, membership_id)
  values (public.current_tenant_id(), v_membership_id)
  on conflict (membership_id) where ended_at is null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.staff_shifts where membership_id = v_membership_id and ended_at is null;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.start_shift() from public, anon;
grant execute on function public.start_shift() to authenticated;

create or replace function public.end_shift()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff_shifts
  set ended_at = now()
  where membership_id = public.current_membership_id() and ended_at is null;
end;
$$;

revoke execute on function public.end_shift() from public, anon;
grant execute on function public.end_shift() to authenticated;

-- Manual staff orders should record who actually took the order.
create or replace function public.create_staff_order(
  p_tenant_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_guest_count int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('orders.create') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_table_id is not null then
    perform 1 from public.restaurant_tables where id = p_table_id and tenant_id = p_tenant_id;
    if not found then
      raise exception 'table_not_found' using errcode = 'P0001';
    end if;
  end if;

  v_order_number := to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.orders (
    tenant_id, table_id, order_number, order_status, payment_status, subtotal_minor, tax_minor, discount_minor, total_minor, guest_count, taken_by
  ) values (
    p_tenant_id, p_table_id, v_order_number, 'accepted', 'unpaid', 0, 0, 0, 0, p_guest_count, auth.uid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price_minor, currency, category_id
      into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and tenant_id = p_tenant_id
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

    select array(select jsonb_array_elements_text(coalesce(v_item->'variant_ids', '[]'::jsonb)))::uuid[] into v_variant_ids;
    if v_variant_ids is not null then
      for v_variant in
        select iv.id, iv.name, iv.price_delta_minor
        from public.item_variants iv
        join public.item_variant_groups g on g.id = iv.group_id
        where iv.id = any(v_variant_ids) and iv.tenant_id = p_tenant_id and g.menu_item_id = v_menu_item.id and iv.is_available = true
      loop
        v_unit_price_minor := v_unit_price_minor + v_variant.price_delta_minor;
        v_variant_snapshot := v_variant_snapshot || jsonb_build_object('id', v_variant.id, 'name', v_variant.name, 'price_delta_minor', v_variant.price_delta_minor);
      end loop;
    end if;

    select array(select jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)))::uuid[] into v_addon_ids;
    if v_addon_ids is not null then
      for v_addon in
        select ia.id, ia.name, ia.price_delta_minor
        from public.item_addons ia
        join public.item_addon_groups g on g.id = ia.group_id
        where ia.id = any(v_addon_ids) and ia.tenant_id = p_tenant_id and g.menu_item_id = v_menu_item.id and ia.is_available = true
      loop
        v_unit_price_minor := v_unit_price_minor + v_addon.price_delta_minor;
        v_addon_snapshot := v_addon_snapshot || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price_delta_minor', v_addon.price_delta_minor);
      end loop;
    end if;

    v_line_total_minor := v_unit_price_minor * v_quantity;
    v_subtotal_minor := v_subtotal_minor + v_line_total_minor;

    insert into public.order_items (
      tenant_id, order_id, menu_item_id, item_name_snapshot, variant_snapshot, addon_snapshot, unit_price_minor, quantity, tax_minor, line_total_minor
    ) values (
      p_tenant_id, v_order_id, v_menu_item.id, v_menu_item.name, v_variant_snapshot, v_addon_snapshot, v_unit_price_minor, v_quantity, 0, v_line_total_minor
    );
  end loop;

  update public.orders set subtotal_minor = v_subtotal_minor, total_minor = v_subtotal_minor where id = v_order_id;

  if p_table_id is not null then
    update public.restaurant_tables set floor_state = 'available' where id = p_table_id;
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total_minor', v_subtotal_minor);
end;
$$;
