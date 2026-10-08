-- 0062 granted the new cash permissions only to the shared system roles.
-- Restaurants that had customised a role (0038 clones it per tenant) never
-- received them, so e.g. their Waiters could not record payments.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'payments.cash.collect'
where r.name = 'Waiter'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'payments.cash.receive'
where r.name in ('Cashier', 'Manager')
on conflict do nothing;
