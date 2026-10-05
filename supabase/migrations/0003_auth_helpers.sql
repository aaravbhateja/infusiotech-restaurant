-- Helper functions RLS policies rely on, plus the auth.users -> public.users sync trigger.

-- Mirror new auth identities into public.users so profile fields have somewhere to live.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, phone, email)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- The caller's single active tenant (MVP: one active membership per user).
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.tenant_memberships
  where user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- The caller's active membership row.
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
  limit 1;
$$;

-- Effective permission check: role grant, minus an explicit deny override,
-- plus any explicit grant override. Deny always wins over role defaults.
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
        and p.key = perm_key
        and o.effect = 'grant'
    );
$$;

comment on function public.has_permission(text) is
  'Effective permission for the caller''s active membership: role default, with deny overrides removing it and grant overrides adding it. Deny beats the role default; grant only adds what the role lacks.';

-- All effective permission keys for the caller in one round trip (role
-- defaults minus deny overrides, plus grant overrides). Used by clients to
-- build role-aware navigation; the server still enforces has_permission()
-- on every protected write.
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
    and o.effect = 'grant';
$$;
