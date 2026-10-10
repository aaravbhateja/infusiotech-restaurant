-- CSV export of sales and menu, and menu import. CSV quoting and parsing are
-- done here so every client (phone, web) gets identical, correct files.

create or replace function public.csv_cell(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null then ''
    when p_value ~ '[",\r\n]' then '"' || replace(p_value, '"', '""') || '"'
    else p_value
  end;
$$;

-- Minimal RFC-4180 parser: quoted fields, doubled quotes, CRLF/LF newlines.
create or replace function public.parse_csv(p_text text)
returns setof text[]
language plpgsql
immutable
as $$
declare
  v_row text[] := '{}';
  v_field text := '';
  v_in_quotes boolean := false;
  v_i int := 1;
  v_len int := length(p_text);
  v_c text;
  v_has_data boolean := false;
begin
  while v_i <= v_len loop
    v_c := substr(p_text, v_i, 1);
    if v_in_quotes then
      if v_c = '"' then
        if substr(p_text, v_i + 1, 1) = '"' then
          v_field := v_field || '"';
          v_i := v_i + 1;
        else
          v_in_quotes := false;
        end if;
      else
        v_field := v_field || v_c;
      end if;
    elsif v_c = '"' then
      v_in_quotes := true;
      v_has_data := true;
    elsif v_c = ',' then
      v_row := v_row || v_field;
      v_field := '';
      v_has_data := true;
    elsif v_c = E'\r' then
      null;
    elsif v_c = E'\n' then
      if v_has_data or v_field <> '' then
        v_row := v_row || v_field;
        return next v_row;
      end if;
      v_row := '{}';
      v_field := '';
      v_has_data := false;
    else
      v_field := v_field || v_c;
      v_has_data := true;
    end if;
    v_i := v_i + 1;
  end loop;
  if v_has_data or v_field <> '' then
    v_row := v_row || v_field;
    return next v_row;
  end if;
  return;
end;
$$;

create or replace function public.export_orders_csv(p_from timestamptz, p_to timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out text;
begin
  if not (public.has_permission('analytics.basic.view') or public.has_permission('payments.view')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select 'Date,Time,Order,Table,Status,Payment status,Payment method,Collected by,Items,Subtotal,Discount,GST,Total' || E'\n' ||
         coalesce(string_agg(
           concat_ws(',',
             public.csv_cell(to_char(o.created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')),
             public.csv_cell(to_char(o.created_at at time zone 'Asia/Kolkata', 'HH24:MI')),
             public.csv_cell(o.order_number),
             public.csv_cell(coalesce(t.label, 'Takeaway')),
             public.csv_cell(o.order_status),
             public.csv_cell(o.payment_status),
             public.csv_cell(coalesce(pm.method, '')),
             public.csv_cell(coalesce(cu.display_name, cu.email, '')),
             public.csv_cell(coalesce(it.items, '')),
             to_char(o.subtotal_minor / 100.0, 'FM999999990.00'),
             to_char(o.discount_minor / 100.0, 'FM999999990.00'),
             to_char(o.tax_minor / 100.0, 'FM999999990.00'),
             to_char(o.total_minor / 100.0, 'FM999999990.00')
           ), E'\n' order by o.created_at), '')
  into v_out
  from public.orders o
  left join public.restaurant_tables t on t.id = o.table_id
  left join lateral (
    select p.method, p.collected_by from public.payments p
    where p.order_id = o.id and p.status in ('paid', 'cash_received', 'reconciled', 'refunded')
    order by p.created_at desc limit 1
  ) pm on true
  left join public.tenant_memberships cm on cm.id = pm.collected_by
  left join public.users cu on cu.id = cm.user_id
  left join lateral (
    select string_agg(oi.quantity || 'x ' || oi.item_name_snapshot, '; ') as items
    from public.order_items oi where oi.order_id = o.id and oi.voided_at is null
  ) it on true
  where o.tenant_id = public.current_tenant_id()
    and o.created_at >= p_from and o.created_at < p_to;

  return v_out;
end;
$$;

create or replace function public.export_menu_csv()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out text;
begin
  if not public.has_permission('menu.view') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select 'Category,Name,Description,Price,Veg,Available,Station,Prep minutes' || E'\n' ||
         coalesce(string_agg(
           concat_ws(',',
             public.csv_cell(c.name),
             public.csv_cell(i.name),
             public.csv_cell(i.description),
             to_char(i.price_minor / 100.0, 'FM999999990.00'),
             case when 'non-veg' = any(i.dietary_labels) then 'no' else 'yes' end,
             case when i.is_available then 'yes' else 'no' end,
             public.csv_cell(i.station),
             coalesce(i.prep_minutes::text, '')
           ), E'\n' order by c.sort_order, c.name, i.sort_order, i.name), '')
  into v_out
  from public.menu_items i
  join public.menu_categories c on c.id = i.category_id
  where i.tenant_id = public.current_tenant_id();

  return v_out;
end;
$$;

-- Import: Category,Name,Description,Price,Veg,Available,Station,Prep minutes
-- (header row required). Items are matched by category + name: existing ones
-- are updated, new ones created; unknown categories are created.
create or replace function public.import_menu_csv(p_csv text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_row text[];
  v_n int := 0;
  v_created int := 0;
  v_updated int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_cat uuid;
  v_item uuid;
  v_price numeric;
  v_name text;
  v_cat_name text;
  v_station text;
  v_prep int;
  v_veg boolean;
  v_avail boolean;
begin
  if not (public.has_permission('menu.create') and public.has_permission('menu.edit')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_csv is null or length(p_csv) > 2000000 then
    raise exception 'invalid_csv' using errcode = 'P0001';
  end if;

  for v_row in select * from public.parse_csv(p_csv)
  loop
    v_n := v_n + 1;
    if v_n = 1 then
      if lower(trim(coalesce(v_row[1], ''))) <> 'category' or lower(trim(coalesce(v_row[2], ''))) <> 'name' then
        raise exception 'bad_header' using errcode = 'P0001';
      end if;
      continue;
    end if;

    v_cat_name := trim(coalesce(v_row[1], ''));
    v_name := trim(coalesce(v_row[2], ''));
    if v_cat_name = '' or v_name = '' then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'error', 'category and name are required');
      continue;
    end if;
    begin
      v_price := trim(coalesce(v_row[4], ''))::numeric;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'error', 'invalid price');
      continue;
    end;
    if v_price < 0 or v_price > 1000000 then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'error', 'invalid price');
      continue;
    end if;

    v_veg := lower(trim(coalesce(v_row[5], 'yes'))) not in ('no', 'n', 'false', '0', 'non-veg');
    v_avail := lower(trim(coalesce(v_row[6], 'yes'))) not in ('no', 'n', 'false', '0');
    v_station := lower(trim(coalesce(nullif(v_row[7], ''), 'general')));
    if v_station not in ('general', 'tandoor', 'curry', 'wok', 'grill', 'dessert', 'beverage') then
      v_station := 'general';
    end if;
    begin
      v_prep := nullif(trim(coalesce(v_row[8], '')), '')::int;
    exception when others then
      v_prep := null;
    end;
    if v_prep is not null and (v_prep < 1 or v_prep > 240) then
      v_prep := null;
    end if;

    select id into v_cat from public.menu_categories where tenant_id = v_tenant and lower(name) = lower(v_cat_name) limit 1;
    if v_cat is null then
      insert into public.menu_categories (tenant_id, name, sort_order)
      values (v_tenant, v_cat_name, coalesce((select max(sort_order) + 1 from public.menu_categories where tenant_id = v_tenant), 0))
      returning id into v_cat;
    end if;

    select id into v_item from public.menu_items where tenant_id = v_tenant and category_id = v_cat and lower(name) = lower(v_name) limit 1;
    if v_item is null then
      insert into public.menu_items (tenant_id, category_id, name, description, price_minor, dietary_labels, is_available, station, prep_minutes)
      values (v_tenant, v_cat, v_name, nullif(trim(coalesce(v_row[3], '')), ''), round(v_price * 100),
              array[case when v_veg then 'veg' else 'non-veg' end], v_avail, v_station, v_prep);
      v_created := v_created + 1;
    else
      update public.menu_items
      set description = nullif(trim(coalesce(v_row[3], '')), ''), price_minor = round(v_price * 100),
          dietary_labels = array[case when v_veg then 'veg' else 'non-veg' end],
          is_available = v_avail, station = v_station, prep_minutes = v_prep
      where id = v_item;
      v_updated := v_updated + 1;
    end if;
  end loop;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, after_summary)
  values (v_tenant, auth.uid(), 'menu.csv_imported', 'menu_items', jsonb_build_object('created', v_created, 'updated', v_updated, 'errors', jsonb_array_length(v_errors)));

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'errors', v_errors);
end;
$$;

revoke execute on function public.export_orders_csv(timestamptz, timestamptz) from public, anon;
revoke execute on function public.export_menu_csv() from public, anon;
revoke execute on function public.import_menu_csv(text) from public, anon;
grant execute on function public.export_orders_csv(timestamptz, timestamptz) to authenticated;
grant execute on function public.export_menu_csv() to authenticated;
grant execute on function public.import_menu_csv(text) to authenticated;
