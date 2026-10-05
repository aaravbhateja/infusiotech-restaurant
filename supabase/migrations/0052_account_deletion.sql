-- In-app account deletion (required by the App Store and Google Play for any
-- app that lets people create an account).
--
-- What deleting an account does:
--   * The person's login and profile are erased, along with everything that
--     hangs off their membership (push tokens, permission overrides, shifts).
--   * Business records they touched (orders, payments, audit events, offers,
--     support tickets…) are kept, with the person's reference blanked — a
--     restaurant's tax and accounting records can't vanish because one staff
--     member left.
--   * If they are the ONLY owner of a restaurant that has no other active
--     staff, that restaurant is closed with them: ordering stops, its QR
--     codes are revoked, the subscription is cancelled, and the personal
--     data it holds is erased (KYC/bank details, guest names/phones, pending
--     invitations). Order, payment and invoice records are retained.
--   * If they are the only owner of a restaurant that still has active
--     staff, deletion is refused until the team is removed — otherwise the
--     staff would lose their jobs' access without warning.

-- ── 1. Let a user be deleted without breaking the records that mention them ─
-- Every column referencing public.users used the default NO ACTION, so
-- deleting any user who had ever touched an order, offer, audit event or
-- invitation failed. Make those references null out instead. Done by
-- catalog scan so no referencing table is missed.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.users'::regclass
      and c.confdeltype = 'a'
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.users (id) on delete set null',
      r.tbl, r.conname, r.col
    );
  end loop;
end $$;

-- ── 2. Which restaurants does this user solely own? ─────────────────────────
-- Owner = the system Owner role (00…01), the same way the admin RPCs and
-- onboarding identify it. "Sole" = no other active Owner.
create or replace function public.account_sole_owned_tenants(p_user_id uuid)
returns table (tenant_id uuid, tenant_name text, other_active_members bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name,
         (select count(*) from public.tenant_memberships o
           where o.tenant_id = t.id and o.status = 'active' and o.user_id <> p_user_id)
  from public.tenants t
  join public.tenant_memberships m
    on m.tenant_id = t.id and m.user_id = p_user_id and m.status = 'active'
   and m.role_id = '00000000-0000-0000-0000-000000000001'
  where t.status <> 'closed'
    and not exists (
      select 1 from public.tenant_memberships m2
      where m2.tenant_id = t.id and m2.status = 'active'
        and m2.role_id = '00000000-0000-0000-0000-000000000001'
        and m2.user_id <> p_user_id
    );
$$;

revoke execute on function public.account_sole_owned_tenants(uuid) from public, anon, authenticated;

-- What the delete screen shows before the person confirms.
create or replace function public.get_account_deletion_impact()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'is_super_admin', coalesce((select is_super_admin from public.users where id = v_uid), false),
    'closes_restaurants', coalesce(
      (select jsonb_agg(tenant_name order by tenant_name)
         from public.account_sole_owned_tenants(v_uid) where other_active_members = 0),
      '[]'::jsonb),
    'blocked_by', coalesce(
      (select jsonb_agg(tenant_name order by tenant_name)
         from public.account_sole_owned_tenants(v_uid) where other_active_members > 0),
      '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_account_deletion_impact() from public, anon;
grant execute on function public.get_account_deletion_impact() to authenticated;

-- ── 3. The deletion itself — one transaction, all or nothing ───────────────
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_blocking text;
  v_t record;
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_confirm is distinct from 'DELETE' then
    raise exception 'confirmation_required' using errcode = 'P0001';
  end if;

  if coalesce((select is_super_admin from public.users where id = v_uid), false) then
    raise exception 'super_admin_cannot_delete' using errcode = 'P0001';
  end if;

  -- Refuse before changing anything.
  select tenant_name into v_blocking
  from public.account_sole_owned_tenants(v_uid)
  where other_active_members > 0
  order by tenant_name
  limit 1;

  if v_blocking is not null then
    raise exception 'owner_has_team: %', v_blocking using errcode = 'P0001';
  end if;

  -- Close each restaurant this person solely owns (none has other staff).
  for v_t in select tenant_id from public.account_sole_owned_tenants(v_uid)
  loop
    update public.tenants
    set status = 'closed',
        pay_online_enabled = false,
        settings = coalesce(settings, '{}'::jsonb) || '{"accepting_orders": false}'::jsonb
    where id = v_t.tenant_id;

    -- Stop the public QR codes working.
    update public.qr_assets set status = 'revoked' where tenant_id = v_t.tenant_id;

    update public.subscriptions set status = 'canceled' where tenant_id = v_t.tenant_id;

    -- Personal and financial identity data the restaurant held.
    delete from public.tenant_kyc where tenant_id = v_t.tenant_id;
    delete from public.staff_invitations where tenant_id = v_t.tenant_id;

    -- Guests' contact details. Their orders and the restaurant's sales
    -- records stay (tax/accounting), just no longer tied to a named person.
    update public.customers
    set name = null, phone = null, email = null, staff_notes = null, consent_marketing = false
    where tenant_id = v_t.tenant_id;
    update public.reviews set customer_name = null where tenant_id = v_t.tenant_id;

    insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
    values (v_t.tenant_id, null, 'tenant.closed_by_account_deletion', 'tenants', v_t.tenant_id);
  end loop;

  -- Removing the login cascades to public.users, then to their memberships
  -- and everything keyed on them (push tokens, overrides, shifts); the
  -- references from business records were made ON DELETE SET NULL above.
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
