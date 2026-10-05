-- Real UPI/Card/Netbanking/Wallet breakdown for the cashier's payments
-- screen — previously every online payment was just lumped under
-- provider='razorpay' with no way to tell a UPI payment from a card one.

alter table public.payments add column method text;

update public.payments set method = 'cash' where provider = 'cash' and method is null;

create or replace function public.record_cash_payment(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_payment_id uuid;
begin
  select id, tenant_id, total_minor, currency, payment_status into v_order
  from public.orders
  where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if not public.has_permission('payments.cash.record') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_order.payment_status not in ('unpaid', 'pending') then
    raise exception 'invalid_payment_state' using errcode = 'P0001';
  end if;

  insert into public.payments (tenant_id, order_id, provider, method, amount_minor, currency, status, verified_at)
  values (v_order.tenant_id, p_order_id, 'cash', 'cash', v_order.total_minor, v_order.currency, 'cash_received', now())
  returning id into v_payment_id;

  update public.orders set payment_status = 'cash_received' where id = p_order_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_order.tenant_id, auth.uid(), 'payment.cash_recorded', 'payments', v_payment_id);

  return jsonb_build_object('payment_id', v_payment_id, 'payment_status', 'cash_received');
end;
$$;

-- create_public_order's p_payment jsonb now carries an optional 'method'
-- (the real method Razorpay reports — upi/card/netbanking/wallet) through
-- to the payments row it inserts for an online order.
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
    insert into public.payments (tenant_id, order_id, provider, method, provider_reference, amount_minor, currency, status, verified_at)
    values (v_tenant_id, v_order_id, p_payment->>'provider', p_payment->>'method', p_payment->>'reference', v_total_minor, 'INR', 'paid', now());
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
