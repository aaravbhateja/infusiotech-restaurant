-- Inventory, recipes and food cost.
--
-- Everything that changes stock goes through stock_movements, so the numbers
-- are always explainable: purchases (+), sales (-, automatic when an order is
-- served), wastage / staff meals (-), manual adjustments, and stocktake
-- corrections. current_qty on the item is the running total.

insert into public.permissions (key, description) values
  ('inventory.view', 'View stock, recipes, suppliers and purchases'),
  ('inventory.manage', 'Receive stock, record wastage, edit recipes and run stocktakes')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('inventory.view', 'inventory.manage')
where r.name = 'Manager' on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'inventory.view'
where r.name = 'Kitchen Staff' on conflict do nothing;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'pcs')),
  purchase_unit text,                       -- e.g. "bag", "case"
  purchase_factor numeric(14, 4) not null default 1 check (purchase_factor > 0), -- base units per purchase unit
  current_qty numeric(14, 3) not null default 0,
  cost_per_unit_minor numeric(14, 4) not null default 0,   -- weighted average, minor units per base unit
  min_qty numeric(14, 3) not null default 0,
  perishable boolean not null default false,
  is_active boolean not null default true,
  low_stock_alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index inventory_items_name_idx on public.inventory_items (tenant_id, lower(name));

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  qty_per_portion numeric(14, 4) not null check (qty_per_portion > 0),
  unique (menu_item_id, inventory_item_id)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  supplier_id uuid references public.suppliers (id),
  status text not null default 'ordered' check (status in ('ordered', 'received', 'cancelled')),
  notes text,
  invoice_no text,
  invoice_total_minor bigint,
  created_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now(),
  received_at timestamptz
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id),
  qty numeric(14, 3) not null check (qty > 0),             -- base units
  unit_cost_minor numeric(14, 4) not null default 0,       -- per base unit
  received_qty numeric(14, 3)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  qty_delta numeric(14, 3) not null,
  kind text not null check (kind in ('purchase', 'sale', 'sale_reversal', 'wastage', 'staff_meal', 'adjustment', 'stocktake', 'opening')),
  unit_cost_minor numeric(14, 4) not null default 0,
  note text,
  order_id uuid references public.orders (id) on delete set null,
  purchase_order_id uuid references public.purchase_orders (id) on delete set null,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);
create index stock_movements_item_idx on public.stock_movements (inventory_item_id, created_at desc);
create index stock_movements_tenant_idx on public.stock_movements (tenant_id, created_at desc);

create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  qty_remaining numeric(14, 3) not null,
  expiry_date date not null,
  received_at timestamptz not null default now(),
  expiry_alerted_at timestamptz
);
create index inventory_batches_item_idx on public.inventory_batches (inventory_item_id, expiry_date);

create table public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'finalized')),
  started_by uuid references public.tenant_memberships (id),
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  variance_value_minor bigint
);

create table public.stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  stocktake_id uuid not null references public.stocktakes (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  system_qty numeric(14, 3) not null,
  counted_qty numeric(14, 3),
  variance_qty numeric(14, 3),
  unique (stocktake_id, inventory_item_id)
);

alter table public.order_items add column stock_deducted_at timestamptz;

-- RLS: read with inventory.view; suppliers and recipes are plain CRUD with
-- inventory.manage; stock, batches, POs and stocktakes change only through the
-- functions below so the ledger stays consistent.
do $$
declare t text;
begin
  foreach t in array array['suppliers', 'inventory_items', 'recipe_lines', 'purchase_orders', 'purchase_order_lines',
                           'stock_movements', 'inventory_batches', 'stocktakes', 'stocktake_lines']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated
                      using (tenant_id = public.current_tenant_id() and public.has_permission('inventory.view'))$p$, t || '_read', t);
  end loop;
end
$$;

create policy suppliers_write on public.suppliers for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage'));
create policy recipe_lines_write on public.recipe_lines for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage'));

-- Item master edits (name, unit, thresholds). Stock quantity itself is never
-- edited directly.
create policy inventory_items_insert on public.inventory_items for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage') and current_qty = 0);
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('inventory.manage'));

-- Block direct writes to the running quantity / cost from clients.
create or replace function public.trg_inventory_item_guard()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.inventory_fn', true), '') <> 'on' and auth.uid() is not null then
    new.current_qty := old.current_qty;
    new.cost_per_unit_minor := old.cost_per_unit_minor;
  end if;
  return new;
end;
$$;
create trigger inventory_items_guard before update on public.inventory_items
  for each row execute function public.trg_inventory_item_guard();

-- The one place stock changes. Positive purchases update the weighted-average
-- cost and (for perishables with an expiry) create a batch; negative moves
-- consume the earliest-expiring batches first.
create or replace function public.inventory_move(
  p_item uuid, p_delta numeric, p_kind text, p_unit_cost numeric default null,
  p_note text default null, p_order uuid default null, p_po uuid default null, p_expiry date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_new_qty numeric;
  v_cost numeric;
  v_left numeric;
  v_b record;
  v_take numeric;
begin
  perform set_config('app.inventory_fn', 'on', true);
  select * into v_item from public.inventory_items where id = p_item for update;
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  v_new_qty := v_item.current_qty + p_delta;
  v_cost := v_item.cost_per_unit_minor;
  if p_delta > 0 and p_unit_cost is not null and p_kind = 'purchase' then
    if v_item.current_qty <= 0 then
      v_cost := p_unit_cost;
    else
      v_cost := (v_item.current_qty * v_item.cost_per_unit_minor + p_delta * p_unit_cost) / (v_item.current_qty + p_delta);
    end if;
  end if;

  update public.inventory_items set current_qty = v_new_qty, cost_per_unit_minor = v_cost where id = p_item;

  insert into public.stock_movements (tenant_id, inventory_item_id, qty_delta, kind, unit_cost_minor, note, order_id, purchase_order_id, created_by)
  values (v_item.tenant_id, p_item, p_delta, p_kind, coalesce(p_unit_cost, v_item.cost_per_unit_minor), p_note, p_order, p_po, auth.uid());

  if p_delta > 0 and p_expiry is not null then
    insert into public.inventory_batches (tenant_id, inventory_item_id, qty_remaining, expiry_date)
    values (v_item.tenant_id, p_item, p_delta, p_expiry);
  elsif p_delta < 0 then
    v_left := -p_delta;
    for v_b in select * from public.inventory_batches where inventory_item_id = p_item and qty_remaining > 0 order by expiry_date, received_at
    loop
      exit when v_left <= 0;
      v_take := least(v_b.qty_remaining, v_left);
      update public.inventory_batches set qty_remaining = qty_remaining - v_take where id = v_b.id;
      v_left := v_left - v_take;
    end loop;
  end if;

  -- Low stock: alert once, re-arm when stock is back above the level.
  if v_item.min_qty > 0 and v_new_qty <= v_item.min_qty and v_item.low_stock_alerted_at is null then
    update public.inventory_items set low_stock_alerted_at = now() where id = p_item;
    insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
    values (v_item.tenant_id, 'system', 'bell', 'Low stock · ' || v_item.name,
            v_item.name || ' is down to ' || round(v_new_qty, 2) || ' ' || v_item.unit || '.', 'inventory_items', p_item,
            array['Manager', 'Kitchen Staff']);
  elsif v_item.min_qty > 0 and v_new_qty > v_item.min_qty and v_item.low_stock_alerted_at is not null then
    update public.inventory_items set low_stock_alerted_at = null where id = p_item;
  end if;
end;
$$;
revoke execute on function public.inventory_move(uuid, numeric, text, numeric, text, uuid, uuid, date) from public, anon, authenticated;

-- Wastage, staff meals and manual corrections.
create or replace function public.record_stock_change(p_item uuid, p_qty numeric, p_kind text, p_note text)
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
  if p_kind not in ('wastage', 'staff_meal', 'adjustment', 'opening') or p_qty is null or p_qty = 0 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_kind in ('wastage', 'staff_meal') and (p_qty > 0 or length(trim(coalesce(p_note, ''))) = 0) then
    raise exception 'wastage_needs_negative_qty_and_reason' using errcode = 'P0001';
  end if;
  select tenant_id into v_tenant from public.inventory_items where id = p_item;
  if v_tenant is distinct from public.current_tenant_id() then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  perform public.inventory_move(p_item, p_qty, p_kind, null, nullif(trim(p_note), ''));
end;
$$;
revoke execute on function public.record_stock_change(uuid, numeric, text, text) from public, anon;
grant execute on function public.record_stock_change(uuid, numeric, text, text) to authenticated;

-- Purchase orders ------------------------------------------------------
create or replace function public.create_purchase_order(p_supplier uuid, p_lines jsonb, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po uuid;
  v_line jsonb;
  v_tenant uuid := public.current_tenant_id();
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;
  insert into public.purchase_orders (tenant_id, supplier_id, notes, created_by)
  values (v_tenant, p_supplier, nullif(trim(p_notes), ''), public.current_membership_id()) returning id into v_po;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if not exists (select 1 from public.inventory_items where id = (v_line->>'item_id')::uuid and tenant_id = v_tenant) then
      raise exception 'item_not_found' using errcode = 'P0001';
    end if;
    insert into public.purchase_order_lines (tenant_id, purchase_order_id, inventory_item_id, qty, unit_cost_minor)
    values (v_tenant, v_po, (v_line->>'item_id')::uuid, (v_line->>'qty')::numeric, coalesce((v_line->>'unit_cost_minor')::numeric, 0));
  end loop;
  return v_po;
end;
$$;

-- Goods received: p_lines = [{line_id, received_qty, unit_cost_minor, expiry}]
-- (omitted lines receive the ordered quantity at the ordered cost).
create or replace function public.receive_purchase_order(p_po uuid, p_lines jsonb default '[]'::jsonb, p_invoice_no text default null, p_invoice_total_minor bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po record;
  v_l record;
  v_over jsonb;
  v_qty numeric;
  v_cost numeric;
  v_exp date;
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_po from public.purchase_orders where id = p_po and tenant_id = public.current_tenant_id() for update;
  if v_po.id is null then
    raise exception 'po_not_found' using errcode = 'P0001';
  end if;
  if v_po.status <> 'ordered' then
    raise exception 'po_not_open' using errcode = 'P0001';
  end if;

  for v_l in select * from public.purchase_order_lines where purchase_order_id = p_po
  loop
    select o into v_over from jsonb_array_elements(p_lines) o where (o->>'line_id')::uuid = v_l.id limit 1;
    v_qty := coalesce((v_over->>'received_qty')::numeric, v_l.qty);
    v_cost := coalesce((v_over->>'unit_cost_minor')::numeric, v_l.unit_cost_minor);
    v_exp := nullif(v_over->>'expiry', '')::date;
    update public.purchase_order_lines set received_qty = v_qty, unit_cost_minor = v_cost where id = v_l.id;
    if v_qty > 0 then
      perform public.inventory_move(v_l.inventory_item_id, v_qty, 'purchase', v_cost, 'PO ' || coalesce(nullif(p_invoice_no, ''), left(p_po::text, 8)), null, p_po, v_exp);
    end if;
  end loop;

  update public.purchase_orders
  set status = 'received', received_at = now(), invoice_no = nullif(trim(p_invoice_no), ''),
      invoice_total_minor = p_invoice_total_minor
  where id = p_po;
end;
$$;

create or replace function public.cancel_purchase_order(p_po uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.purchase_orders set status = 'cancelled' where id = p_po and tenant_id = public.current_tenant_id() and status = 'ordered';
end;
$$;

revoke execute on function public.create_purchase_order(uuid, jsonb, text) from public, anon;
revoke execute on function public.receive_purchase_order(uuid, jsonb, text, bigint) from public, anon;
revoke execute on function public.cancel_purchase_order(uuid) from public, anon;
grant execute on function public.create_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb, text, bigint) to authenticated;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;

-- Stocktake ------------------------------------------------------------
create or replace function public.start_stocktake()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tenant uuid := public.current_tenant_id();
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select id into v_id from public.stocktakes where tenant_id = v_tenant and status = 'open' limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.stocktakes (tenant_id, started_by) values (v_tenant, public.current_membership_id()) returning id into v_id;
  insert into public.stocktake_lines (tenant_id, stocktake_id, inventory_item_id, system_qty)
  select v_tenant, v_id, id, current_qty from public.inventory_items where tenant_id = v_tenant and is_active;
  return v_id;
end;
$$;

create or replace function public.save_stocktake_count(p_line uuid, p_counted numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_counted is not null and p_counted < 0 then
    raise exception 'invalid_quantity' using errcode = 'P0001';
  end if;
  update public.stocktake_lines l set counted_qty = p_counted
  from public.stocktakes s
  where l.id = p_line and s.id = l.stocktake_id and s.status = 'open' and s.tenant_id = public.current_tenant_id();
end;
$$;

-- Counted items are corrected to what was counted; the difference against the
-- live system quantity is the variance (shortages = possible leakage).
create or replace function public.finalize_stocktake(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s record;
  v_l record;
  v_cur numeric;
  v_cost numeric;
  v_var numeric;
  v_total numeric := 0;
  v_lines int := 0;
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_s from public.stocktakes where id = p_id and tenant_id = public.current_tenant_id() for update;
  if v_s.id is null or v_s.status <> 'open' then
    raise exception 'stocktake_not_open' using errcode = 'P0001';
  end if;

  for v_l in select * from public.stocktake_lines where stocktake_id = p_id and counted_qty is not null
  loop
    select current_qty, cost_per_unit_minor into v_cur, v_cost from public.inventory_items where id = v_l.inventory_item_id;
    v_var := v_l.counted_qty - v_cur;
    update public.stocktake_lines set variance_qty = v_var where id = v_l.id;
    if v_var <> 0 then
      perform public.inventory_move(v_l.inventory_item_id, v_var, 'stocktake', null, 'Stocktake');
      v_total := v_total + v_var * v_cost;
    end if;
    v_lines := v_lines + 1;
  end loop;

  update public.stocktakes set status = 'finalized', finalized_at = now(), variance_value_minor = round(v_total) where id = p_id;
  return jsonb_build_object('counted', v_lines, 'variance_value_minor', round(v_total));
end;
$$;

revoke execute on function public.start_stocktake() from public, anon;
revoke execute on function public.save_stocktake_count(uuid, numeric) from public, anon;
revoke execute on function public.finalize_stocktake(uuid) from public, anon;
grant execute on function public.start_stocktake() to authenticated;
grant execute on function public.save_stocktake_count(uuid, numeric) to authenticated;
grant execute on function public.finalize_stocktake(uuid) to authenticated;

-- Automatic deduction: when an order is served, take each dish's recipe off
-- the stock (once per item, including items added in later rounds).
create or replace function public.deduct_stock_for_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it record;
  v_r record;
begin
  for v_it in select * from public.order_items
              where order_id = p_order and voided_at is null and stock_deducted_at is null and menu_item_id is not null
  loop
    for v_r in select * from public.recipe_lines where menu_item_id = v_it.menu_item_id
    loop
      perform public.inventory_move(v_r.inventory_item_id, -(v_r.qty_per_portion * v_it.quantity), 'sale', null,
                                    v_it.item_name_snapshot, p_order);
    end loop;
    update public.order_items set stock_deducted_at = now() where id = v_it.id;
  end loop;
end;
$$;
revoke execute on function public.deduct_stock_for_order(uuid) from public, anon, authenticated;

create or replace function public.trg_deduct_stock_on_served()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_status = 'served' and old.order_status is distinct from 'served' then
    perform public.deduct_stock_for_order(new.id);
  end if;
  return null;
end;
$$;
create trigger orders_deduct_stock after update of order_status on public.orders
  for each row execute function public.trg_deduct_stock_on_served();

-- A dish voided after its stock was taken puts it back.
create or replace function public.trg_return_stock_on_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r record;
begin
  if new.voided_at is not null and old.voided_at is null and new.stock_deducted_at is not null and new.menu_item_id is not null then
    for v_r in select * from public.recipe_lines where menu_item_id = new.menu_item_id
    loop
      perform public.inventory_move(v_r.inventory_item_id, v_r.qty_per_portion * new.quantity, 'sale_reversal', null,
                                    'Voided: ' || new.item_name_snapshot, new.order_id);
    end loop;
  end if;
  return null;
end;
$$;
create trigger order_items_return_stock after update of voided_at on public.order_items
  for each row execute function public.trg_return_stock_on_void();

-- Reports ----------------------------------------------------------------
create or replace function public.recipe_costing()
returns table (menu_item_id uuid, name text, category text, price_minor bigint, cost_minor numeric, margin_minor numeric, margin_pct numeric, has_recipe boolean)
language sql
stable
security definer
set search_path = public
as $$
  select mi.id, mi.name, c.name, mi.base_price_minor,
         coalesce(sum(rl.qty_per_portion * ii.cost_per_unit_minor), 0),
         mi.base_price_minor - coalesce(sum(rl.qty_per_portion * ii.cost_per_unit_minor), 0),
         case when mi.base_price_minor > 0
              then round(((mi.base_price_minor - coalesce(sum(rl.qty_per_portion * ii.cost_per_unit_minor), 0)) / mi.base_price_minor * 100)::numeric, 1)
              else 0 end,
         count(rl.id) > 0
  from public.menu_items mi
  join public.menu_categories c on c.id = mi.category_id
  left join public.recipe_lines rl on rl.menu_item_id = mi.id
  left join public.inventory_items ii on ii.id = rl.inventory_item_id
  where mi.tenant_id = public.current_tenant_id() and public.has_permission('inventory.view')
  group by mi.id, c.name
  order by 7 asc;
$$;

-- Suggested purchase: cover the next 7 days of average use (last 14 days of
-- sales + wastage), and flag anything that runs out within 3 days.
create or replace function public.reorder_suggestions()
returns table (inventory_item_id uuid, name text, unit text, current_qty numeric, min_qty numeric, avg_daily_use numeric, days_left numeric, suggested_qty numeric)
language sql
stable
security definer
set search_path = public
as $$
  with use as (
    select m.inventory_item_id, -sum(m.qty_delta) / 14.0 as per_day
    from public.stock_movements m
    where m.tenant_id = public.current_tenant_id() and m.kind in ('sale', 'wastage', 'staff_meal', 'sale_reversal')
      and m.created_at >= now() - interval '14 days'
    group by m.inventory_item_id
  )
  select i.id, i.name, i.unit, i.current_qty, i.min_qty,
         round(coalesce(u.per_day, 0)::numeric, 3),
         case when coalesce(u.per_day, 0) > 0 then round((i.current_qty / u.per_day)::numeric, 1) else null end,
         greatest(round((coalesce(u.per_day, 0) * 7 - i.current_qty)::numeric, 2), round((i.min_qty * 2 - i.current_qty)::numeric, 2), 0)
  from public.inventory_items i
  left join use u on u.inventory_item_id = i.id
  where i.tenant_id = public.current_tenant_id() and i.is_active and public.has_permission('inventory.view')
    and (i.current_qty <= i.min_qty or (coalesce(u.per_day, 0) > 0 and i.current_qty / u.per_day < 3))
  order by 7 asc nulls last;
$$;

-- Period summary: purchases, cost of goods sold, wastage and stocktake
-- losses (all valued at the cost recorded when the stock moved).
create or replace function public.inventory_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_sales bigint;
  v_cogs numeric;
  v_result jsonb;
begin
  if not public.has_permission('inventory.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select coalesce(sum(total_minor), 0) into v_sales from public.orders
  where tenant_id = v_tenant and created_at >= p_from and created_at < p_to
    and order_status not in ('rejected', 'cancelled') and payment_status in ('paid', 'cash_received', 'reconciled');

  select coalesce(sum(-qty_delta * unit_cost_minor), 0) into v_cogs from public.stock_movements
  where tenant_id = v_tenant and kind in ('sale', 'sale_reversal') and created_at >= p_from and created_at < p_to;

  select jsonb_build_object(
    'sales_minor', v_sales,
    'cogs_minor', round(v_cogs),
    'food_cost_pct', case when v_sales > 0 then round((v_cogs / v_sales * 100)::numeric, 1) else null end,
    'purchases_minor', (select coalesce(round(sum(qty_delta * unit_cost_minor)), 0) from public.stock_movements where tenant_id = v_tenant and kind = 'purchase' and created_at >= p_from and created_at < p_to),
    'wastage_minor', (select coalesce(round(sum(-qty_delta * unit_cost_minor)), 0) from public.stock_movements where tenant_id = v_tenant and kind = 'wastage' and created_at >= p_from and created_at < p_to),
    'staff_meal_minor', (select coalesce(round(sum(-qty_delta * unit_cost_minor)), 0) from public.stock_movements where tenant_id = v_tenant and kind = 'staff_meal' and created_at >= p_from and created_at < p_to),
    'stocktake_variance_minor', (select coalesce(round(sum(qty_delta * unit_cost_minor)), 0) from public.stock_movements where tenant_id = v_tenant and kind = 'stocktake' and created_at >= p_from and created_at < p_to),
    'stock_value_minor', (select coalesce(round(sum(current_qty * cost_per_unit_minor)), 0) from public.inventory_items where tenant_id = v_tenant and is_active),
    'top_variance', coalesce((
      select jsonb_agg(jsonb_build_object('name', n, 'qty', q, 'value_minor', v) order by v)
      from (select i.name as n, round(sum(m.qty_delta), 2) as q, round(sum(m.qty_delta * m.unit_cost_minor)) as v
            from public.stock_movements m join public.inventory_items i on i.id = m.inventory_item_id
            where m.tenant_id = v_tenant and m.kind = 'stocktake' and m.created_at >= p_from and m.created_at < p_to
            group by i.name having sum(m.qty_delta) <> 0 order by v asc limit 5) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.recipe_costing() from public, anon;
revoke execute on function public.reorder_suggestions() from public, anon;
revoke execute on function public.inventory_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.recipe_costing() to authenticated;
grant execute on function public.reorder_suggestions() to authenticated;
grant execute on function public.inventory_report(timestamptz, timestamptz) to authenticated;

-- Expiry alerts: once a batch is within 2 days of expiring (08:00 India time).
create or replace function public.alert_expiring_stock()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select b.id, b.tenant_id, i.name, b.qty_remaining, i.unit, b.expiry_date
    from public.inventory_batches b join public.inventory_items i on i.id = b.inventory_item_id
    where b.qty_remaining > 0 and b.expiry_date <= (now() at time zone 'Asia/Kolkata')::date + 2 and b.expiry_alerted_at is null
  loop
    insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
    values (r.tenant_id, 'system', 'timer', 'Expiring soon · ' || r.name,
            round(r.qty_remaining, 2) || ' ' || r.unit || ' expires on ' || to_char(r.expiry_date, 'DD Mon') || '.',
            'inventory_batches', r.id, array['Manager', 'Kitchen Staff']);
    update public.inventory_batches set expiry_alerted_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.alert_expiring_stock() from public, anon, authenticated;
select cron.schedule('alert-expiring-stock', '30 2 * * *', $$select public.alert_expiring_stock()$$);
