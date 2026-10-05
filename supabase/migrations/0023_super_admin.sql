-- Platform-level Super Admin surface: tenant search/detail, subscription
-- status, support cases, usage/health overview, and QR/NFC asset admin.
-- Deliberately NOT a tenant_membership — a super admin has no tenant_id and
-- sits outside the whole RLS-by-tenant model. Every admin_* RPC here is
-- SECURITY DEFINER and starts by checking is_super_admin() itself, then
-- queries across tenants directly (bypassing per-tenant RLS by running as
-- the function owner) — the RLS policies on these tables are completely
-- unaware of super admins and stay deny-by-default for everyone else.

alter table public.users add column is_super_admin boolean not null default false;

-- One operator becomes the first super admin so there's a way in. Pass
-- your own account in from the client at onboarding time in a real
-- product; for this project the platform owner's account is seeded here.
update public.users set is_super_admin = true where email = 'bhatejaaarav1@gmail.com';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from public.users where id = auth.uid()), false);
$$;

revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- Every super-admin action is reason-coded and logged — required by the
-- design brief ("support access to tenant information must be limited,
-- reason-coded and audited"), and the only way any of this is defensible
-- against a staff member's "why did someone see our data" question later.
create table public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.users (id),
  action text not null,
  target_tenant_id uuid references public.tenants (id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_audit_log enable row level security;

create policy platform_audit_log_admin_only on public.platform_audit_log
  for select to authenticated
  using (public.is_super_admin());

-- Support tickets gain an admin reply channel (previously: tenant staff
-- could file a ticket, but nobody on the platform side had anywhere to
-- answer it from).
alter table public.support_tickets add column admin_reply text;
alter table public.support_tickets add column admin_replied_by uuid references public.users (id);
alter table public.support_tickets add column admin_replied_at timestamptz;

-- ── Tenant search / usage overview ──────────────────────────────────────
create or replace function public.admin_list_tenants(p_search text default null)
returns table (
  tenant_id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  owner_email text,
  plan_key text,
  subscription_status text,
  staff_count bigint,
  table_count bigint,
  orders_last_30d bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.name, t.slug, t.status, t.created_at,
    u.email,
    pl.key,
    sub.status,
    (select count(*) from public.tenant_memberships m where m.tenant_id = t.id and m.status = 'active'),
    (select count(*) from public.restaurant_tables rt where rt.tenant_id = t.id),
    (select count(*) from public.orders o where o.tenant_id = t.id and o.created_at > now() - interval '30 days')
  from public.tenants t
  left join lateral (
    select tm.user_id from public.tenant_memberships tm
    where tm.tenant_id = t.id and tm.role_id = '00000000-0000-0000-0000-000000000001' and tm.status = 'active'
    limit 1
  ) owner_m on true
  left join public.users u on u.id = owner_m.user_id
  left join public.subscriptions sub on sub.tenant_id = t.id
  left join public.plans pl on pl.id = sub.plan_id
  where public.is_super_admin()
    and (p_search is null or t.name ilike '%' || p_search || '%' or t.slug ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%')
  order by t.created_at desc;
$$;

revoke execute on function public.admin_list_tenants(text) from public, anon;
grant execute on function public.admin_list_tenants(text) to authenticated;

create or replace function public.admin_get_tenant_detail(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'tenant', to_jsonb(t) - 'settings' || jsonb_build_object('accepting_orders', t.settings->'accepting_orders'),
    'subscription', to_jsonb(sub) || jsonb_build_object('plan_name', pl.name, 'plan_key', pl.key),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object('name', u.display_name, 'email', u.email, 'role', r.name, 'joined_at', tm.joined_at)), '[]'::jsonb)
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
      join public.roles r on r.id = tm.role_id
      where tm.tenant_id = t.id and tm.status = 'active'
    ),
    'counts', jsonb_build_object(
      'tables', (select count(*) from public.restaurant_tables where tenant_id = t.id),
      'menu_items', (select count(*) from public.menu_items where tenant_id = t.id),
      'orders_total', (select count(*) from public.orders where tenant_id = t.id),
      'orders_last_30d', (select count(*) from public.orders where tenant_id = t.id and created_at > now() - interval '30 days'),
      'gmv_last_30d_minor', (select coalesce(sum(total_minor), 0) from public.orders where tenant_id = t.id and created_at > now() - interval '30 days' and payment_status in ('paid', 'cash_received', 'reconciled'))
    ),
    'open_tickets', (select count(*) from public.support_tickets where tenant_id = t.id and status in ('open', 'in_progress'))
  )
  into v_result
  from public.tenants t
  left join public.subscriptions sub on sub.tenant_id = t.id
  left join public.plans pl on pl.id = sub.plan_id
  where t.id = p_tenant_id;

  return v_result;
end;
$$;

revoke execute on function public.admin_get_tenant_detail(uuid) from public, anon;
grant execute on function public.admin_get_tenant_detail(uuid) to authenticated;

create or replace function public.admin_set_tenant_status(p_tenant_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_status not in ('active', 'suspended', 'closed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.tenants set status = p_status where id = p_tenant_id;

  insert into public.platform_audit_log (actor_user_id, action, target_tenant_id, reason)
  values (auth.uid(), 'set_tenant_status:' || p_status, p_tenant_id, p_reason);
end;
$$;

revoke execute on function public.admin_set_tenant_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_tenant_status(uuid, text, text) to authenticated;

-- ── Support queue, across every tenant ──────────────────────────────────
create or replace function public.admin_list_support_tickets(p_status text default null)
returns table (
  ticket_id uuid,
  tenant_id uuid,
  tenant_name text,
  kind text,
  title text,
  body text,
  status text,
  created_at timestamptz,
  admin_reply text,
  admin_replied_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select st.id, st.tenant_id, t.name, st.kind, st.title, st.body, st.status, st.created_at, st.admin_reply, st.admin_replied_at
  from public.support_tickets st
  join public.tenants t on t.id = st.tenant_id
  where public.is_super_admin()
    and (p_status is null or st.status = p_status)
  order by st.created_at desc;
$$;

revoke execute on function public.admin_list_support_tickets(text) from public, anon;
grant execute on function public.admin_list_support_tickets(text) to authenticated;

create or replace function public.admin_reply_support_ticket(p_ticket_id uuid, p_reply text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_status not in ('open', 'in_progress', 'resolved', 'planned') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  update public.support_tickets
  set admin_reply = p_reply, admin_replied_by = auth.uid(), admin_replied_at = now(), status = p_status, updated_at = now()
  where id = p_ticket_id
  returning tenant_id into v_tenant_id;

  if v_tenant_id is null then
    raise exception 'ticket_not_found' using errcode = 'P0001';
  end if;

  insert into public.platform_audit_log (actor_user_id, action, target_tenant_id, reason, metadata)
  values (auth.uid(), 'reply_support_ticket', v_tenant_id, 'Support reply', jsonb_build_object('ticket_id', p_ticket_id));
end;
$$;

revoke execute on function public.admin_reply_support_ticket(uuid, text, text) from public, anon;
grant execute on function public.admin_reply_support_ticket(uuid, text, text) to authenticated;

-- ── Platform-wide usage/health ──────────────────────────────────────────
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'total_tenants', (select count(*) from public.tenants),
    'active_tenants', (select count(*) from public.tenants where status = 'active'),
    'suspended_tenants', (select count(*) from public.tenants where status = 'suspended'),
    'new_tenants_7d', (select count(*) from public.tenants where created_at > now() - interval '7 days'),
    'orders_today', (select count(*) from public.orders where created_at::date = current_date),
    'gmv_today_minor', (select coalesce(sum(total_minor), 0) from public.orders where created_at::date = current_date and payment_status in ('paid', 'cash_received', 'reconciled')),
    'open_tickets', (select count(*) from public.support_tickets where status in ('open', 'in_progress')),
    'trialing_subscriptions', (select count(*) from public.subscriptions where status = 'trialing')
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_platform_stats() from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;

-- ── QR/NFC asset administration ─────────────────────────────────────────
create or replace function public.admin_list_qr_assets(p_tenant_id uuid)
returns table (
  qr_asset_id uuid,
  table_id uuid,
  table_label text,
  status text,
  asset_type text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select qa.id, qa.table_id, rt.label, qa.status, qa.asset_type, qa.created_at
  from public.qr_assets qa
  join public.restaurant_tables rt on rt.id = qa.table_id
  where public.is_super_admin() and qa.tenant_id = p_tenant_id
  order by rt.label;
$$;

revoke execute on function public.admin_list_qr_assets(uuid) from public, anon;
grant execute on function public.admin_list_qr_assets(uuid) to authenticated;

create or replace function public.admin_revoke_qr_asset(p_qr_asset_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.qr_assets set status = 'revoked' where id = p_qr_asset_id returning tenant_id into v_tenant_id;

  insert into public.platform_audit_log (actor_user_id, action, target_tenant_id, reason, metadata)
  values (auth.uid(), 'revoke_qr_asset', v_tenant_id, p_reason, jsonb_build_object('qr_asset_id', p_qr_asset_id));
end;
$$;

revoke execute on function public.admin_revoke_qr_asset(uuid, text) from public, anon;
grant execute on function public.admin_revoke_qr_asset(uuid, text) to authenticated;

-- Suspended restaurants stop taking orders — otherwise "suspend" is purely
-- cosmetic and a suspended tenant's QR menu keeps working for customers.
create or replace function public.create_public_order(
  p_table_token_hash text,
  p_items jsonb,
  p_customer jsonb default null,
  p_offer_code text default null,
  p_special_instructions text default null,
  p_payment jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_table_id uuid;
  v_tenant_status text;
  v_accepting boolean;
  v_auto_accept boolean;
  v_gst_percent numeric(5, 2);
  v_initial_status text;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal_minor bigint := 0;
  v_item jsonb;
  v_menu_item record;
  v_variant record;
  v_addon record;
  v_variant_ids uuid[];
  v_addon_ids uuid[];
  v_quantity int;
  v_unit_price_minor bigint;
  v_line_total_minor bigint;
  v_variant_snapshot jsonb;
  v_addon_snapshot jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_offer record;
  v_offer_id uuid;
  v_discount_minor bigint := 0;
  v_gst_minor bigint := 0;
  v_total_minor bigint := 0;
  v_eligible_minor bigint;
  v_prior_redemptions int;
  v_payment_status text;
begin
  select qa.tenant_id, qa.table_id
    into v_tenant_id, v_table_id
  from public.qr_assets qa
  where qa.public_token_hash = p_table_token_hash
    and qa.status = 'active';

  if v_tenant_id is null then
    raise exception 'invalid_or_inactive_table_token' using errcode = 'P0001';
  end if;

  select coalesce((settings->>'accepting_orders')::boolean, true), coalesce((settings->>'auto_accept')::boolean, false), gst_percent, status
    into v_accepting, v_auto_accept, v_gst_percent, v_tenant_status
  from public.tenants where id = v_tenant_id;

  if v_tenant_status <> 'active' then
    raise exception 'tenant_suspended' using errcode = 'P0001';
  end if;

  if not v_accepting then
    raise exception 'not_accepting_orders' using errcode = 'P0001';
  end if;

  v_initial_status := case when v_auto_accept then 'accepted' else 'new' end;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001';
  end if;

  if p_customer is not null and (p_customer->>'phone') is not null then
    insert into public.customers (tenant_id, name, phone)
    values (v_tenant_id, p_customer->>'name', p_customer->>'phone')
    on conflict (tenant_id, phone) where phone is not null
    do update set name = coalesce(excluded.name, public.customers.name)
    returning id into v_customer_id;
  end if;

  v_order_number := to_char(now(), 'YYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_payment_status := case when p_payment is not null then 'paid' else 'unpaid' end;

  insert into public.orders (
    tenant_id, table_id, customer_id, order_number, special_instructions,
    order_status, payment_status, subtotal_minor, tax_minor, discount_minor, total_minor
  ) values (
    v_tenant_id, v_table_id, v_customer_id, v_order_number, nullif(trim(coalesce(p_special_instructions, '')), ''),
    v_initial_status, v_payment_status, 0, 0, 0, 0
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price_minor, currency, tax_code, category_id
      into v_menu_item
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and tenant_id = v_tenant_id
      and is_available = true;

    if v_menu_item.id is null then
      raise exception 'menu_item_unavailable: %', v_item->>'menu_item_id' using errcode = 'P0001';
    end if;

    v_quantity := coalesce((v_item->>'quantity')::int, 0);
    if v_quantity <= 0 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;

    v_unit_price_minor := v_menu_item.price_minor;
    v_variant_snapshot := '[]'::jsonb;
    v_addon_snapshot := '[]'::jsonb;

    select array(select jsonb_array_elements_text(coalesce(v_item->'variant_ids', '[]'::jsonb)))::uuid[]
      into v_variant_ids;

    if v_variant_ids is not null then
      for v_variant in
        select iv.id, iv.name, iv.price_delta_minor
        from public.item_variants iv
        join public.item_variant_groups g on g.id = iv.group_id
        where iv.id = any(v_variant_ids)
          and iv.tenant_id = v_tenant_id
          and g.menu_item_id = v_menu_item.id
          and iv.is_available = true
      loop
        v_unit_price_minor := v_unit_price_minor + v_variant.price_delta_minor;
        v_variant_snapshot := v_variant_snapshot || jsonb_build_object(
          'id', v_variant.id, 'name', v_variant.name, 'price_delta_minor', v_variant.price_delta_minor
        );
      end loop;
    end if;

    select array(select jsonb_array_elements_text(coalesce(v_item->'addon_ids', '[]'::jsonb)))::uuid[]
      into v_addon_ids;

    if v_addon_ids is not null then
      for v_addon in
        select ia.id, ia.name, ia.price_delta_minor
        from public.item_addons ia
        join public.item_addon_groups g on g.id = ia.group_id
        where ia.id = any(v_addon_ids)
          and ia.tenant_id = v_tenant_id
          and g.menu_item_id = v_menu_item.id
          and ia.is_available = true
      loop
        v_unit_price_minor := v_unit_price_minor + v_addon.price_delta_minor;
        v_addon_snapshot := v_addon_snapshot || jsonb_build_object(
          'id', v_addon.id, 'name', v_addon.name, 'price_delta_minor', v_addon.price_delta_minor
        );
      end loop;
    end if;

    v_line_total_minor := v_unit_price_minor * v_quantity;
    v_subtotal_minor := v_subtotal_minor + v_line_total_minor;

    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_menu_item.id, 'category_id', v_menu_item.category_id, 'line_total_minor', v_line_total_minor
    );

    insert into public.order_items (
      tenant_id, order_id, menu_item_id, item_name_snapshot,
      variant_snapshot, addon_snapshot, unit_price_minor, quantity, tax_minor, line_total_minor
    ) values (
      v_tenant_id, v_order_id, v_menu_item.id, v_menu_item.name,
      v_variant_snapshot, v_addon_snapshot, v_unit_price_minor, v_quantity, 0, v_line_total_minor
    );
  end loop;

  if p_offer_code is not null and length(trim(p_offer_code)) > 0 then
    select * into v_offer
    from public.offers
    where tenant_id = v_tenant_id
      and upper(code) = upper(trim(p_offer_code))
      and is_active = true;

    if v_offer.id is null then
      raise exception 'invalid_offer_code' using errcode = 'P0001';
    end if;

    if v_offer.starts_at > now() then
      raise exception 'offer_not_started' using errcode = 'P0001';
    end if;

    if v_offer.ends_at is not null and v_offer.ends_at < now() then
      raise exception 'offer_expired' using errcode = 'P0001';
    end if;

    if not (extract(dow from now())::smallint = any(v_offer.days_of_week)) then
      raise exception 'offer_not_available_today' using errcode = 'P0001';
    end if;

    if v_offer.usage_limit is not null then
      select count(*) into v_prior_redemptions from public.offer_redemptions where offer_id = v_offer.id;
      if v_prior_redemptions >= v_offer.usage_limit then
        raise exception 'offer_usage_limit_reached' using errcode = 'P0001';
      end if;
    end if;

    if v_customer_id is not null then
      select count(*) into v_prior_redemptions
      from public.offer_redemptions
      where offer_id = v_offer.id and customer_id = v_customer_id;
      if v_prior_redemptions >= v_offer.per_customer_limit then
        raise exception 'offer_already_used' using errcode = 'P0001';
      end if;
    end if;

    if v_offer.scope = 'category' then
      select coalesce(sum((l->>'line_total_minor')::bigint), 0) into v_eligible_minor
      from jsonb_array_elements(v_lines) l
      where (l->>'category_id')::uuid = any(v_offer.category_ids);
    elsif v_offer.scope = 'item' then
      select coalesce(sum((l->>'line_total_minor')::bigint), 0) into v_eligible_minor
      from jsonb_array_elements(v_lines) l
      where (l->>'menu_item_id')::uuid = any(v_offer.item_ids);
    else
      v_eligible_minor := v_subtotal_minor;
    end if;

    if v_subtotal_minor < v_offer.min_order_minor then
      raise exception 'order_below_minimum' using errcode = 'P0001';
    end if;

    if v_offer.kind = 'percent' then
      v_discount_minor := round(v_eligible_minor * (v_offer.value_percent / 100.0));
      if v_offer.max_discount_minor is not null then
        v_discount_minor := least(v_discount_minor, v_offer.max_discount_minor);
      end if;
    elsif v_offer.kind = 'flat' then
      v_discount_minor := least(coalesce(v_offer.value_minor, 0), v_eligible_minor);
    elsif v_offer.kind = 'free_item' then
      select coalesce((l->>'line_total_minor')::bigint / greatest(1, (select count(*) from jsonb_array_elements(v_lines) l2 where (l2->>'menu_item_id')::uuid = v_offer.free_menu_item_id)), 0)
        into v_discount_minor
      from jsonb_array_elements(v_lines) l
      where (l->>'menu_item_id')::uuid = v_offer.free_menu_item_id
      limit 1;
      v_discount_minor := coalesce(v_discount_minor, 0);
    end if;

    v_discount_minor := greatest(0, least(v_discount_minor, v_subtotal_minor));
    v_offer_id := v_offer.id;

    insert into public.offer_redemptions (tenant_id, offer_id, order_id, customer_id, discount_minor)
    values (v_tenant_id, v_offer_id, v_order_id, v_customer_id, v_discount_minor);
  end if;

  v_gst_minor := round((v_subtotal_minor - v_discount_minor) * (v_gst_percent / 100.0));
  v_total_minor := v_subtotal_minor - v_discount_minor + v_gst_minor;

  update public.orders
  set subtotal_minor = v_subtotal_minor,
      discount_minor = v_discount_minor,
      tax_minor = v_gst_minor,
      total_minor = v_total_minor
  where id = v_order_id;

  if p_payment is not null then
    insert into public.payments (tenant_id, order_id, provider, provider_reference, amount_minor, currency, status, verified_at)
    values (v_tenant_id, v_order_id, p_payment->>'provider', p_payment->>'reference', v_total_minor, 'INR', 'paid', now());
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'tenant_id', v_tenant_id,
    'subtotal_minor', v_subtotal_minor,
    'discount_minor', v_discount_minor,
    'gst_minor', v_gst_minor,
    'total_minor', v_total_minor,
    'order_status', v_initial_status,
    'payment_status', v_payment_status
  );
end;
$$;
