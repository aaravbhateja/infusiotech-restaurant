-- food_rating/service_rating/speed_rating columns have existed since 0012
-- but submit_review() never collected them, so every review's sub-scores
-- were silently null. Customers can now optionally rate each separately.

drop function if exists public.submit_review(uuid, int, text, text);

create or replace function public.submit_review(
  p_order_id uuid,
  p_rating int,
  p_comment text default null,
  p_customer_name text default null,
  p_food_rating int default null,
  p_service_rating int default null,
  p_speed_rating int default null
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

  if p_food_rating is not null and (p_food_rating < 1 or p_food_rating > 5) then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if p_service_rating is not null and (p_service_rating < 1 or p_service_rating > 5) then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if p_speed_rating is not null and (p_speed_rating < 1 or p_speed_rating > 5) then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.reviews where order_id = p_order_id) then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  insert into public.reviews (tenant_id, order_id, customer_id, customer_name, rating, comment, food_rating, service_rating, speed_rating)
  values (v_order.tenant_id, p_order_id, v_order.customer_id, p_customer_name, p_rating, p_comment, p_food_rating, p_service_rating, p_speed_rating)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_review(uuid, int, text, text, int, int, int) from public;
grant execute on function public.submit_review(uuid, int, text, text, int, int, int) to anon, authenticated;
