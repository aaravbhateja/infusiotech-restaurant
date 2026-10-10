-- Menu control: time-based availability ("breakfast 7-11"), scheduled pricing
-- (happy hour), price-change approval and version history with undo.
--
-- Design: menu_items.price_minor / is_available stay the single "right now"
-- values every screen and order function already reads. A job re-evaluates
-- them every minute from the permanent values:
--   base_price_minor   the real price (what staff edit)
--   manual_available   the stock switch (what staff toggle)
-- is_available = manual_available AND inside the item's/category's hours.
-- price_minor      = lowest matching price rule, else base_price_minor.

alter table public.menu_items
  add column base_price_minor bigint,
  add column manual_available boolean;
update public.menu_items set base_price_minor = price_minor, manual_available = is_available;
alter table public.menu_items alter column base_price_minor set not null;
alter table public.menu_items alter column manual_available set not null;
alter table public.menu_items alter column manual_available set default true;

create table public.menu_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  category_id uuid references public.menu_categories (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete cascade,
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((category_id is not null)::int + (menu_item_id is not null)::int = 1)
);

create table public.price_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  scope text not null default 'all' check (scope in ('all', 'category', 'item')),
  category_ids uuid[] not null default '{}',
  item_ids uuid[] not null default '{}',
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  start_time time not null,
  end_time time not null,
  kind text not null check (kind in ('percent_off', 'fixed_price')),
  value_percent numeric(5, 2) check (value_percent is null or (value_percent > 0 and value_percent < 100)),
  value_minor bigint check (value_minor is null or value_minor >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'percent_off' and value_percent is not null) or (kind = 'fixed_price' and value_minor is not null))
);

create table public.menu_item_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.users (id),
  old_name text, new_name text,
  old_description text, new_description text,
  old_price_minor bigint, new_price_minor bigint
);
create index menu_item_history_item_idx on public.menu_item_history (menu_item_id, changed_at desc);

alter table public.menu_schedules enable row level security;
alter table public.price_rules enable row level security;
alter table public.menu_item_history enable row level security;

create policy menu_schedules_read on public.menu_schedules for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.view'));
create policy menu_schedules_write on public.menu_schedules for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.edit'));

create policy price_rules_read on public.price_rules for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.view'));
create policy price_rules_write on public.price_rules for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.price.edit'))
  with check (tenant_id = public.current_tenant_id() and public.has_permission('menu.price.edit'));

create policy menu_item_history_read on public.menu_item_history for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('menu.view'));

-- Is p_ts inside the window (restaurant-local time, Asia/Kolkata)? Windows
-- that cross midnight (22:00-02:00) are supported.
create or replace function public.in_time_window(p_days smallint[], p_start time, p_end time, p_ts timestamptz)
returns boolean
language sql
immutable
as $$
  select case
    when p_start <= p_end then
      extract(dow from (p_ts at time zone 'Asia/Kolkata'))::smallint = any(p_days)
      and (p_ts at time zone 'Asia/Kolkata')::time >= p_start and (p_ts at time zone 'Asia/Kolkata')::time < p_end
    else
      (extract(dow from (p_ts at time zone 'Asia/Kolkata'))::smallint = any(p_days) and (p_ts at time zone 'Asia/Kolkata')::time >= p_start)
      or (extract(dow from ((p_ts - interval '1 day') at time zone 'Asia/Kolkata'))::smallint = any(p_days) and (p_ts at time zone 'Asia/Kolkata')::time < p_end)
  end;
$$;

create or replace function public.item_in_schedule(p_item uuid, p_category uuid, p_ts timestamptz)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from public.menu_schedules s
    where s.is_active and (s.menu_item_id = p_item or s.category_id = p_category)
  )
  or exists (
    select 1 from public.menu_schedules s
    where s.is_active and (s.menu_item_id = p_item or s.category_id = p_category)
      and public.in_time_window(s.days_of_week, s.start_time, s.end_time, p_ts)
  );
$$;

-- Guard + bookkeeping on every menu change made by a person (the scheduler
-- sets app.menu_job to bypass it).
create or replace function public.trg_menu_item_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.base_price_minor := new.price_minor;
    new.manual_available := new.is_available;
    return new;
  end if;

  if coalesce(current_setting('app.menu_job', true), '') = 'on' then
    return new;
  end if;

  -- Saving the form sends back the permanent price. If it matches, nothing
  -- is changing (the live price may just be a happy-hour price): leave the
  -- live price alone. Only a different value is a real price change.
  if new.price_minor is not distinct from old.base_price_minor then
    new.price_minor := old.price_minor;
  elsif new.price_minor is distinct from old.price_minor then
    if auth.uid() is not null and not public.has_permission('menu.price.edit') then
      raise exception 'price_change_requires_approval' using errcode = 'P0001';
    end if;
    new.base_price_minor := new.price_minor;
  end if;

  if new.is_available is distinct from old.is_available then
    new.manual_available := new.is_available;
    new.is_available := new.manual_available and public.item_in_schedule(new.id, new.category_id, now());
  end if;
  return new;
end;
$$;

create trigger menu_items_guard
  before insert or update on public.menu_items
  for each row execute function public.trg_menu_item_guard();

create or replace function public.trg_menu_item_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.menu_job', true), '') = 'on' then
    return null;
  end if;
  if new.name is distinct from old.name or new.description is distinct from old.description
     or new.base_price_minor is distinct from old.base_price_minor then
    insert into public.menu_item_history (tenant_id, menu_item_id, changed_by, old_name, new_name, old_description, new_description, old_price_minor, new_price_minor)
    values (new.tenant_id, new.id, auth.uid(), old.name, new.name, old.description, new.description, old.base_price_minor, new.base_price_minor);
  end if;
  return null;
end;
$$;

create trigger menu_items_history
  after update on public.menu_items
  for each row execute function public.trg_menu_item_history();

-- The scheduler: recompute availability and the live price.
create or replace function public.apply_menu_schedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  perform set_config('app.menu_job', 'on', true);
  with computed as (
    select mi.id,
           (mi.manual_available and public.item_in_schedule(mi.id, mi.category_id, now())) as avail,
           coalesce((
             select min(case pr.kind
                          when 'percent_off' then round(mi.base_price_minor * (1 - pr.value_percent / 100.0))
                          else pr.value_minor end)
             from public.price_rules pr
             where pr.tenant_id = mi.tenant_id and pr.is_active
               and public.in_time_window(pr.days_of_week, pr.start_time, pr.end_time, now())
               and (pr.scope = 'all'
                    or (pr.scope = 'category' and mi.category_id = any(pr.category_ids))
                    or (pr.scope = 'item' and mi.id = any(pr.item_ids)))
           ), mi.base_price_minor)::bigint as price
    from public.menu_items mi
  )
  update public.menu_items mi
  set is_available = c.avail, price_minor = c.price
  from computed c
  where c.id = mi.id and (mi.is_available is distinct from c.avail or mi.price_minor is distinct from c.price);
  get diagnostics v_n = row_count;
  perform set_config('app.menu_job', 'off', true);
  return v_n;
end;
$$;
revoke execute on function public.apply_menu_schedules() from public, anon, authenticated;

select cron.schedule('apply-menu-schedules', '* * * * *', $$select public.apply_menu_schedules()$$);

-- Re-evaluate right after a rule or schedule is saved so staff see the
-- effect immediately, not up to a minute later.
create or replace function public.trg_menu_rules_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_menu_schedules();
  return null;
end;
$$;
create trigger menu_schedules_changed after insert or update or delete on public.menu_schedules
  for each statement execute function public.trg_menu_rules_changed();
create trigger price_rules_changed after insert or update or delete on public.price_rules
  for each statement execute function public.trg_menu_rules_changed();

-- Price-change requests (staff who may edit the menu but not prices).
alter table public.approval_requests drop constraint approval_requests_kind_check;
alter table public.approval_requests
  add constraint approval_requests_kind_check check (kind in ('void_item', 'refund', 'price_change'));

create or replace function public.request_price_change(p_item_id uuid, p_new_price_minor bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_id uuid;
begin
  if not public.has_permission('menu.edit') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_new_price_minor is null or p_new_price_minor < 0 or length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select id, name, base_price_minor into v_item from public.menu_items where id = p_item_id and tenant_id = public.current_tenant_id();
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;

  if public.has_permission('menu.price.edit') then
    update public.menu_items set price_minor = p_new_price_minor where id = p_item_id;
    return jsonb_build_object('status', 'changed');
  end if;

  insert into public.approval_requests (tenant_id, kind, entity_id, amount_minor, reason, summary, requested_by)
  values (public.current_tenant_id(), 'price_change', p_item_id, p_new_price_minor, trim(p_reason),
          v_item.name || ': ₹' || (v_item.base_price_minor / 100.0)::numeric(12,2) || ' → ₹' || (p_new_price_minor / 100.0)::numeric(12,2),
          public.current_membership_id())
  returning id into v_id;

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (public.current_tenant_id(), 'system', 'percent', 'Approval needed · price change', v_item.name || ': ' || trim(p_reason),
          'approval_requests', v_id, array['Manager']);
  return jsonb_build_object('status', 'pending_approval', 'request_id', v_id);
end;
$$;
revoke execute on function public.request_price_change(uuid, bigint, text) from public, anon;
grant execute on function public.request_price_change(uuid, bigint, text) to authenticated;

create or replace function public.review_approval_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
begin
  select * into v_req from public.approval_requests
  where id = p_request_id and tenant_id = public.current_tenant_id() for update;
  if v_req.id is null then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;
  if (v_req.kind = 'void_item' and not public.has_permission('orders.void'))
     or (v_req.kind = 'refund' and not public.has_permission('payments.refund'))
     or (v_req.kind = 'price_change' and not public.has_permission('menu.price.edit')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_approve then
    if v_req.kind = 'void_item' then
      perform public.apply_void_item(v_req.entity_id, v_req.reason, v_req.requested_by);
    elsif v_req.kind = 'refund' then
      perform public.apply_refund(v_req.entity_id, v_req.amount_minor, v_req.reason);
    else
      update public.menu_items set price_minor = v_req.amount_minor where id = v_req.entity_id;
    end if;
  end if;

  update public.approval_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = public.current_membership_id(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_request_id;

  insert into public.notifications (tenant_id, category, icon, title, body, entity_type, entity_id, audience_roles)
  values (public.current_tenant_id(), 'orders', 'bell',
          'Request ' || case when p_approve then 'approved' else 'rejected' end || ' · ' || replace(v_req.kind, '_', ' '),
          v_req.summary, 'approval_requests', p_request_id, array['Waiter', 'Cashier', 'Manager']);
end;
$$;

-- Undo a past change: put a previous name / description / price back.
create or replace function public.restore_menu_item_version(p_history_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
begin
  if not public.has_permission('menu.edit') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_h from public.menu_item_history where id = p_history_id and tenant_id = public.current_tenant_id();
  if v_h.id is null then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;
  -- Restoring a price goes through the same permission guard as editing one.
  update public.menu_items
  set name = coalesce(v_h.old_name, name), description = v_h.old_description,
      price_minor = coalesce(v_h.old_price_minor, price_minor)
  where id = v_h.menu_item_id;
end;
$$;
revoke execute on function public.restore_menu_item_version(uuid) from public, anon;
grant execute on function public.restore_menu_item_version(uuid) to authenticated;
