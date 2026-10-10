-- Business intelligence: menu engineering, sales forecast, anomaly alerts, and
-- multi-outlet views for owners of more than one restaurant.

-- Menu engineering: how popular and how profitable is each dish?
--   Star       popular + high margin        keep and promote
--   Plowhorse  popular + low margin         raise price / cut cost
--   Puzzle     unpopular + high margin      reposition / promote
--   Dog        unpopular + low margin       consider dropping
-- Margin uses recipe cost where a recipe exists; dishes without one are
-- listed as "Needs recipe" because their profit cannot be judged.
create or replace function public.menu_engineering(p_from date, p_to date)
returns table (menu_item_id uuid, name text, qty bigint, revenue_minor bigint, unit_margin_minor numeric, margin_pct numeric, class text)
language sql
stable
security definer
set search_path = public
as $$
  with m as (
    select mi.id as menu_item_id, mi.name,
           coalesce(sum(oi.quantity), 0)::bigint as qty,
           coalesce(sum(oi.line_total_minor), 0)::bigint as revenue_minor,
           rc.margin_minor as unit_margin_minor, rc.margin_pct, coalesce(rc.has_recipe, false) as has_recipe
    from public.menu_items mi
    left join public.order_items oi on oi.menu_item_id = mi.id and oi.voided_at is null
         and exists (select 1 from public.orders o where o.id = oi.order_id
                     and o.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
                     and o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
                     and o.order_status not in ('rejected', 'cancelled'))
    left join public.recipe_costing() rc on rc.menu_item_id = mi.id
    where mi.tenant_id = public.current_tenant_id() and public.has_permission('analytics.advanced.view')
    group by mi.id, mi.name, rc.margin_minor, rc.margin_pct, rc.has_recipe
  ),
  th as (
    select avg(nullif(qty, 0)) * 0.7 as pop_cut,
           avg(unit_margin_minor) filter (where has_recipe and qty > 0) as margin_cut
    from m
  )
  select m.menu_item_id, m.name, m.qty, m.revenue_minor, m.unit_margin_minor, m.margin_pct,
         case
           when m.qty = 0 then 'No sales'
           when not m.has_recipe then 'Needs recipe'
           when m.qty >= th.pop_cut and m.unit_margin_minor >= th.margin_cut then 'Star'
           when m.qty >= th.pop_cut then 'Plowhorse'
           when m.unit_margin_minor >= th.margin_cut then 'Puzzle'
           else 'Dog'
         end
  from m cross join th
  order by m.qty desc;
$$;

-- Next 7 days: the average of the same weekday over the last 4 weeks.
create or replace function public.sales_forecast()
returns table (day date, weekday text, forecast_minor bigint, forecast_orders numeric, samples int)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select (now() at time zone 'Asia/Kolkata')::date + g as d from generate_series(0, 6) g
  ),
  hist as (
    select (o.created_at at time zone 'Asia/Kolkata')::date as d, sum(o.total_minor) as sales, count(*) as n
    from public.orders o
    where o.tenant_id = public.current_tenant_id() and public.has_permission('analytics.advanced.view')
      and o.order_status not in ('rejected', 'cancelled') and o.payment_status in ('paid', 'cash_received', 'reconciled')
      and o.created_at >= now() - interval '29 days'
    group by 1
  )
  select days.d, to_char(days.d, 'Dy'),
         coalesce(round(avg(h.sales)), 0)::bigint,
         coalesce(round(avg(h.n), 1), 0),
         count(h.d)::int
  from days
  left join hist h on extract(dow from h.d) = extract(dow from days.d) and h.d < (now() at time zone 'Asia/Kolkata')::date
  group by days.d
  order by days.d;
$$;

-- Daily check (23:15 India time): is today's discounting, voiding or
-- refunding far above this restaurant's own recent normal?
create or replace function public.scan_anomalies()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_today_disc numeric; v_avg_disc numeric;
  v_today_void numeric; v_avg_void numeric;
  v_today_ref numeric; v_avg_ref numeric;
  v_from timestamptz := (((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata');
  v_n integer := 0;
  v_msg text;
begin
  for t in select id from public.tenants where status = 'active'
  loop
    v_msg := null;
    select coalesce(sum(discount_minor), 0) into v_today_disc from public.orders where tenant_id = t.id and created_at >= v_from and order_status not in ('rejected', 'cancelled');
    select coalesce(sum(discount_minor), 0) / 14.0 into v_avg_disc from public.orders where tenant_id = t.id and created_at >= v_from - interval '14 days' and created_at < v_from and order_status not in ('rejected', 'cancelled');
    select count(*) into v_today_void from public.order_items where tenant_id = t.id and voided_at >= v_from;
    select count(*) / 14.0 into v_avg_void from public.order_items where tenant_id = t.id and voided_at >= v_from - interval '14 days' and voided_at < v_from;
    select coalesce(sum(amount_minor), 0) into v_today_ref from public.refunds where tenant_id = t.id and created_at >= v_from;
    select coalesce(sum(amount_minor), 0) / 14.0 into v_avg_ref from public.refunds where tenant_id = t.id and created_at >= v_from - interval '14 days' and created_at < v_from;

    if v_today_disc >= 50000 and v_today_disc > greatest(v_avg_disc * 2.5, 50000) then
      v_msg := 'Discounts today are ₹' || round(v_today_disc / 100) || ', far above the usual ₹' || round(v_avg_disc / 100) || ' a day.';
    elsif v_today_void >= 4 and v_today_void > greatest(v_avg_void * 2.5, 3) then
      v_msg := v_today_void || ' items were voided today, against about ' || round(v_avg_void, 1) || ' a day.';
    elsif v_today_ref >= 50000 and v_today_ref > greatest(v_avg_ref * 2.5, 50000) then
      v_msg := 'Refunds today are ₹' || round(v_today_ref / 100) || ', far above the usual ₹' || round(v_avg_ref / 100) || ' a day.';
    end if;

    if v_msg is not null then
      insert into public.notifications (tenant_id, category, icon, title, body, audience_roles)
      values (t.id, 'system', 'bell', 'Unusual activity today', v_msg || ' Check Reports → Controls.', array['Manager']);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.scan_anomalies() from public, anon, authenticated;
select cron.schedule('scan-anomalies', '45 17 * * *', $$select public.scan_anomalies()$$);

-- Multi-outlet: restaurants the signed-in user owns, side by side.
create or replace function public.group_dashboard()
returns table (tenant_id uuid, name text, today_minor bigint, today_orders bigint, week_minor bigint, week_orders bigint, avg_ticket_minor bigint, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name,
    coalesce(sum(o.total_minor) filter (where o.created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'), 0)::bigint,
    count(o.id) filter (where o.created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    coalesce(sum(o.total_minor), 0)::bigint,
    count(o.id),
    case when count(o.id) > 0 then (sum(o.total_minor) / count(o.id))::bigint else 0 end,
    t.id = public.current_tenant_id()
  from public.tenant_memberships m
  join public.roles r on r.id = m.role_id and r.name = 'Owner'
  join public.tenants t on t.id = m.tenant_id
  left join public.orders o on o.tenant_id = t.id and o.created_at >= now() - interval '7 days'
       and o.order_status not in ('rejected', 'cancelled') and o.payment_status in ('paid', 'cash_received', 'reconciled')
  where m.user_id = auth.uid() and m.status = 'active'
  group by t.id, t.name
  order by 5 desc;
$$;

-- Copy the whole menu from one outlet you own to another you own. Matching
-- dishes (same category and name) are updated, new ones created.
create or replace function public.copy_menu_to_outlet(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_i record;
  v_cat uuid;
  v_item uuid;
  v_created int := 0;
  v_updated int := 0;
begin
  if p_source = p_target then
    raise exception 'same_outlet' using errcode = 'P0001';
  end if;
  if (select count(distinct m.tenant_id) from public.tenant_memberships m join public.roles r on r.id = m.role_id
      where m.user_id = auth.uid() and m.status = 'active' and r.name = 'Owner' and m.tenant_id in (p_source, p_target)) <> 2 then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  perform set_config('app.menu_job', 'on', true);  -- skip per-item price guard/history; the owner owns both outlets
  for v_c in select * from public.menu_categories where tenant_id = p_source
  loop
    select id into v_cat from public.menu_categories where tenant_id = p_target and lower(name) = lower(v_c.name) limit 1;
    if v_cat is null then
      insert into public.menu_categories (tenant_id, name, sort_order, is_active) values (p_target, v_c.name, v_c.sort_order, v_c.is_active) returning id into v_cat;
    end if;
    for v_i in select * from public.menu_items where tenant_id = p_source and category_id = v_c.id
    loop
      select id into v_item from public.menu_items where tenant_id = p_target and category_id = v_cat and lower(name) = lower(v_i.name) limit 1;
      if v_item is null then
        insert into public.menu_items (tenant_id, category_id, name, description, price_minor, base_price_minor, dietary_labels, is_available, manual_available,
                                       station, prep_minutes, allergens, spice_level, name_hi, description_hi, sort_order)
        values (p_target, v_cat, v_i.name, v_i.description, v_i.base_price_minor, v_i.base_price_minor, v_i.dietary_labels, v_i.manual_available, v_i.manual_available,
                v_i.station, v_i.prep_minutes, v_i.allergens, v_i.spice_level, v_i.name_hi, v_i.description_hi, v_i.sort_order);
        v_created := v_created + 1;
      else
        update public.menu_items set description = v_i.description, price_minor = v_i.base_price_minor, base_price_minor = v_i.base_price_minor,
               dietary_labels = v_i.dietary_labels, station = v_i.station, prep_minutes = v_i.prep_minutes, allergens = v_i.allergens,
               spice_level = v_i.spice_level, name_hi = v_i.name_hi, description_hi = v_i.description_hi
        where id = v_item;
        v_updated := v_updated + 1;
      end if;
    end loop;
  end loop;
  perform set_config('app.menu_job', 'off', true);

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

revoke execute on function public.menu_engineering(date, date) from public, anon;
revoke execute on function public.sales_forecast() from public, anon;
revoke execute on function public.group_dashboard() from public, anon;
revoke execute on function public.copy_menu_to_outlet(uuid, uuid) from public, anon;
grant execute on function public.menu_engineering(date, date) to authenticated;
grant execute on function public.sales_forecast() to authenticated;
grant execute on function public.group_dashboard() to authenticated;
grant execute on function public.copy_menu_to_outlet(uuid, uuid) to authenticated;
