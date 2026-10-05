-- Multi-restaurant support: a user may now hold an active membership in
-- more than one tenant at once (e.g. an Owner who runs two restaurants, or
-- someone who staffs at one place and owns another) and picks which one to
-- manage via the new restaurant switcher. The only remaining invariant is
-- "not already active in THIS SAME tenant twice".

drop index if exists public.tenant_memberships_one_active_per_user;

create unique index tenant_memberships_one_active_per_tenant
  on public.tenant_memberships (user_id, tenant_id)
  where status = 'active';

-- Both onboarding paths used to hard-block a second restaurant; now they
-- only block re-joining the SAME tenant you're already active in.
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

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', p_slug);
end;
$$;

comment on function public.create_tenant_and_owner(text, text) is
  'Onboarding entry point: the signed-in caller becomes Owner of a brand-new tenant. A user may own/staff multiple tenants; the unique index only blocks a duplicate active membership in the SAME tenant.';

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

  return jsonb_build_object('tenant_id', v_invitation.tenant_id);
end;
$$;

comment on function public.accept_staff_invitation(text) is
  'Staff activation: hashes the raw invitation token, validates it is pending and unexpired, and creates the membership. Fails only if the caller is already active in THIS tenant — multiple tenants across different invites are allowed.';

-- Lets the client fetch the full list of a user's active restaurants (name,
-- role, logo) for the switcher, without relying on RLS to scope "my own"
-- rows differently per caller — this always returns exactly the caller's own.
create or replace function public.my_memberships()
returns table (
  membership_id uuid,
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  role_name text,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select tm.id, t.id, t.name, t.slug, r.name, tm.joined_at
  from public.tenant_memberships tm
  join public.tenants t on t.id = tm.tenant_id
  join public.roles r on r.id = tm.role_id
  where tm.user_id = auth.uid() and tm.status = 'active'
  order by tm.joined_at desc;
$$;

revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;
