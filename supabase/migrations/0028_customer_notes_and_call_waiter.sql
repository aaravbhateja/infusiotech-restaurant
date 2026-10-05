alter table public.customers add column staff_notes text;

-- Real "call waiter" feature: a guest on the live order-tracking screen taps
-- a button, staff with orders.view get a realtime notification scoped to
-- the right table. Reuses the existing notifications table/read policy —
-- insertion here is service-role only (via the edge function), matching
-- the trust boundary of every other guest-initiated write.
create or replace function public.notify_waiter_call(p_table_token_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_table_label text;
begin
  select qa.tenant_id, rt.label into v_tenant_id, v_table_label
  from public.qr_assets qa
  join public.restaurant_tables rt on rt.id = qa.table_id
  where qa.public_token_hash = p_table_token_hash and qa.status = 'active';

  if v_tenant_id is null then
    raise exception 'invalid_or_inactive_table_token' using errcode = 'P0001';
  end if;

  insert into public.notifications (tenant_id, category, icon, title, body)
  values (v_tenant_id, 'orders', 'bell', v_table_label || ' needs a waiter', 'A guest tapped "Call waiter".');
end;
$$;

revoke execute on function public.notify_waiter_call(text) from public, authenticated;
grant execute on function public.notify_waiter_call(text) to anon;
