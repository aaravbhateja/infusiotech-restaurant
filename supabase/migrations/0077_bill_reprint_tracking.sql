-- Reprint / duplicate bills: every print is counted, and any print after the
-- first is marked DUPLICATE COPY on paper and recorded in the audit log.
alter table public.orders add column bill_print_count smallint not null default 0;

create or replace function public.log_bill_print(p_order_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count smallint;
  v_tenant uuid;
begin
  if not (public.has_permission('payments.view') or public.has_permission('payments.cash.collect')
          or public.has_permission('orders.create')) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update public.orders set bill_print_count = bill_print_count + 1
  where id = p_order_id and tenant_id = public.current_tenant_id()
  returning bill_print_count, tenant_id into v_count, v_tenant;

  if v_count is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if v_count > 1 then
    insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
    values (v_tenant, auth.uid(), 'bill.reprinted', 'orders', p_order_id, jsonb_build_object('copy', v_count));
  end if;
  return v_count;
end;
$$;

revoke execute on function public.log_bill_print(uuid) from public, anon;
grant execute on function public.log_bill_print(uuid) to authenticated;
