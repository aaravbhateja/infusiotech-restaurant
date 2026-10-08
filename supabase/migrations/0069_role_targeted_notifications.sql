-- Notifications (and the push sent from each one) used to go to every
-- device and every screen in a restaurant. Now each notification carries the
-- roles that should receive it. A BEFORE INSERT trigger on notifications
-- fills it in from the title, so every existing and future code path that
-- inserts a notification is covered without being edited. Owner always
-- receives everything.

alter table public.notifications add column audience_roles text[];

create or replace function public.notification_audience(p_title text, p_category text)
returns text[]
language sql
immutable
as $$
  select case
    when p_title like 'New order #%'                 then array['Manager']
    when p_title like 'Order to prepare%'            then array['Kitchen Staff','Manager']
    when p_title like '% is ready'                   then array['Waiter','Manager']
    when p_title like '% wants the bill'             then array['Waiter','Cashier','Manager']
    when p_title like '% needs a waiter'             then array['Waiter','Manager']
    when p_title like 'Discount requested%'          then array['Manager']
    when p_title like 'Order #% cancelled'           then array['Kitchen Staff','Waiter','Manager']
    when p_title like 'Order #% rejected'            then array['Manager']
    when p_title like 'Payment received%'            then array['Cashier','Manager']
    when p_title = 'Cash handover waiting'           then array['Cashier','Manager']
    when p_category = 'reviews'                      then array['Manager']
    when p_category = 'staff'                        then array[]::text[]
    else array['Manager']
  end;
$$;

create or replace function public.set_notification_audience()
returns trigger
language plpgsql
as $$
begin
  if new.audience_roles is null then
    new.audience_roles := public.notification_audience(new.title, new.category);
  end if;
  if not ('Owner' = any(new.audience_roles)) then
    new.audience_roles := array_append(new.audience_roles, 'Owner');
  end if;
  return new;
end;
$$;

-- BEFORE trigger, so the audience is set by the time the AFTER push trigger
-- relays the row.
create trigger notifications_set_audience
  before insert on public.notifications
  for each row execute function public.set_notification_audience();

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name from public.tenant_memberships m join public.roles r on r.id = m.role_id
  where m.id = public.current_membership_id();
$$;

-- Each person only reads notifications meant for their role.
drop policy notifications_read on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (audience_roles is null or public.current_role_name() = any(audience_roles))
  );

-- Pass the audience on to the push relay.
create or replace function public.notify_push_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_service_key text;
begin
  select value into v_url from public.app_config where key = 'send_push_url';
  select value into v_service_key from public.app_config where key = 'service_role_key';
  if v_url is null or v_service_key is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
    body := jsonb_build_object('notification_id', new.id, 'tenant_id', new.tenant_id, 'title', new.title, 'body', new.body, 'audience_roles', new.audience_roles)
  );
  return new;
end;
$$;

-- The kitchen had no signal at all that food was waiting. Tell them when an
-- order is accepted (by a manager) or created already accepted (taken by
-- staff).
create or replace function public.trg_notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  if new.order_status = 'cancelled' and old.order_status <> 'cancelled' then
    perform public.notify(new.tenant_id, 'orders', 'x', 'Order #' || new.order_number || ' cancelled', new.cancel_reason, 'orders', new.id);
  elsif new.order_status = 'rejected' and old.order_status <> 'rejected' then
    perform public.notify(new.tenant_id, 'orders', 'x', 'Order #' || new.order_number || ' rejected', new.cancel_reason, 'orders', new.id);
  elsif new.order_status = 'accepted' and old.order_status = 'new' then
    select label into v_table from public.restaurant_tables where id = new.table_id;
    perform public.notify(new.tenant_id, 'orders', 'flame', 'Order to prepare · #' || new.order_number, coalesce(v_table, 'Takeaway'), 'orders', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.trg_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_table text;
begin
  select tenant_id, order_number, total_minor, order_status, table_id into v_order from public.orders where id = new.id;
  if v_order.tenant_id is null then
    return null;
  end if;

  if v_order.order_status = 'accepted' then
    -- Staff-taken orders skip "new": straight to the kitchen.
    select label into v_table from public.restaurant_tables where id = v_order.table_id;
    perform public.notify(v_order.tenant_id, 'orders', 'flame', 'Order to prepare · #' || v_order.order_number, coalesce(v_table, 'Takeaway'), 'orders', new.id);
  else
    perform public.notify(
      v_order.tenant_id, 'orders', 'bolt',
      'New order #' || v_order.order_number,
      '₹' || to_char(v_order.total_minor / 100.0, 'FM999999990.00'),
      'orders', new.id
    );
  end if;
  return null;
end;
$$;
