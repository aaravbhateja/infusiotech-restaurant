-- Lets an owner change their plan from the app. No payment gateway is wired
-- up yet (Razorpay subscriptions are a later integration) — this just moves
-- the tenant onto the chosen plan immediately, same as a manual/comped
-- upgrade a support agent would do today.

create or replace function public.switch_subscription_plan(p_tenant_id uuid, p_plan_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('subscription.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select id into v_plan_id from public.plans where key = p_plan_key and is_active = true;
  if v_plan_id is null then
    raise exception 'unknown_plan' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set plan_id = v_plan_id, status = 'active', period_start = now()
  where tenant_id = p_tenant_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (p_tenant_id, auth.uid(), 'subscription.plan_changed', 'subscriptions', v_plan_id);
end;
$$;

revoke execute on function public.switch_subscription_plan(uuid, text) from public, anon;
grant execute on function public.switch_subscription_plan(uuid, text) to authenticated;
