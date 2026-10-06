-- A phone's Expo push token identifies the device, not a person. Signing in
-- as several accounts on one phone left one device_push_tokens row per
-- membership, so send-push (which sends to every row in a tenant) delivered
-- the same notification to that phone twice, and a signed-out account kept
-- receiving pushes. A token now belongs to exactly one membership: the most
-- recent one to register it.

delete from public.device_push_tokens d
using public.device_push_tokens newer
where d.expo_push_token = newer.expo_push_token
  and (d.created_at, d.id) < (newer.created_at, newer.id);

create unique index if not exists device_push_tokens_one_owner_idx
  on public.device_push_tokens (expo_push_token);

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

  delete from public.device_push_tokens
  where expo_push_token = p_expo_push_token and membership_id <> v_membership_id;

  insert into public.device_push_tokens (tenant_id, membership_id, expo_push_token, platform)
  values (public.current_tenant_id(), v_membership_id, p_expo_push_token, p_platform)
  on conflict (expo_push_token) do update
    set tenant_id = excluded.tenant_id,
        membership_id = excluded.membership_id,
        platform = excluded.platform;
end;
$$;

-- Called on sign-out so a logged-out phone stops receiving this account's pushes.
create or replace function public.unregister_push_token(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.device_push_tokens
  where expo_push_token = p_expo_push_token
    and membership_id in (select id from public.tenant_memberships where user_id = auth.uid());
end;
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;
