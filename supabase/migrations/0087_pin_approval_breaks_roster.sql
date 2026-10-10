-- Staff security and time: manager PIN approval for sensitive actions at the
-- counter, breaks + attendance hours, and a weekly roster.

-- ── Approval PIN ────────────────────────────────────────────────────────
create table public.approval_pins (
  membership_id uuid primary key references public.tenant_memberships (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  pin_hash text not null,
  set_at timestamptz not null default now()
);
create table public.pin_attempts (
  membership_id uuid primary key references public.tenant_memberships (id) on delete cascade,
  failed int not null default 0,
  locked_until timestamptz
);
-- Neither table is readable or writable from clients.
alter table public.approval_pins enable row level security;
alter table public.pin_attempts enable row level security;

create or replace function public.membership_has_permission(p_membership uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.tenant_memberships m
      join public.role_permissions rp on rp.role_id = m.role_id
      join public.permissions p on p.id = rp.permission_id
      where m.id = p_membership and m.status = 'active' and p.key = p_key
        and not exists (
          select 1 from public.user_permission_overrides o join public.permissions p2 on p2.id = o.permission_id
          where o.membership_id = m.id and p2.key = p_key and o.effect = 'deny')
    )
    or exists (
      select 1 from public.tenant_memberships m
      join public.user_permission_overrides o on o.membership_id = m.id
      join public.permissions p on p.id = o.permission_id
      where m.id = p_membership and m.status = 'active' and p.key = p_key and o.effect = 'grant'
    );
$$;
revoke execute on function public.membership_has_permission(uuid, text) from public, anon, authenticated;

create or replace function public.set_approval_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_membership_id();
begin
  if v_me is null or not (public.has_permission('orders.void') or public.has_permission('payments.refund')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'invalid_pin' using errcode = 'P0001';
  end if;
  insert into public.approval_pins (membership_id, tenant_id, pin_hash)
  values (v_me, public.current_tenant_id(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (membership_id) do update set pin_hash = excluded.pin_hash, set_at = now();
  delete from public.pin_attempts where membership_id = v_me;
end;
$$;
revoke execute on function public.set_approval_pin(text) from public, anon;
grant execute on function public.set_approval_pin(text) to authenticated;

create or replace function public.has_approval_pin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.approval_pins where membership_id = public.current_membership_id());
$$;
revoke execute on function public.has_approval_pin() from public, anon;
grant execute on function public.has_approval_pin() to authenticated;

-- Which approver (in this restaurant, holding p_permission) owns this PIN?
-- Five wrong PINs in a row lock the person trying for 10 minutes. Returns null
-- on a wrong PIN (and sets p_locked) rather than raising, because raising would
-- roll back the failed-attempt counter and defeat the lockout.
create or replace function public.verify_approval_pin(p_pin text, p_permission text, out p_approver uuid, out p_locked boolean)
returns record
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_membership_id();
  v_att record;
begin
  p_locked := false;
  p_approver := null;
  if v_me is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_att from public.pin_attempts where membership_id = v_me;
  if v_att.locked_until is not null and v_att.locked_until > now() then
    p_locked := true;
    return;
  end if;

  select ap.membership_id into p_approver
  from public.approval_pins ap
  where ap.tenant_id = public.current_tenant_id()
    and ap.membership_id <> v_me
    and ap.pin_hash = extensions.crypt(p_pin, ap.pin_hash)
    and public.membership_has_permission(ap.membership_id, p_permission)
  limit 1;

  if p_approver is null then
    insert into public.pin_attempts (membership_id, failed, locked_until)
    values (v_me, 1, null)
    on conflict (membership_id) do update
      set failed = case when public.pin_attempts.failed + 1 >= 5 then 0 else public.pin_attempts.failed + 1 end,
          locked_until = case when public.pin_attempts.failed + 1 >= 5 then now() + interval '10 minutes' else null end;
    return;
  end if;

  delete from public.pin_attempts where membership_id = v_me;
end;
$$;
revoke execute on function public.verify_approval_pin(text, text) from public, anon, authenticated;

create or replace function public.void_order_item_with_pin(p_item_id uuid, p_reason text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approver uuid;
  v_locked boolean;
begin
  if not public.has_permission('orders.edit') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select p_approver, p_locked into v_approver, v_locked from public.verify_approval_pin(p_pin, 'orders.void');
  if v_locked then
    return jsonb_build_object('ok', false, 'error', 'pin_locked');
  elsif v_approver is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;
  perform public.apply_void_item(p_item_id, trim(p_reason), v_approver);
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (public.current_tenant_id(), auth.uid(), 'order.void_pin_approved', 'order_items', p_item_id, jsonb_build_object('approved_by', v_approver));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.refund_payment_with_pin(p_payment_id uuid, p_reason text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approver uuid;
  v_locked boolean;
begin
  if not (public.has_permission('payments.cash.record') or public.has_permission('payments.view')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select p_approver, p_locked into v_approver, v_locked from public.verify_approval_pin(p_pin, 'payments.refund');
  if v_locked then
    return jsonb_build_object('ok', false, 'error', 'pin_locked');
  elsif v_approver is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;
  perform public.apply_refund(p_payment_id, null, trim(p_reason));
  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (public.current_tenant_id(), auth.uid(), 'payment.refund_pin_approved', 'payments', p_payment_id, jsonb_build_object('approved_by', v_approver));
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.void_order_item_with_pin(uuid, text, text) from public, anon;
revoke execute on function public.refund_payment_with_pin(uuid, text, text) from public, anon;
grant execute on function public.void_order_item_with_pin(uuid, text, text) to authenticated;
grant execute on function public.refund_payment_with_pin(uuid, text, text) to authenticated;

-- ── Breaks and attendance ───────────────────────────────────────────────
create table public.shift_breaks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  shift_id uuid not null references public.staff_shifts (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index shift_breaks_one_open on public.shift_breaks (membership_id) where ended_at is null;
alter table public.shift_breaks enable row level security;
create policy shift_breaks_read on public.shift_breaks for select to authenticated
  using (membership_id = public.current_membership_id() or (tenant_id = public.current_tenant_id() and public.has_permission('staff.view')));

create or replace function public.start_break()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_membership_id();
  v_shift uuid;
begin
  select id into v_shift from public.staff_shifts where membership_id = v_me and ended_at is null;
  if v_shift is null then
    raise exception 'no_open_shift' using errcode = 'P0001';
  end if;
  insert into public.shift_breaks (tenant_id, membership_id, shift_id)
  values (public.current_tenant_id(), v_me, v_shift) on conflict do nothing;
end;
$$;

create or replace function public.end_break()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shift_breaks set ended_at = now() where membership_id = public.current_membership_id() and ended_at is null;
end;
$$;

-- Ending a shift also ends any break still running.
create or replace function public.trg_shift_end_closes_break()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ended_at is not null and old.ended_at is null then
    update public.shift_breaks set ended_at = new.ended_at where shift_id = new.id and ended_at is null;
  end if;
  return null;
end;
$$;
create trigger staff_shifts_close_break after update on public.staff_shifts
  for each row execute function public.trg_shift_end_closes_break();

revoke execute on function public.start_break() from public, anon;
revoke execute on function public.end_break() from public, anon;
grant execute on function public.start_break() to authenticated;
grant execute on function public.end_break() to authenticated;

create or replace function public.attendance_report(p_from date, p_to date)
returns table (name text, role text, days_worked bigint, shifts bigint, worked_minutes numeric, break_minutes numeric, net_minutes numeric, on_shift_now boolean)
language sql
stable
security definer
set search_path = public
as $$
  with win as (
    select (p_from::timestamp at time zone 'Asia/Kolkata') as f, ((p_to + 1)::timestamp at time zone 'Asia/Kolkata') as t
  ),
  sh as (
    select s.membership_id, s.id, s.started_at, coalesce(s.ended_at, now()) as ended
    from public.staff_shifts s, win
    where s.tenant_id = public.current_tenant_id() and s.started_at >= win.f and s.started_at < win.t
  ),
  br as (
    select b.membership_id, sum(extract(epoch from (coalesce(b.ended_at, now()) - b.started_at)) / 60.0) as mins
    from public.shift_breaks b join sh on sh.id = b.shift_id group by b.membership_id
  )
  select coalesce(u.display_name, u.email, 'Staff'), r.name,
         count(distinct (sh.started_at at time zone 'Asia/Kolkata')::date),
         count(sh.id),
         round(coalesce(sum(extract(epoch from (sh.ended - sh.started_at)) / 60.0), 0)::numeric, 0),
         round(coalesce(max(br.mins), 0)::numeric, 0),
         round((coalesce(sum(extract(epoch from (sh.ended - sh.started_at)) / 60.0), 0) - coalesce(max(br.mins), 0))::numeric, 0),
         exists (select 1 from public.staff_shifts s2 where s2.membership_id = m.id and s2.ended_at is null)
  from public.tenant_memberships m
  join public.users u on u.id = m.user_id
  join public.roles r on r.id = m.role_id
  left join sh on sh.membership_id = m.id
  left join br on br.membership_id = m.id
  where m.tenant_id = public.current_tenant_id() and m.status = 'active' and public.has_permission('staff.view')
  group by m.id, u.display_name, u.email, r.name
  order by 7 desc;
$$;
revoke execute on function public.attendance_report(date, date) from public, anon;
grant execute on function public.attendance_report(date, date) to authenticated;

-- ── Weekly roster ───────────────────────────────────────────────────────
create table public.roster_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  membership_id uuid not null references public.tenant_memberships (id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  note text,
  created_at timestamptz not null default now()
);
create index roster_shifts_tenant_date_idx on public.roster_shifts (tenant_id, shift_date);
alter table public.roster_shifts enable row level security;

create policy roster_read on public.roster_shifts for select to authenticated
  using (tenant_id = public.current_tenant_id() and (membership_id = public.current_membership_id() or public.has_permission('staff.view')));
create policy roster_write on public.roster_shifts for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('staff.manage'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('staff.manage'));
