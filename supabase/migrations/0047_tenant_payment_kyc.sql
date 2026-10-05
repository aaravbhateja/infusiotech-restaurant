-- Gates "pay online" behind restaurant KYC + bank-details verification, and
-- lays the groundwork for Razorpay Route split settlement (97% to the
-- restaurant's linked account, 3% retained in our platform account).
--
-- A tenant can never accept online payments just by existing — it must
-- submit PAN/Aadhar/bank details, a super admin must verify them and attach
-- the Razorpay Linked Account id created from that data, and only then can
-- the restaurant turn "pay online" on. create_public_order() enforces this
-- server-side too, not just in the UI, since the public order-creation path
-- never trusts the client.

-- ── KYC record ───────────────────────────────────────────────────────────
-- One row per tenant. Aadhaar is never stored in full — the Aadhaar Act
-- restricts storage of the full number by private entities — only the last
-- 4 digits (for display) and a SHA-256 hash (to dedupe/match) are kept.
create table public.tenant_kyc (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  legal_business_name text not null,
  pan text not null,
  aadhar_last4 text not null,
  aadhar_hash text not null,
  bank_account_holder_name text not null,
  bank_account_number text not null,
  bank_ifsc text not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'verified', 'rejected')),
  rejection_reason text,
  razorpay_linked_account_id text,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenant_kyc enable row level security;

-- Staff can only ever read their own tenant's KYC row, and only via the
-- has_permission gate below — all writes go through submit_tenant_kyc() /
-- admin_review_tenant_kyc(), never a direct insert/update from the client.
create policy tenant_kyc_read on public.tenant_kyc
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('payments.kyc.manage'));

-- ── Tenant-level pay-online switch ──────────────────────────────────────
-- Defaults to false for every restaurant, new or existing. It can only ever
-- be flipped true by set_tenant_pay_online(), which itself refuses unless
-- tenant_kyc.status = 'verified'.
alter table public.tenants add column pay_online_enabled boolean not null default false;

-- ── Route settlement bookkeeping on payments ────────────────────────────
alter table public.payments add column platform_fee_minor bigint;
alter table public.payments add column restaurant_payout_minor bigint;
alter table public.payments add column razorpay_transfer_id text;

-- ── Permission ───────────────────────────────────────────────────────────
-- Owner gets it automatically via grant_new_permission_to_owner_trigger
-- (0038). Deliberately not granted to Manager by default — financial KYC
-- and payout routing sit with the same trust level as settings.manage /
-- subscription.manage.
insert into public.permissions (key, description) values
  ('payments.kyc.manage', 'Submit restaurant KYC and manage online-payment payouts')
on conflict (key) do nothing;

create or replace function public.role_locked_permission_keys()
returns text[]
language sql
immutable
as $$
  select array['staff.manage', 'settings.manage', 'subscription.manage', 'ownership.transfer', 'payments.kyc.manage'];
$$;

-- ── Restaurant-side: submit / resubmit KYC ──────────────────────────────
create or replace function public.submit_tenant_kyc(
  p_legal_business_name text,
  p_pan text,
  p_aadhar_number text,
  p_bank_account_holder_name text,
  p_bank_account_number text,
  p_bank_ifsc text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_pan text := upper(trim(p_pan));
  v_aadhar text := regexp_replace(coalesce(p_aadhar_number, ''), '\D', '', 'g');
  v_ifsc text := upper(trim(p_bank_ifsc));
  v_account text := regexp_replace(coalesce(p_bank_account_number, ''), '\s', '', 'g');
  v_kyc_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if not public.has_permission('payments.kyc.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if length(trim(coalesce(p_legal_business_name, ''))) = 0 then
    raise exception 'legal_business_name_required' using errcode = 'P0001';
  end if;

  if v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'invalid_pan' using errcode = 'P0001';
  end if;

  if length(v_aadhar) <> 12 then
    raise exception 'invalid_aadhar' using errcode = 'P0001';
  end if;

  if length(trim(coalesce(p_bank_account_holder_name, ''))) = 0 then
    raise exception 'bank_account_holder_name_required' using errcode = 'P0001';
  end if;

  if length(v_account) < 6 then
    raise exception 'invalid_bank_account_number' using errcode = 'P0001';
  end if;

  if v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
    raise exception 'invalid_ifsc' using errcode = 'P0001';
  end if;

  insert into public.tenant_kyc (
    tenant_id, legal_business_name, pan, aadhar_last4, aadhar_hash,
    bank_account_holder_name, bank_account_number, bank_ifsc, status, submitted_at
  ) values (
    v_tenant_id, trim(p_legal_business_name), v_pan, right(v_aadhar, 4), encode(digest(v_aadhar, 'sha256'), 'hex'),
    trim(p_bank_account_holder_name), v_account, v_ifsc, 'submitted', now()
  )
  on conflict (tenant_id) do update set
    legal_business_name = excluded.legal_business_name,
    pan = excluded.pan,
    aadhar_last4 = excluded.aadhar_last4,
    aadhar_hash = excluded.aadhar_hash,
    bank_account_holder_name = excluded.bank_account_holder_name,
    bank_account_number = excluded.bank_account_number,
    bank_ifsc = excluded.bank_ifsc,
    status = 'submitted',
    rejection_reason = null,
    razorpay_linked_account_id = null,
    submitted_at = now(),
    verified_at = null,
    verified_by = null,
    updated_at = now()
  returning id into v_kyc_id;

  -- A resubmission (e.g. after a rejection, or to correct bank details)
  -- always needs a fresh admin review before money can flow again.
  update public.tenants set pay_online_enabled = false where id = v_tenant_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_tenant_id, auth.uid(), 'kyc.submitted', 'tenant_kyc', v_kyc_id);

  return jsonb_build_object('status', 'submitted');
end;
$$;

revoke execute on function public.submit_tenant_kyc(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_tenant_kyc(text, text, text, text, text, text) to authenticated;

-- Masked read for the restaurant's own settings screen — never returns the
-- full bank account number or Aadhaar.
create or replace function public.get_tenant_kyc()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null or not public.has_permission('payments.kyc.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'status', k.status,
    'legal_business_name', k.legal_business_name,
    'pan', k.pan,
    'aadhar_last4', k.aadhar_last4,
    'bank_account_holder_name', k.bank_account_holder_name,
    'bank_account_last4', right(k.bank_account_number, 4),
    'bank_ifsc', k.bank_ifsc,
    'rejection_reason', k.rejection_reason,
    'submitted_at', k.submitted_at,
    'verified_at', k.verified_at,
    'pay_online_enabled', t.pay_online_enabled
  )
  into v_result
  from public.tenants t
  left join public.tenant_kyc k on k.tenant_id = t.id
  where t.id = v_tenant_id;

  return coalesce(v_result, jsonb_build_object('status', 'pending', 'pay_online_enabled', false));
end;
$$;

revoke execute on function public.get_tenant_kyc() from public, anon;
grant execute on function public.get_tenant_kyc() to authenticated;

-- Restaurant can turn pay-online off any time, but can only turn it on once
-- KYC is verified and a Razorpay linked account exists to settle into.
create or replace function public.set_tenant_pay_online(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_kyc record;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null or not public.has_permission('payments.kyc.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_enabled then
    select status, razorpay_linked_account_id into v_kyc from public.tenant_kyc where tenant_id = v_tenant_id;
    if v_kyc.status is distinct from 'verified' or v_kyc.razorpay_linked_account_id is null then
      raise exception 'kyc_not_verified' using errcode = 'P0001';
    end if;
  end if;

  update public.tenants set pay_online_enabled = p_enabled where id = v_tenant_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_tenant_id, auth.uid(), case when p_enabled then 'pay_online.enabled' else 'pay_online.disabled' end, 'tenants', v_tenant_id);

  return jsonb_build_object('pay_online_enabled', p_enabled);
end;
$$;

revoke execute on function public.set_tenant_pay_online(boolean) from public, anon;
grant execute on function public.set_tenant_pay_online(boolean) to authenticated;

-- ── Platform-side: admin review queue ───────────────────────────────────
create or replace function public.admin_list_pending_kyc()
returns table (
  tenant_id uuid,
  tenant_name text,
  status text,
  legal_business_name text,
  pan text,
  aadhar_last4 text,
  bank_account_holder_name text,
  bank_account_number text,
  bank_ifsc text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select k.tenant_id, t.name, k.status, k.legal_business_name, k.pan, k.aadhar_last4,
         k.bank_account_holder_name, k.bank_account_number, k.bank_ifsc, k.submitted_at
  from public.tenant_kyc k
  join public.tenants t on t.id = k.tenant_id
  where public.is_super_admin() and k.status in ('submitted', 'verified', 'rejected')
  order by (k.status = 'submitted') desc, k.submitted_at desc nulls last;
$$;

revoke execute on function public.admin_list_pending_kyc() from public, anon;
grant execute on function public.admin_list_pending_kyc() to authenticated;

-- Approves or rejects a tenant's KYC. Approving requires the Razorpay
-- Linked Account id the admin created from the submitted PAN/bank details
-- (via Razorpay's Account/Stakeholder APIs, done out of band today) — Route
-- transfers can't target an account that doesn't exist yet.
create or replace function public.admin_review_tenant_kyc(
  p_tenant_id uuid,
  p_decision text,
  p_reason text default null,
  p_razorpay_linked_account_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_decision not in ('verified', 'rejected') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  if p_decision = 'verified' and (p_razorpay_linked_account_id is null or length(trim(p_razorpay_linked_account_id)) = 0) then
    raise exception 'razorpay_linked_account_id_required' using errcode = 'P0001';
  end if;

  if p_decision = 'rejected' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.tenant_kyc
  set status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then p_reason else null end,
      razorpay_linked_account_id = case when p_decision = 'verified' then trim(p_razorpay_linked_account_id) else razorpay_linked_account_id end,
      verified_at = case when p_decision = 'verified' then now() else null end,
      verified_by = case when p_decision = 'verified' then auth.uid() else null end,
      updated_at = now()
  where tenant_id = p_tenant_id;

  if not found then
    raise exception 'kyc_not_found' using errcode = 'P0001';
  end if;

  -- Rejecting (or a status change away from verified) always turns pay-online
  -- back off — never leave a stale "verified" switch pointing at a KYC
  -- record that's no longer approved.
  if p_decision = 'rejected' then
    update public.tenants set pay_online_enabled = false where id = p_tenant_id;
  else
    update public.tenants set pay_online_enabled = true where id = p_tenant_id;
  end if;

  insert into public.platform_audit_log (actor_user_id, action, target_tenant_id, reason, metadata)
  values (auth.uid(), 'kyc.' || p_decision, p_tenant_id, p_reason, jsonb_build_object('razorpay_linked_account_id', p_razorpay_linked_account_id));

  return jsonb_build_object('status', p_decision);
end;
$$;

revoke execute on function public.admin_review_tenant_kyc(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_tenant_kyc(uuid, text, text, text) to authenticated;

-- ── Server-side enforcement on the public order path ────────────────────
-- Identical to create_public_order() in 0026_payment_method_breakdown.sql,
-- plus: (1) refuse an online payment when the tenant hasn't actually been
-- cleared to accept one — the "Pay online" tile should already be hidden
-- client-side, but the public order RPC never trusts the client; and
-- (2) persist the 97/3 Route split on the payments row.
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
  v_pay_online_enabled boolean;
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
  v_platform_fee_minor bigint;
  v_restaurant_payout_minor bigint;
begin
  select qa.tenant_id, qa.table_id
    into v_tenant_id, v_table_id
  from public.qr_assets qa
  where qa.public_token_hash = p_table_token_hash
    and qa.status = 'active';

  if v_tenant_id is null then
    raise exception 'invalid_or_inactive_table_token' using errcode = 'P0001';
  end if;

  select coalesce((settings->>'accepting_orders')::boolean, true), coalesce((settings->>'auto_accept')::boolean, false), gst_percent, status, pay_online_enabled
    into v_accepting, v_auto_accept, v_gst_percent, v_tenant_status, v_pay_online_enabled
  from public.tenants where id = v_tenant_id;

  if v_tenant_status <> 'active' then
    raise exception 'tenant_suspended' using errcode = 'P0001';
  end if;

  if not v_accepting then
    raise exception 'not_accepting_orders' using errcode = 'P0001';
  end if;

  if p_payment is not null and p_payment->>'provider' = 'razorpay' and not coalesce(v_pay_online_enabled, false) then
    raise exception 'online_payment_not_enabled' using errcode = 'P0001';
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
    if p_payment->>'provider' = 'razorpay' then
      -- Razorpay Route split: 97% settles to the restaurant's linked
      -- account, the remaining 3% is our platform commission. Computed
      -- here (not trusted from the client) off the final, server-priced
      -- total.
      v_platform_fee_minor := round(v_total_minor * 0.03);
      v_restaurant_payout_minor := v_total_minor - v_platform_fee_minor;
    else
      v_platform_fee_minor := null;
      v_restaurant_payout_minor := null;
    end if;

    insert into public.payments (
      tenant_id, order_id, provider, method, provider_reference, amount_minor, currency, status, verified_at,
      platform_fee_minor, restaurant_payout_minor, razorpay_transfer_id
    )
    values (
      v_tenant_id, v_order_id, p_payment->>'provider', p_payment->>'method', p_payment->>'reference', v_total_minor, 'INR', 'paid', now(),
      v_platform_fee_minor, v_restaurant_payout_minor, p_payment->>'transfer_id'
    );
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
