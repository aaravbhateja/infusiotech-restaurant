-- Customers, orders (immutable item snapshots), payments, refunds, audit log.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text,
  phone text,
  email text,
  consent_marketing boolean not null default false,
  created_at timestamptz not null default now()
);

create index customers_tenant_id_idx on public.customers (tenant_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  table_id uuid references public.restaurant_tables (id),
  customer_id uuid references public.customers (id),
  order_number text not null,
  order_status text not null default 'new'
    check (order_status in ('new', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'cash_received', 'reconciled')),
  currency text not null default 'INR',
  subtotal_minor bigint not null,
  tax_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  total_minor bigint not null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  unique (tenant_id, order_number)
);

create index orders_tenant_id_idx on public.orders (tenant_id);
create index orders_tenant_status_idx on public.orders (tenant_id, order_status);
create index orders_table_id_idx on public.orders (table_id);

-- Immutable snapshot: never mutated when the current menu changes later.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name_snapshot text not null,
  variant_snapshot jsonb not null default '[]'::jsonb,
  addon_snapshot jsonb not null default '[]'::jsonb,
  unit_price_minor bigint not null,
  quantity int not null check (quantity > 0),
  tax_minor bigint not null default 0,
  line_total_minor bigint not null
);

create index order_items_tenant_id_idx on public.order_items (tenant_id);
create index order_items_order_id_idx on public.order_items (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'razorpay' check (provider in ('razorpay', 'cash')),
  provider_reference text,
  amount_minor bigint not null,
  currency text not null default 'INR',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'cash_received', 'reconciled')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create index payments_tenant_id_idx on public.payments (tenant_id);
create index payments_order_id_idx on public.payments (order_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete cascade,
  amount_minor bigint not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  provider_reference text,
  created_at timestamptz not null default now()
);

create index refunds_tenant_id_idx on public.refunds (tenant_id);

-- tenant_id nullable: platform-level events (super admin actions) have none.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_user_id uuid references public.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_summary jsonb,
  after_summary jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_events_tenant_id_idx on public.audit_events (tenant_id);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
