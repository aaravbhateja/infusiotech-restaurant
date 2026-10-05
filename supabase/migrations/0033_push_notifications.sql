-- Real push notifications: a device token table, a trigger that fires on
-- every notifications insert (the single choke point every event already
-- goes through — new orders, discount requests, call-waiter, etc.) and
-- relays it via pg_net to a send-push edge function, which calls Expo's
-- push API. No code path needs to remember to "also send a push" — it's
-- automatic the moment a notification row exists.

create extension if not exists pg_net with schema extensions;

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  unique (membership_id, expo_push_token)
);

create index device_push_tokens_tenant_id_idx on public.device_push_tokens (tenant_id);

alter table public.device_push_tokens enable row level security;

create policy device_push_tokens_self on public.device_push_tokens
  for all to authenticated
  using (membership_id = public.current_membership_id())
  with check (membership_id = public.current_membership_id());

create or replace function public.register_push_token(p_expo_push_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
begin
  v_membership_id := public.current_membership_id();
  if v_membership_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.device_push_tokens (tenant_id, membership_id, expo_push_token, platform)
  values (public.current_tenant_id(), v_membership_id, p_expo_push_token, p_platform)
  on conflict (membership_id, expo_push_token) do nothing;
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Config for the trigger to reach the edge function — set once via
-- `supabase secrets set` is for Edge Functions only, Postgres needs its own
-- settings table entry (service role key must never live in a migration
-- file in plain text, so it's set separately via an UPDATE after deploy).
create table public.app_config (key text primary key, value text not null);

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
    return new; -- not configured yet; never block the notification insert itself
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
    body := jsonb_build_object('notification_id', new.id, 'tenant_id', new.tenant_id, 'title', new.title, 'body', new.body)
  );

  return new;
end;
$$;

create trigger notifications_push_trigger
  after insert on public.notifications
  for each row execute function public.notify_push_on_insert();
