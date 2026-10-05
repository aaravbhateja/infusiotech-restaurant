-- The customer order-tracking screen (PublicOrderScreen) subscribes to
-- postgres_changes on public.orders to show kitchen status updates live,
-- without a refresh. That subscription runs as the `anon` role (guests never
-- authenticate), but orders_read (0007_rls_policies.sql) only grants SELECT
-- to `authenticated` — so Realtime's RLS check silently drops every change
-- event for anon connections and the screen never updates until reopened.
--
-- We don't widen orders_read itself: granting anon blanket SELECT on orders
-- would let anyone with the anon key dump every order across every tenant
-- (no filter required to satisfy `using (true)`), not just their own. Instead
-- we expose a narrow, SECURITY DEFINER function that returns only the few
-- non-sensitive fields the tracking screen needs for one order at a time.
-- Its only "auth" is knowing the order id — a random UUID handed back solely
-- to the guest who placed that order — mirroring the trust model
-- create_public_order() already uses for the table QR token.
create or replace function public.get_order_tracking(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'order_status', o.order_status,
    'payment_status', o.payment_status
  )
  into v_result
  from public.orders o
  where o.id = p_order_id;

  if v_result is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

comment on function public.get_order_tracking(uuid) is
  'Public order-status/payment-status lookup for the guest tracking screen, polled client-side since anon cannot read public.orders directly. The order id itself is the capability token.';

revoke all on function public.get_order_tracking(uuid) from public;
grant execute on function public.get_order_tracking(uuid) to anon, authenticated;
