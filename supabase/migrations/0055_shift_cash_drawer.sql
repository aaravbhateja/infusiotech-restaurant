-- Cash drawer for the cashier's counter screen: the opening float a shift
-- starts with, and the cash actually counted when it closes (so the screen
-- can show "expected in drawer" and the owner can see any difference).
-- Both default to null/0 so existing shifts and the waiter shift toggle,
-- which call start_shift()/end_shift() with no arguments, keep working.

alter table public.staff_shifts
  add column opening_float_minor bigint not null default 0,
  add column counted_cash_minor bigint;

-- The zero-argument versions must go: leaving them next to the defaulted
-- ones makes a no-argument RPC call ambiguous (same trap fixed in 0036).
drop function if exists public.start_shift();
drop function if exists public.end_shift();

create or replace function public.start_shift(p_opening_float_minor bigint default 0)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
  v_id uuid;
begin
  v_membership_id := public.current_membership_id();
  if v_membership_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_opening_float_minor < 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  insert into public.staff_shifts (tenant_id, membership_id, opening_float_minor)
  values (public.current_tenant_id(), v_membership_id, p_opening_float_minor)
  on conflict (membership_id) where ended_at is null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.staff_shifts where membership_id = v_membership_id and ended_at is null;
  end if;

  return v_id;
end;
$$;

create or replace function public.end_shift(p_counted_cash_minor bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff_shifts
  set ended_at = now(), counted_cash_minor = p_counted_cash_minor
  where membership_id = public.current_membership_id() and ended_at is null;
end;
$$;

revoke execute on function public.start_shift(bigint) from public, anon;
grant execute on function public.start_shift(bigint) to authenticated;
revoke execute on function public.end_shift(bigint) from public, anon;
grant execute on function public.end_shift(bigint) to authenticated;
