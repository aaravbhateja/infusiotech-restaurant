-- Integrations: signed outgoing webhooks and API keys for a read-mostly
-- public API. Owners manage both from Settings (settings.manage).

-- ── API keys ─────────────────────────────────────────────────────────────
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null check (scopes <> '{}' and scopes <@ array['orders:read', 'payments:read', 'menu:read', 'menu:write']),
  created_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_tenant_idx on public.api_keys (tenant_id);
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
grant select (id, tenant_id, name, prefix, scopes, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
create policy api_keys_read on public.api_keys for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));

create table public.api_rate (
  key_id uuid not null references public.api_keys (id) on delete cascade,
  minute timestamptz not null,
  n integer not null default 0,
  primary key (key_id, minute)
);
alter table public.api_rate enable row level security;

-- Returns the key ONCE; only a SHA-256 hash is stored.
create or replace function public.create_api_key(p_name text, p_scopes text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text := 'brk_' || encode(gen_random_bytes(24), 'hex');
  v_id uuid;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if (select count(*) from public.api_keys where tenant_id = public.current_tenant_id() and revoked_at is null) >= 10 then
    raise exception 'too_many_keys' using errcode = 'P0001';
  end if;
  insert into public.api_keys (tenant_id, name, prefix, key_hash, scopes, created_by)
  values (public.current_tenant_id(), trim(p_name), left(v_key, 10), encode(digest(v_key, 'sha256'), 'hex'), p_scopes, public.current_membership_id())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key);
end;
$$;

create or replace function public.revoke_api_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.api_keys set revoked_at = now() where id = p_id and tenant_id = public.current_tenant_id() and revoked_at is null;
end;
$$;

-- Called only by the public-api edge function (service role). Checks the key,
-- applies the 120 requests/minute limit and stamps last use.
create or replace function public.api_key_check(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k record;
  v_n integer;
begin
  select * into k from public.api_keys where key_hash = p_hash and revoked_at is null;
  if k.id is null then
    return null;
  end if;
  insert into public.api_rate (key_id, minute, n) values (k.id, date_trunc('minute', now()), 1)
  on conflict (key_id, minute) do update set n = public.api_rate.n + 1 returning n into v_n;
  update public.api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  delete from public.api_rate where minute < now() - interval '10 minutes' and key_id = k.id;
  return jsonb_build_object('tenant_id', k.tenant_id, 'key_id', k.id, 'scopes', to_jsonb(k.scopes), 'limited', v_n > 120);
end;
$$;
revoke execute on function public.api_key_check(text) from public, anon, authenticated;

-- ── Shared JSON shapes (API + webhooks) ──────────────────────────────────
create or replace function public.api_order_json(p_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'number', o.order_number,
    'status', o.order_status,
    'payment_status', o.payment_status,
    'type', o.order_type,
    'table', t.label,
    'created_at', o.created_at,
    'currency', o.currency,
    'subtotal_minor', o.subtotal_minor,
    'discount_minor', o.discount_minor,
    'tax_minor', o.tax_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'total_minor', o.total_minor,
    'amount_paid_minor', o.amount_paid_minor,
    'customer', case when c.id is null then null else jsonb_build_object('name', c.name, 'phone', c.phone) end,
    'delivery', case when o.order_type = 'delivery' then jsonb_build_object('address', o.delivery_address, 'phone', o.delivery_phone, 'status', o.delivery_status) else null end,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name', oi.item_name_snapshot, 'quantity', oi.quantity, 'unit_price_minor', oi.unit_price_minor,
        'line_total_minor', oi.line_total_minor, 'voided', oi.voided_at is not null) order by oi.round, oi.item_name_snapshot)
      from public.order_items oi where oi.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  left join public.restaurant_tables t on t.id = o.table_id
  left join public.customers c on c.id = o.customer_id
  where o.id = p_order;
$$;
revoke execute on function public.api_order_json(uuid) from public, anon, authenticated;

-- ── Webhooks ─────────────────────────────────────────────────────────────
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  url text not null check (url ~* '^https://[^/\s]+' and length(url) <= 500),
  secret text not null,
  events text[] not null check (events <> '{}' and events <@ array['order.created', 'order.status_changed', 'order.paid', 'payment.recorded']),
  active boolean not null default true,
  consecutive_failures integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by uuid references public.tenant_memberships (id),
  created_at timestamptz not null default now()
);
create index webhook_endpoints_tenant_idx on public.webhook_endpoints (tenant_id);
alter table public.webhook_endpoints enable row level security;
revoke all on public.webhook_endpoints from anon, authenticated;
grant select (id, tenant_id, url, events, active, consecutive_failures, last_success_at, last_failure_at, created_at) on public.webhook_endpoints to authenticated;
create policy webhook_endpoints_read on public.webhook_endpoints for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
alter publication supabase_realtime add table public.webhook_endpoints;

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event text not null,
  ref_id uuid,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_code integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status = 'pending';
create index webhook_deliveries_endpoint_idx on public.webhook_deliveries (endpoint_id, created_at desc);
alter table public.webhook_deliveries enable row level security;
create policy webhook_deliveries_read on public.webhook_deliveries for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));

create or replace function public.create_webhook(p_url text, p_events text[])
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text := 'whsec_' || encode(gen_random_bytes(24), 'hex');
  v_id uuid;
  v_host text;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_url !~* '^https://[^/\s]+' or length(p_url) > 500 then
    raise exception 'url_must_be_https' using errcode = 'P0001';
  end if;
  v_host := lower(substring(p_url from '^https://([^/:?#]+)'));
  if v_host in ('localhost', '0.0.0.0') or v_host ~ '^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)' or v_host ~ '\.(local|internal|localhost)$' then
    raise exception 'url_not_public' using errcode = 'P0001';
  end if;
  if (select count(*) from public.webhook_endpoints where tenant_id = public.current_tenant_id()) >= 5 then
    raise exception 'too_many_webhooks' using errcode = 'P0001';
  end if;
  insert into public.webhook_endpoints (tenant_id, url, secret, events, created_by)
  values (public.current_tenant_id(), p_url, v_secret, p_events, public.current_membership_id()) returning id into v_id;
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end;
$$;

create or replace function public.delete_webhook(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from public.webhook_endpoints where id = p_id and tenant_id = public.current_tenant_id();
end;
$$;

create or replace function public.set_webhook_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.webhook_endpoints set active = p_active, consecutive_failures = case when p_active then 0 else consecutive_failures end
  where id = p_id and tenant_id = public.current_tenant_id();
end;
$$;

-- Sends a harmless "ping" so the owner can check their receiver works.
create or replace function public.test_webhook(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  insert into public.webhook_deliveries (tenant_id, endpoint_id, event)
  select tenant_id, id, 'ping' from public.webhook_endpoints where id = p_id and tenant_id = public.current_tenant_id();
end;
$$;

-- Queue an event for every active endpoint that listens for it. Never allowed
-- to break the order/payment write that triggered it.
create or replace function public.enqueue_webhook(p_tenant uuid, p_event text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_deliveries (tenant_id, endpoint_id, event, ref_id)
  select p_tenant, e.id, p_event, p_ref from public.webhook_endpoints e
  where e.tenant_id = p_tenant and e.active and p_event = any(e.events);
exception when others then
  null;
end;
$$;
revoke execute on function public.enqueue_webhook(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.trg_webhook_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_webhook(new.tenant_id, 'order.created', new.id);
  else
    if new.order_status is distinct from old.order_status then
      perform public.enqueue_webhook(new.tenant_id, 'order.status_changed', new.id);
    end if;
    if new.payment_status in ('paid', 'cash_received', 'reconciled') and old.payment_status not in ('paid', 'cash_received', 'reconciled') then
      perform public.enqueue_webhook(new.tenant_id, 'order.paid', new.id);
    end if;
  end if;
  return null;
end;
$$;
create trigger orders_webhooks after insert or update of order_status, payment_status on public.orders
  for each row execute function public.trg_webhook_orders();

create or replace function public.trg_webhook_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'cash_received', 'reconciled') then
    perform public.enqueue_webhook(new.tenant_id, 'payment.recorded', new.id);
  end if;
  return null;
end;
$$;
create trigger payments_webhooks after insert on public.payments
  for each row execute function public.trg_webhook_payments();

-- Payload for one delivery, built at send time so it reflects the order's
-- state when it is actually delivered (items are inserted just after the order).
create or replace function public.webhook_payload(p_event text, p_ref uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_event = 'ping' then
    return jsonb_build_object('message', 'Test event from BlinkRest');
  elsif p_event like 'order.%' then
    return jsonb_build_object('order', public.api_order_json(p_ref));
  elsif p_event = 'payment.recorded' then
    return (select jsonb_build_object('payment', jsonb_build_object(
        'id', p.id, 'order_id', p.order_id, 'order_number', o.order_number, 'method', p.method,
        'amount_minor', p.amount_minor, 'currency', p.currency, 'status', p.status, 'created_at', p.created_at))
      from public.payments p join public.orders o on o.id = p.order_id where p.id = p_ref);
  end if;
  return '{}'::jsonb;
end;
$$;
revoke execute on function public.webhook_payload(text, uuid) from public, anon, authenticated;

-- Worker interface (service role only): take due deliveries, then report back.
create or replace function public.claim_webhook_deliveries(p_limit integer default 25)
returns table (id uuid, event text, url text, secret text, payload jsonb, attempts integer, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select d.id from public.webhook_deliveries d
    join public.webhook_endpoints e on e.id = d.endpoint_id and e.active
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit p_limit
    for update of d skip locked
  ), claimed as (
    update public.webhook_deliveries d set next_attempt_at = now() + interval '3 minutes'
    from due where d.id = due.id
    returning d.id, d.event, d.endpoint_id, d.ref_id, d.attempts, d.created_at
  )
  select c.id, c.event, e.url, e.secret, public.webhook_payload(c.event, c.ref_id), c.attempts, c.created_at
  from claimed c join public.webhook_endpoints e on e.id = c.endpoint_id;
end;
$$;

create or replace function public.finish_webhook_delivery(p_id uuid, p_ok boolean, p_code integer, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
  v_attempts integer;
  v_backoff interval[] := array['1 minute', '5 minutes', '30 minutes', '2 hours', '6 hours']::interval[];
begin
  select * into d from public.webhook_deliveries where id = p_id;
  if d.id is null then return; end if;
  v_attempts := d.attempts + 1;
  if p_ok then
    update public.webhook_deliveries set status = 'delivered', attempts = v_attempts, last_code = p_code, last_error = null, delivered_at = now() where id = p_id;
    update public.webhook_endpoints set consecutive_failures = 0, last_success_at = now() where id = d.endpoint_id;
  else
    update public.webhook_deliveries
    set attempts = v_attempts, last_code = p_code, last_error = left(p_error, 300),
        status = case when v_attempts >= 6 then 'failed' else 'pending' end,
        next_attempt_at = now() + v_backoff[least(v_attempts, 5)]
    where id = p_id;
    update public.webhook_endpoints
    set consecutive_failures = consecutive_failures + 1, last_failure_at = now(),
        active = case when consecutive_failures + 1 >= 25 then false else active end
    where id = d.endpoint_id;
  end if;
end;
$$;
revoke execute on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
revoke execute on function public.finish_webhook_delivery(uuid, boolean, integer, text) from public, anon, authenticated;

-- Wake the dispatcher: immediately on a new delivery, and every minute for retries.
create or replace function public.kick_webhooks()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select value into v_url from public.app_config where key = 'webhook_dispatch_url';
  select value into v_key from public.app_config where key = 'service_role_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key), body := '{}'::jsonb);
end;
$$;
revoke execute on function public.kick_webhooks() from public, anon, authenticated;

create or replace function public.trg_kick_webhooks()
returns trigger
language plpgsql
as $$
begin
  perform public.kick_webhooks();
  return null;
end;
$$;
create trigger webhook_deliveries_kick after insert on public.webhook_deliveries
  for each statement execute function public.trg_kick_webhooks();

select cron.schedule('webhook-retries', '* * * * *',
  $$select public.kick_webhooks() where exists (select 1 from public.webhook_deliveries where status = 'pending' and next_attempt_at <= now())$$);
select cron.schedule('webhook-cleanup', '15 3 * * *',
  $$delete from public.webhook_deliveries where created_at < now() - interval '14 days'$$);

-- Statement-level triggers need transition-free access to the new rows only
-- through the table, so make sure the worker sees them.
insert into public.app_config (key, value)
select 'webhook_dispatch_url', replace(value, 'send-push', 'webhook-dispatch') from public.app_config where key = 'send_push_url'
on conflict (key) do update set value = excluded.value;

grant execute on function public.create_api_key(text, text[]) to authenticated;
grant execute on function public.revoke_api_key(uuid) to authenticated;
grant execute on function public.create_webhook(text, text[]) to authenticated;
grant execute on function public.delete_webhook(uuid) to authenticated;
grant execute on function public.set_webhook_active(uuid, boolean) to authenticated;
grant execute on function public.test_webhook(uuid) to authenticated;
revoke execute on function public.create_api_key(text, text[]) from public, anon;
revoke execute on function public.revoke_api_key(uuid) from public, anon;
revoke execute on function public.create_webhook(text, text[]) from public, anon;
revoke execute on function public.delete_webhook(uuid) from public, anon;
revoke execute on function public.set_webhook_active(uuid, boolean) from public, anon;
revoke execute on function public.test_webhook(uuid) from public, anon;
