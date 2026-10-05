-- Every postgres_changes subscription built across this app (staff order
-- screens, the customer order-tracking screen, staff invite/notification
-- screens) has been silently inert: the supabase_realtime publication had
-- zero tables in it, so Postgres never broadcast any change at all. This is
-- why every screen needed a manual pull-to-refresh to see updates, and why
-- a customer watching their order never saw its status change live.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.staff_invitations;
alter publication supabase_realtime add table public.tenant_memberships;
