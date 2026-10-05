-- current_tenant_id() previously did "limit 1" with no ordering over the
-- caller's active memberships — harmless when a user could only ever have
-- one, but now that 0021 allows several, that made every RLS check and
-- permission lookup resolve to an ARBITRARY one of them. Every policy in
-- the schema depends on this function, so it must resolve unambiguously:
-- it now reads the user's explicitly selected restaurant instead.

alter table public.users add column active_tenant_id uuid references public.tenants (id) on delete set null;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select active_tenant_id from public.users where id = auth.uid();
$$;

-- Same "limit 1, no ordering" hazard as current_tenant_id() — now resolves
-- the membership row for the user's actively-selected tenant specifically.
create or replace function public.current_membership_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.tenant_memberships
  where user_id = auth.uid()
    and status = 'active'
    and tenant_id = public.current_tenant_id();
$$;

-- The only sanctioned way to change which restaurant a session acts as —
-- verifies the caller actually holds an active membership there first, so
-- setting this can never grant access current_tenant_id() + has_permission()
-- wouldn't already allow.
create or replace function public.set_active_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.tenant_memberships
    where user_id = auth.uid() and tenant_id = p_tenant_id and status = 'active'
  ) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  update public.users set active_tenant_id = p_tenant_id where id = auth.uid();
end;
$$;

revoke execute on function public.set_active_tenant(uuid) from public, anon;
grant execute on function public.set_active_tenant(uuid) to authenticated;

-- Onboarding/invite acceptance both need the brand-new membership to become
-- the active one immediately — otherwise a user with an existing restaurant
-- who creates/joins a second one would stay scoped to the first.
create or replace function public.create_tenant_and_owner(
  p_name text,
  p_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_owner_role_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  insert into public.tenants (name, slug)
  values (p_name, p_slug)
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role_id, status, invited_by)
  values (v_tenant_id, auth.uid(), v_owner_role_id, 'active', auth.uid());

  insert into public.subscriptions (tenant_id, plan_id, status)
  select v_tenant_id, id, 'trialing' from public.plans where key = 'starter';

  update public.users set active_tenant_id = v_tenant_id where id = auth.uid();

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', p_slug);
end;
$$;

create or replace function public.accept_staff_invitation(
  p_raw_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation record;
  v_token_hash text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  select * into v_invitation
  from public.staff_invitations
  where token_hash = v_token_hash
    and status = 'pending'
    and expires_at > now();

  if v_invitation.id is null then
    raise exception 'invalid_or_expired_invitation' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.tenant_memberships
    where user_id = auth.uid() and tenant_id = v_invitation.tenant_id and status = 'active'
  ) then
    raise exception 'already_has_active_membership' using errcode = 'P0001';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role_id, status, invited_by)
  values (v_invitation.tenant_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by);

  update public.staff_invitations
  set status = 'accepted'
  where id = v_invitation.id;

  update public.users set active_tenant_id = v_invitation.tenant_id where id = auth.uid();

  return jsonb_build_object('tenant_id', v_invitation.tenant_id);
end;
$$;

-- has_permission()/my_permissions() checked "any active membership this
-- user holds anywhere", which was equivalent to "their one membership"
-- when that was the only kind there was. With several active memberships
-- now possible, that union-across-tenants became a real privilege
-- escalation: a Waiter at one restaurant who also owns another would get
-- Owner-level permissions everywhere. Both now scope to current_tenant_id().
create or replace function public.has_permission(perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.tenant_memberships m
      join public.role_permissions rp on rp.role_id = m.role_id
      join public.permissions p on p.id = rp.permission_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.tenant_id = public.current_tenant_id()
        and p.key = perm_key
        and not exists (
          select 1
          from public.user_permission_overrides o
          join public.permissions p2 on p2.id = o.permission_id
          where o.membership_id = m.id
            and p2.key = perm_key
            and o.effect = 'deny'
        )
    )
    or exists (
      select 1
      from public.tenant_memberships m
      join public.user_permission_overrides o on o.membership_id = m.id
      join public.permissions p on p.id = o.permission_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.tenant_id = public.current_tenant_id()
        and p.key = perm_key
        and o.effect = 'grant'
    );
$$;

create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select p.key
  from public.tenant_memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions p on p.id = rp.permission_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.tenant_id = public.current_tenant_id()
    and not exists (
      select 1
      from public.user_permission_overrides o
      join public.permissions p2 on p2.id = o.permission_id
      where o.membership_id = m.id and p2.key = p.key and o.effect = 'deny'
    )
  union
  select p.key
  from public.tenant_memberships m
  join public.user_permission_overrides o on o.membership_id = m.id
  join public.permissions p on p.id = o.permission_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.tenant_id = public.current_tenant_id()
    and o.effect = 'grant';
$$;

-- Backfill: every existing user currently has at most one active
-- membership (pre-0021), so this is unambiguous and keeps everyone working
-- exactly as before without needing to re-select anything.
update public.users u
set active_tenant_id = tm.tenant_id
from public.tenant_memberships tm
where tm.user_id = u.id and tm.status = 'active' and u.active_tenant_id is null;
