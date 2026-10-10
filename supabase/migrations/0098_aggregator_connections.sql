-- Zomato / Swiggy through an aggregator API partner (Dyno), set up per
-- restaurant on request. A restaurant asks for the integration; BlinkRest sets
-- it up with the partner and switches it on; the partner then posts orders to
-- the restaurant's private inbound address, where they are stored safely.

create table public.aggregator_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null default 'dyno' check (provider in ('dyno')),
  channels text[] not null check (channels <> '{}' and channels <@ array['zomato', 'swiggy']),
  zomato_restaurant_id text,
  swiggy_restaurant_id text,
  contact_phone text,
  status text not null default 'requested' check (status in ('requested', 'setting_up', 'active', 'paused', 'rejected')),
  status_note text,
  inbound_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  credentials jsonb,                        -- partner API credentials, written by BlinkRest staff only
  requested_by uuid references public.tenant_memberships (id),
  requested_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (tenant_id, provider)
);
alter table public.aggregator_connections enable row level security;
revoke all on public.aggregator_connections from anon, authenticated;
grant select (id, tenant_id, provider, channels, zomato_restaurant_id, swiggy_restaurant_id, contact_phone, status, status_note, requested_at, activated_at)
  on public.aggregator_connections to authenticated;
create policy aggregator_connections_read on public.aggregator_connections for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
alter publication supabase_realtime add table public.aggregator_connections;

create table public.aggregator_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  connection_id uuid not null references public.aggregator_connections (id) on delete cascade,
  received_at timestamptz not null default now(),
  body jsonb,
  raw_body text,
  processed_at timestamptz,
  result text,                              -- 'order_created', 'ignored', 'error: ...'
  order_id uuid references public.orders (id) on delete set null
);
create index aggregator_inbox_conn_idx on public.aggregator_inbox (connection_id, received_at desc);
alter table public.aggregator_inbox enable row level security;
create policy aggregator_inbox_read on public.aggregator_inbox for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('settings.manage'));
select cron.schedule('aggregator-inbox-cleanup', '25 3 * * *', $$delete from public.aggregator_inbox where received_at < now() - interval '30 days'$$);

-- The restaurant asks for the integration.
create or replace function public.request_aggregator_integration(p_channels text[], p_zomato_id text, p_swiggy_id text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_name text;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_channels is null or p_channels = '{}' or not (p_channels <@ array['zomato', 'swiggy']) then
    raise exception 'pick_a_channel' using errcode = 'P0001';
  end if;
  if 'zomato' = any(p_channels) and nullif(trim(p_zomato_id), '') is null then
    raise exception 'zomato_id_required' using errcode = 'P0001';
  end if;
  if 'swiggy' = any(p_channels) and nullif(trim(p_swiggy_id), '') is null then
    raise exception 'swiggy_id_required' using errcode = 'P0001';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  insert into public.aggregator_connections (tenant_id, channels, zomato_restaurant_id, swiggy_restaurant_id, contact_phone, requested_by)
  values (v_tenant, p_channels,
          case when 'zomato' = any(p_channels) then trim(p_zomato_id) end,
          case when 'swiggy' = any(p_channels) then trim(p_swiggy_id) end,
          right(regexp_replace(p_phone, '\D', '', 'g'), 10), public.current_membership_id())
  on conflict (tenant_id, provider) do update
    set channels = excluded.channels, zomato_restaurant_id = excluded.zomato_restaurant_id, swiggy_restaurant_id = excluded.swiggy_restaurant_id,
        contact_phone = excluded.contact_phone, requested_at = now(),
        status = case when public.aggregator_connections.status in ('rejected', 'requested') then 'requested' else public.aggregator_connections.status end;

  select name into v_name from public.tenants where id = v_tenant;
  insert into public.notifications (tenant_id, category, icon, title, body, audience_roles)
  values (v_tenant, 'system', 'bell', 'Zomato / Swiggy integration requested',
          'We have your request for ' || array_to_string(p_channels, ' and ') || '. The BlinkRest team will contact you to complete the setup.', array['Manager']);
end;
$$;
revoke execute on function public.request_aggregator_integration(text[], text, text, text) from public, anon;
grant execute on function public.request_aggregator_integration(text[], text, text, text) to authenticated;

-- The restaurant can pause or resume an active integration.
create or replace function public.set_aggregator_paused(p_paused boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.aggregator_connections
  set status = case when p_paused then 'paused' else 'active' end
  where tenant_id = public.current_tenant_id() and status in ('active', 'paused');
end;
$$;
revoke execute on function public.set_aggregator_paused(boolean) from public, anon;
grant execute on function public.set_aggregator_paused(boolean) to authenticated;

-- Shown to the restaurant once setup has begun, so it can be pasted into the
-- partner's dashboard. Returns the secret only while setting up / active.
create or replace function public.aggregator_inbound_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select id, inbound_secret, status into c from public.aggregator_connections where tenant_id = public.current_tenant_id() and status in ('setting_up', 'active', 'paused');
  if c.id is null then return null; end if;
  return jsonb_build_object('connection_id', c.id, 'token', c.inbound_secret);
end;
$$;
revoke execute on function public.aggregator_inbound_info() from public, anon;
grant execute on function public.aggregator_inbound_info() to authenticated;

-- ── Operator (service role / SQL editor) ────────────────────────────────
-- select public.operator_set_aggregator('<tenant id>', 'setting_up', 'Waiting for Dyno approval', '{"api_key":"..."}');
create or replace function public.operator_set_aggregator(p_tenant uuid, p_status text, p_note text default null, p_credentials jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('requested', 'setting_up', 'active', 'paused', 'rejected') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update public.aggregator_connections
  set status = p_status, status_note = p_note, credentials = coalesce(p_credentials, credentials),
      activated_at = case when p_status = 'active' and activated_at is null then now() else activated_at end
  where tenant_id = p_tenant;
  if not found then
    raise exception 'connection_not_found' using errcode = 'P0001';
  end if;
  insert into public.notifications (tenant_id, category, icon, title, body, audience_roles)
  values (p_tenant, 'system', 'bell', 'Zomato / Swiggy integration: ' || replace(p_status, '_', ' '), coalesce(p_note, ''), array['Manager']);
end;
$$;
revoke execute on function public.operator_set_aggregator(uuid, text, text, jsonb) from public, anon, authenticated;
