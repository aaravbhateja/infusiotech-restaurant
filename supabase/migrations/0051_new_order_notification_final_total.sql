-- "New order" notifications (and the push sent from them) always said
-- ₹0.00. Every order-creation path — create_public_order(), the staff
-- order RPCs — inserts the order row with zero totals first and only
-- fills them in with an UPDATE once the line items are priced, all in the
-- same transaction. The notify trigger ran AFTER INSERT, so it read the
-- placeholder zero.
--
-- Make it a deferred constraint trigger instead: it now fires at commit,
-- after the totals are written. A deferred trigger's NEW is still the row
-- as it was inserted, so the function re-reads the order to get the final
-- values.

create or replace function public.trg_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select tenant_id, order_number, total_minor into v_order from public.orders where id = new.id;

  -- Rolled back or deleted before commit: nothing to announce.
  if v_order.tenant_id is null then
    return null;
  end if;

  perform public.notify(
    v_order.tenant_id, 'orders', 'bolt',
    'New order #' || v_order.order_number,
    '₹' || to_char(v_order.total_minor / 100.0, 'FM999999990.00'),
    'orders', new.id
  );
  return null;
end;
$$;

drop trigger if exists on_order_created on public.orders;

create constraint trigger on_order_created
  after insert on public.orders
  deferrable initially deferred
  for each row execute function public.trg_notify_new_order();
