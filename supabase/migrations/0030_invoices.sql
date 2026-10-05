-- Real invoice history — previously "Subscription invoices" had no backing
-- table at all. Full payment-gateway-automated recurring billing is out of
-- scope here (needs a live Razorpay Subscriptions setup this project
-- doesn't have); instead, every plan switch/renewal creates a real invoice
-- row for that period at that plan's actual price, which is genuinely true
-- and queryable rather than fabricated sample data.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  period_start timestamptz not null,
  period_end timestamptz,
  amount_minor bigint not null,
  currency text not null default 'INR',
  status text not null default 'issued' check (status in ('issued', 'paid', 'overdue', 'void')),
  issued_at timestamptz not null default now(),
  paid_at timestamptz
);

create index invoices_tenant_id_idx on public.invoices (tenant_id, issued_at desc);

alter table public.invoices enable row level security;

create policy invoices_read on public.invoices
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('subscription.manage'));

create or replace function public.switch_subscription_plan(p_tenant_id uuid, p_plan_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_price_minor bigint;
  v_currency text;
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('subscription.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select id, price_minor, currency into v_plan_id, v_price_minor, v_currency
  from public.plans where key = p_plan_key and is_active = true;
  if v_plan_id is null then
    raise exception 'unknown_plan' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set plan_id = v_plan_id, status = 'active', period_start = now(), period_end = now() + interval '1 year'
  where tenant_id = p_tenant_id;

  insert into public.invoices (tenant_id, plan_id, period_start, period_end, amount_minor, currency, status, issued_at)
  values (p_tenant_id, v_plan_id, now(), now() + interval '1 year', v_price_minor, v_currency, 'issued', now());

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (p_tenant_id, auth.uid(), 'subscription.plan_changed', 'subscriptions', v_plan_id);
end;
$$;
