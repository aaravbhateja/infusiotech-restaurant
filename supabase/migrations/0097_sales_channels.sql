-- Sales channels: tag an order as coming from Zomato, Swiggy or another
-- marketplace (entered by staff, or sent by an integration), set each
-- channel's commission, and see what the restaurant actually earns.

create or replace function public.set_order_channel(p_order uuid, p_source text, p_external_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src text := lower(trim(coalesce(p_source, '')));
begin
  if not (public.has_permission('orders.create') or public.has_permission('orders.edit')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if v_src not in ('zomato', 'swiggy', 'other', 'direct') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  update public.orders
  set source = case when v_src = 'direct' then null else v_src end,
      external_id = case when v_src = 'direct' then null else nullif(trim(p_external_id), '') end
  where id = p_order and tenant_id = public.current_tenant_id() and (source is null or source in ('zomato', 'swiggy', 'other'));
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
exception when unique_violation then
  raise exception 'order_id_already_used' using errcode = 'P0001';
end;
$$;

-- Percent of the order value (after discount, before GST) each channel keeps.
create or replace function public.set_channel_commissions(p_zomato numeric, p_swiggy numeric, p_other numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if least(p_zomato, p_swiggy, p_other) < 0 or greatest(p_zomato, p_swiggy, p_other) > 60 then
    raise exception 'invalid_settings' using errcode = 'P0001';
  end if;
  update public.tenants
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{commissions}',
        jsonb_build_object('zomato', p_zomato, 'swiggy', p_swiggy, 'other', p_other))
  where id = public.current_tenant_id();
end;
$$;

create or replace function public.channel_report(p_from date, p_to date)
returns table (channel text, orders bigint, gross_minor bigint, commission_pct numeric, commission_minor bigint, net_minor bigint)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select settings->'commissions' as c from public.tenants where id = public.current_tenant_id()
  ), o as (
    select coalesce(x.source, 'direct') as ch, x.total_minor, x.subtotal_minor - x.discount_minor as base
    from public.orders x
    where x.tenant_id = public.current_tenant_id() and public.has_permission('reports.financial.view')
      and x.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata')
      and x.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
      and x.order_status not in ('rejected', 'cancelled')
  )
  select o.ch, count(*)::bigint, sum(o.total_minor)::bigint,
         coalesce((cfg.c ->> o.ch)::numeric, 0),
         round(sum(o.base) * coalesce((cfg.c ->> o.ch)::numeric, 0) / 100.0)::bigint,
         (sum(o.total_minor) - round(sum(o.base) * coalesce((cfg.c ->> o.ch)::numeric, 0) / 100.0))::bigint
  from o cross join cfg
  group by o.ch, cfg.c
  order by 3 desc;
$$;

revoke execute on function public.set_order_channel(uuid, text, text) from public, anon;
revoke execute on function public.set_channel_commissions(numeric, numeric, numeric) from public, anon;
revoke execute on function public.channel_report(date, date) from public, anon;
grant execute on function public.set_order_channel(uuid, text, text) to authenticated;
grant execute on function public.set_channel_commissions(numeric, numeric, numeric) to authenticated;
grant execute on function public.channel_report(date, date) to authenticated;
