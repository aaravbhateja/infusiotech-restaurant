-- Waiters have no payments.view, so the "cash in my hand" query on their home
-- screen returned nothing. Let anyone read the payments they collected.
create policy payments_read_own_collected on public.payments
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and collected_by = public.current_membership_id());
