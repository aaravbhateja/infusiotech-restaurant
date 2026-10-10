-- Guest-facing menu detail: allergens, spice level, Hindi names, and combos.
alter table public.menu_items
  add column allergens text[] not null default '{}',
  add column spice_level smallint check (spice_level is null or spice_level between 0 and 3),
  add column name_hi text,
  add column description_hi text,
  add column combo_of jsonb check (combo_of is null or jsonb_typeof(combo_of) = 'array');

-- A combo has no recipe of its own: selling one uses up each included dish
-- (its own recipe, once per portion in the combo). Dishes can still carry
-- extra recipe lines of their own (e.g. packaging).
create or replace function public.recipe_usage_for_item(p_menu_item uuid)
returns table (inventory_item_id uuid, qty numeric)
language sql
stable
security definer
set search_path = public
as $$
  select rl.inventory_item_id, rl.qty_per_portion
  from public.recipe_lines rl where rl.menu_item_id = p_menu_item
  union all
  select rl.inventory_item_id, rl.qty_per_portion * coalesce((c->>'qty')::numeric, 1)
  from public.menu_items mi
  cross join lateral jsonb_array_elements(coalesce(mi.combo_of, '[]'::jsonb)) c
  join public.recipe_lines rl on rl.menu_item_id = (c->>'menu_item_id')::uuid
  where mi.id = p_menu_item;
$$;
revoke execute on function public.recipe_usage_for_item(uuid) from public, anon, authenticated;

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
    for v_r in select * from public.recipe_usage_for_item(v_it.menu_item_id)
    loop
      perform public.inventory_move(v_r.inventory_item_id, -(v_r.qty * v_it.quantity), 'sale', null, v_it.item_name_snapshot, p_order);
    end loop;
    update public.order_items set stock_deducted_at = now() where id = v_it.id;
  end loop;
end;
$$;
revoke execute on function public.deduct_stock_for_order(uuid) from public, anon, authenticated;

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
    for v_r in select * from public.recipe_usage_for_item(new.menu_item_id)
    loop
      perform public.inventory_move(v_r.inventory_item_id, v_r.qty * new.quantity, 'sale_reversal', null, 'Voided: ' || new.item_name_snapshot, new.order_id);
    end loop;
  end if;
  return null;
end;
$$;

-- Costing follows combos too.
create or replace function public.recipe_costing()
returns table (menu_item_id uuid, name text, category text, price_minor bigint, cost_minor numeric, margin_minor numeric, margin_pct numeric, has_recipe boolean)
language sql
stable
security definer
set search_path = public
as $$
  select mi.id, mi.name, c.name, mi.base_price_minor,
         coalesce(sum(u.qty * ii.cost_per_unit_minor), 0),
         mi.base_price_minor - coalesce(sum(u.qty * ii.cost_per_unit_minor), 0),
         case when mi.base_price_minor > 0
              then round(((mi.base_price_minor - coalesce(sum(u.qty * ii.cost_per_unit_minor), 0)) / mi.base_price_minor * 100)::numeric, 1)
              else 0 end,
         count(u.inventory_item_id) > 0
  from public.menu_items mi
  join public.menu_categories c on c.id = mi.category_id
  left join lateral public.recipe_usage_for_item(mi.id) u on true
  left join public.inventory_items ii on ii.id = u.inventory_item_id
  where mi.tenant_id = public.current_tenant_id() and public.has_permission('inventory.view')
  group by mi.id, c.name
  order by 7 asc;
$$;
