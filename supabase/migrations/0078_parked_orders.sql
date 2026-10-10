-- Hold / resume: a half-built order can be parked and resumed later, from any
-- device. Parked carts are not orders: nothing reaches the kitchen until the
-- order is actually placed.
create table public.parked_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by uuid not null references public.tenant_memberships (id),
  table_id uuid references public.restaurant_tables (id) on delete set null,
  label text not null,
  guest_count int,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now()
);
create index parked_orders_tenant_idx on public.parked_orders (tenant_id, created_at desc);
alter table public.parked_orders enable row level security;

create policy parked_orders_read on public.parked_orders
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('orders.create'));

create policy parked_orders_insert on public.parked_orders
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.has_permission('orders.create')
    and created_by = public.current_membership_id()
  );

create policy parked_orders_delete on public.parked_orders
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('orders.create'));

alter publication supabase_realtime add table public.parked_orders;
