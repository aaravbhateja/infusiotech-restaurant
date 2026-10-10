-- Item-wise prep time and delayed-order alerts.
-- A dish may carry its own prep time (minutes). The kitchen ticket is "late"
-- once the slowest dish on it has been waiting longer than that; dishes
-- without one fall back to the restaurant default (20 min).

alter table public.menu_items
  add column prep_minutes smallint check (prep_minutes is null or (prep_minutes between 1 and 240));

alter table public.orders add column late_alerted_at timestamptz;

create or replace function public.alert_late_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_label text;
  v_count integer := 0;
begin
  for r in
    select o.id, o.tenant_id, o.order_number, o.table_id, o.round_started_at,
           greatest(coalesce(max(mi.prep_minutes), 0), 1) as dish_minutes,
           bool_or(mi.prep_minutes is not null) as has_dish_time
    from public.orders o
    join public.order_items oi on oi.order_id = o.id and oi.round = o.current_round and oi.voided_at is null
    left join public.menu_items mi on mi.id = oi.menu_item_id
    where o.order_status in ('accepted', 'preparing')
      and (o.late_alerted_at is null or o.late_alerted_at < o.round_started_at)
    group by o.id
  loop
    if now() - r.round_started_at > make_interval(mins => case when r.has_dish_time then r.dish_minutes else 20 end) then
      select label into v_label from public.restaurant_tables where id = r.table_id;
      insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
      values (r.tenant_id, 'orders', 'timer', 'Late order · ' || coalesce(v_label, 'Takeaway'),
              'Order #' || r.order_number || ' is taking longer than expected.', 'orders', r.id,
              array['Kitchen Staff', 'Manager']);
      update public.orders set late_alerted_at = now() where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.alert_late_orders() from public, anon, authenticated;

select cron.schedule('alert-late-orders', '* * * * *', $$select public.alert_late_orders()$$);
