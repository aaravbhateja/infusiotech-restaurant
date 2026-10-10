-- Price-change requests are reviewed by people with menu.price.edit, so they
-- must be able to read them.
drop policy approval_requests_read on public.approval_requests;
create policy approval_requests_read on public.approval_requests
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (requested_by = public.current_membership_id()
         or public.has_permission('orders.void') or public.has_permission('payments.refund')
         or public.has_permission('menu.price.edit'))
  );
