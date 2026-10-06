-- 0043 only put orders, payments, notifications, staff_invitations and
-- tenant_memberships on the supabase_realtime publication. Every other
-- screen (menu, tables, offers, reviews, customers, shifts, subscription,
-- discount requests...) therefore only changed on a manual refresh, even
-- when another device made the change. Add them so every screen can
-- subscribe and update the moment data changes anywhere.
--
-- Wrapped per table so re-running (or a table already being published)
-- doesn't fail the migration. Realtime still applies each table's RLS
-- policies, so a client only receives rows it could already read.
do $$
declare
  t text;
begin
  foreach t in array array[
    'order_items', 'menu_items', 'menu_categories', 'restaurant_tables', 'offers',
    'reviews', 'customers', 'discount_requests', 'staff_shifts', 'subscriptions',
    'invoices', 'tenants', 'support_tickets', 'notification_reads'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    when undefined_table then
      null;
    end;
  end loop;
end
$$;
