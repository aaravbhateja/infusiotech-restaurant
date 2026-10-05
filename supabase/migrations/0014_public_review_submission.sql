-- Lets a guest rate their order right after placing it (no auth). One review
-- per order, tied to the order's tenant so it can never be spoofed cross-tenant.

create or replace function public.submit_review(
  p_order_id uuid,
  p_rating int,
  p_comment text default null,
  p_customer_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_id uuid;
begin
  select id, tenant_id, customer_id into v_order from public.orders where id = p_order_id;

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.reviews where order_id = p_order_id) then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  insert into public.reviews (tenant_id, order_id, customer_id, customer_name, rating, comment)
  values (v_order.tenant_id, p_order_id, v_order.customer_id, p_customer_name, p_rating, p_comment)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_review(uuid, int, text, text) from public;
grant execute on function public.submit_review(uuid, int, text, text) to anon, authenticated;

comment on function public.submit_review(uuid, int, text, text) is
  'Public (anon) entry point for the post-order rating prompt. One review per order_id; rating 1-5.';
