-- Collapse the three yearly-only tiers (starter/growth/premium) into one plan
-- sold either monthly (₹999) or yearly (₹9,999). Prices exclude GST.
--
-- The 'starter' row is kept and renamed rather than replaced because the
-- restaurant-onboarding functions hardcode key = 'starter' for the trial
-- subscription. Growth/premium are deactivated, and any tenant already on
-- them is moved to the single plan so the subscription screen can find it.
-- Their historical invoices keep pointing at the old plan rows.
--
-- plans.price_minor is retained as the yearly price for backwards compat.

alter table public.plans
  add column price_monthly_minor bigint,
  add column price_yearly_minor bigint;

alter table public.subscriptions
  add column billing_period text not null default 'yearly'
    check (billing_period in ('monthly', 'yearly'));

alter table public.invoices
  add column billing_period text not null default 'yearly'
    check (billing_period in ('monthly', 'yearly'));

update public.plans
set name = 'BlinkRest',
    price_minor = 999900,
    price_monthly_minor = 99900,
    price_yearly_minor = 999900,
    entitlements = '{"mobile_app": true, "tables_crm": true, "analytics": "advanced", "multi_branch": true}'::jsonb
where key = 'starter';

update public.subscriptions
set plan_id = (select id from public.plans where key = 'starter')
where plan_id in (select id from public.plans where key in ('growth', 'premium'));

update public.plans set is_active = false where key in ('growth', 'premium');

-- The old 2-arg signature must go: leaving both overloads makes the RPC
-- call ambiguous (same trap fixed in 0036).
drop function if exists public.switch_subscription_plan(uuid, text);

create or replace function public.switch_subscription_plan(
  p_tenant_id uuid,
  p_plan_key text,
  p_billing_period text default 'yearly'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_price_minor bigint;
  v_currency text;
  v_interval interval;
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('subscription.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if p_billing_period not in ('monthly', 'yearly') then
    raise exception 'unknown_billing_period' using errcode = 'P0001';
  end if;

  select id, currency,
         case when p_billing_period = 'monthly' then price_monthly_minor else price_yearly_minor end
    into v_plan_id, v_currency, v_price_minor
  from public.plans where key = p_plan_key and is_active = true;
  if v_plan_id is null or v_price_minor is null then
    raise exception 'unknown_plan' using errcode = 'P0001';
  end if;

  v_interval := case when p_billing_period = 'monthly' then interval '1 month' else interval '1 year' end;

  update public.subscriptions
  set plan_id = v_plan_id, status = 'active', billing_period = p_billing_period,
      period_start = now(), period_end = now() + v_interval
  where tenant_id = p_tenant_id;

  insert into public.invoices (tenant_id, plan_id, period_start, period_end, amount_minor, currency, status, issued_at, billing_period)
  values (p_tenant_id, v_plan_id, now(), now() + v_interval, v_price_minor, v_currency, 'issued', now(), p_billing_period);

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (p_tenant_id, auth.uid(), 'subscription.plan_changed', 'subscriptions', v_plan_id);
end;
$$;

revoke execute on function public.switch_subscription_plan(uuid, text, text) from public, anon;
grant execute on function public.switch_subscription_plan(uuid, text, text) to authenticated;
