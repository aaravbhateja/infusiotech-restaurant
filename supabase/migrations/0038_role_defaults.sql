-- Two problems found while auditing role defaults:
--
-- 1. seed.sql grants Owner "every permission" but only runs once, at initial
--    setup. Every later migration that added a new permission key for other
--    roles (0012's orders.create/orders.discount/tables.assign/offers.manage/
--    reviews.reply) never re-granted it to Owner, so Owner silently lost
--    access to Offers, Reviews, taking orders, discounts, and seating
--    guests. Backfilled here, and a trigger now keeps it true forever: any
--    permission inserted from now on is automatically granted to Owner.
--
-- 2. There was no way for an Owner to edit a ROLE's default permissions —
--    only per-person overrides (user_permission_overrides) existed. Editing
--    the global system role templates directly would leak across every
--    tenant, so the first time an Owner customises a role for their
--    restaurant, we clone it into a tenant-scoped role (same name, same
--    starting permissions) and repoint that tenant's memberships/pending
--    invitations onto the clone — invisible to the Owner, who just sees
--    "Waiter" with different toggles.

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000001', p.id
from public.permissions p
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = '00000000-0000-0000-0000-000000000001' and rp.permission_id = p.id
);

create or replace function public.grant_new_permission_to_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.role_permissions (role_id, permission_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists grant_new_permission_to_owner_trigger on public.permissions;
create trigger grant_new_permission_to_owner_trigger
  after insert on public.permissions
  for each row execute function public.grant_new_permission_to_owner();

-- Permission keys a non-Owner role template may never hold, matching the
-- guardrail already enforced in the per-membership override editor.
create or replace function public.role_locked_permission_keys()
returns text[]
language sql
immutable
as $$
  select array['staff.manage', 'settings.manage', 'subscription.manage', 'ownership.transfer'];
$$;

-- Resolves which role id a tenant should actually use for a given system
-- role name: its own customised clone if one exists, else the shared
-- system template.
create or replace function public.resolve_role_id(p_role_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from public.roles where tenant_id = public.current_tenant_id() and name = p_role_name),
    (select id from public.roles where tenant_id is null and name = p_role_name)
  );
$$;

-- One row per assignable role name (never Owner) for the current tenant,
-- with the id staff.invite/staff.manage screens should actually use.
create or replace function public.get_role_catalog()
returns table (role_name text, role_id uuid, is_customized boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.name, public.resolve_role_id(r.name), exists (
    select 1 from public.roles tr where tr.tenant_id = public.current_tenant_id() and tr.name = r.name
  )
  from public.roles r
  where r.tenant_id is null and r.name <> 'Owner'
  order by r.name;
$$;

create or replace function public.get_role_default_permissions(p_role_name text)
returns table (key text, description text, granted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if not public.has_permission('staff.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  v_role_id := public.resolve_role_id(p_role_name);
  if v_role_id is null then
    raise exception 'role_not_found' using errcode = 'P0001';
  end if;

  return query
  select p.key, p.description, exists (
    select 1 from public.role_permissions rp where rp.role_id = v_role_id and rp.permission_id = p.id
  )
  from public.permissions p
  where not (p.key = any (public.role_locked_permission_keys()))
  order by p.key;
end;
$$;

create or replace function public.set_role_default_permissions(p_role_name text, p_permission_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_system_role_id uuid;
  v_tenant_role_id uuid;
begin
  if not public.has_permission('staff.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_role_name = 'Owner' then
    raise exception 'cannot_edit_owner_defaults' using errcode = 'P0001';
  end if;

  select id into v_system_role_id from public.roles where tenant_id is null and name = p_role_name;
  if v_system_role_id is null then
    raise exception 'role_not_found' using errcode = 'P0001';
  end if;

  select id into v_tenant_role_id from public.roles where tenant_id = public.current_tenant_id() and name = p_role_name;

  if v_tenant_role_id is null then
    insert into public.roles (tenant_id, name, is_system_role)
    values (public.current_tenant_id(), p_role_name, false)
    returning id into v_tenant_role_id;

    update public.tenant_memberships
    set role_id = v_tenant_role_id
    where tenant_id = public.current_tenant_id() and role_id = v_system_role_id;

    update public.staff_invitations
    set role_id = v_tenant_role_id
    where tenant_id = public.current_tenant_id() and status = 'pending' and role_id = v_system_role_id;
  end if;

  delete from public.role_permissions where role_id = v_tenant_role_id;

  insert into public.role_permissions (role_id, permission_id)
  select v_tenant_role_id, p.id
  from public.permissions p
  where p.key = any (p_permission_keys)
    and not (p.key = any (public.role_locked_permission_keys()));
end;
$$;

revoke execute on function public.get_role_catalog() from public, anon;
grant execute on function public.get_role_catalog() to authenticated;
revoke execute on function public.get_role_default_permissions(text) from public, anon;
grant execute on function public.get_role_default_permissions(text) to authenticated;
revoke execute on function public.set_role_default_permissions(text, text[]) from public, anon;
grant execute on function public.set_role_default_permissions(text, text[]) to authenticated;
