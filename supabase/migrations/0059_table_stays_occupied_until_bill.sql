-- A table used to count as free the moment its order was marked served, even
-- though the guests are still sitting there. It now stays occupied until the
-- guest taps "Call waiter for bill", or the order is paid, or 75 minutes
-- pass after it was served without either (people leave without asking).
--
-- orders.table_released_at is the single source of truth: null while the
-- order still holds its table. Every screen filters on it, and realtime
-- pushes the change to all of them the moment it is set.

alter table public.orders
  add column served_at timestamptz,
  add column bill_requested_at timestamptz,
  add column table_released_at timestamptz;

-- Orders already served before this change must not suddenly look seated.
update public.orders set served_at = created_at, table_released_at = now() where order_status = 'served';

create or replace function public.trg_order_table_release()
returns trigger
language plpgsql
as $$
begin
  if new.order_status = 'served' and old.order_status is distinct from 'served' then
    new.served_at := now();
  end if;

  -- Paid, rejected and cancelled orders have nothing left to wait for.
  if new.table_released_at is null and (
    new.order_status in ('rejected', 'cancelled')
    or (new.order_status = 'served' and new.payment_status in ('paid', 'cash_received', 'reconciled'))
  ) then
    new.table_released_at := now();
  end if;
  return new;
end;
$$;

create trigger orders_table_release
  before update on public.orders
  for each row execute function public.trg_order_table_release();

-- The guest's "Call waiter for bill" tap (kind = 'bill') frees the table for
-- every served order still holding it; a plain "Call waiter" (kind = 'help')
-- only notifies staff. Only the call-waiter edge function (service role)
-- may call this, same as before.
drop function if exists public.notify_waiter_call(text);

create or replace function public.notify_waiter_call(p_table_token_hash text, p_kind text default 'help')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_table_id uuid;
  v_table_label text;
begin
  select qa.tenant_id, qa.table_id, rt.label into v_tenant_id, v_table_id, v_table_label
  from public.qr_assets qa
  join public.restaurant_tables rt on rt.id = qa.table_id
  where qa.public_token_hash = p_table_token_hash and qa.status = 'active';

  if v_tenant_id is null then
    raise exception 'invalid_or_inactive_table_token' using errcode = 'P0001';
  end if;

  if p_kind = 'bill' then
    update public.orders
    set bill_requested_at = now(), table_released_at = now()
    where table_id = v_table_id and tenant_id = v_tenant_id
      and order_status = 'served' and table_released_at is null;

    insert into public.notifications (tenant_id, category, icon, title, body)
    values (v_tenant_id, 'orders', 'receipt', v_table_label || ' wants the bill', 'A guest tapped "Call waiter for bill".');
  else
    insert into public.notifications (tenant_id, category, icon, title, body)
    values (v_tenant_id, 'orders', 'bell', v_table_label || ' needs a waiter', 'A guest tapped "Call waiter".');
  end if;
end;
$$;

revoke execute on function public.notify_waiter_call(text, text) from public, anon, authenticated;
grant execute on function public.notify_waiter_call(text, text) to service_role;

-- Free tables whose guests were served 75+ minutes ago and never asked for
-- the bill. Runs every minute; the update fires realtime so screens refresh.
create extension if not exists pg_cron;

select cron.schedule(
  'release-stale-tables',
  '* * * * *',
  $$update public.orders
    set table_released_at = now()
    where order_status = 'served' and table_released_at is null
      and served_at < now() - interval '75 minutes'$$
);
