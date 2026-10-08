-- Cashiers have orders.view but not tables.view, so the table embedded in
-- every order came back null and each dine-in order showed as "Takeaway".
-- Anyone who can see orders may read the tenant's table rows (label/status).
create policy restaurant_tables_read_with_orders on public.restaurant_tables
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('orders.view'));
