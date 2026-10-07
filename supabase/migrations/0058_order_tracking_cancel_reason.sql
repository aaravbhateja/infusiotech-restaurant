-- The guest tracking screen needs to tell a guest why their order was
-- rejected or cancelled, not just that its status changed. Same narrow,
-- order-id-gated lookup as 0046, now also returning the reason staff gave.
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
    'payment_status', o.payment_status,
    'cancel_reason', o.cancel_reason
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

revoke all on function public.get_order_tracking(uuid) from public;
grant execute on function public.get_order_tracking(uuid) to anon, authenticated;
