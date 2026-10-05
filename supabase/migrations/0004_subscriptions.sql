-- Plans are platform-wide (not tenant-scoped); subscriptions bind a tenant to a plan.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- 'starter' | 'growth' | 'premium'
  name text not null,
  price_minor bigint not null,
  currency text not null default 'INR',
  entitlements jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  period_start timestamptz not null default now(),
  period_end timestamptz,
  gateway_reference text,
  created_at timestamptz not null default now()
);

create index subscriptions_tenant_id_idx on public.subscriptions (tenant_id);
