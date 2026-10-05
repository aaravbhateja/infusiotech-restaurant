-- get_tenant_kyc() (0047) left-joins tenant_kyc, so a brand-new restaurant
-- with no KYC row yet gets k.status = sql null. jsonb_build_object still
-- produces a non-null object — {"status": null, ...} — so the function's
-- own `coalesce(v_result, jsonb_build_object('status', 'pending', ...))`
-- fallback never triggers (v_result itself isn't null, just one of its
-- keys is). The client then indexes its status-copy map with a null key
-- and crashes. Default the status inside the object instead.
create or replace function public.get_tenant_kyc()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_result jsonb;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null or not public.has_permission('payments.kyc.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'status', coalesce(k.status, 'pending'),
    'legal_business_name', k.legal_business_name,
    'pan', k.pan,
    'aadhar_last4', k.aadhar_last4,
    'bank_account_holder_name', k.bank_account_holder_name,
    'bank_account_last4', right(k.bank_account_number, 4),
    'bank_ifsc', k.bank_ifsc,
    'rejection_reason', k.rejection_reason,
    'submitted_at', k.submitted_at,
    'verified_at', k.verified_at,
    'pay_online_enabled', t.pay_online_enabled
  )
  into v_result
  from public.tenants t
  left join public.tenant_kyc k on k.tenant_id = t.id
  where t.id = v_tenant_id;

  return coalesce(v_result, jsonb_build_object('status', 'pending', 'pay_online_enabled', false));
end;
$$;

revoke execute on function public.get_tenant_kyc() from public, anon;
grant execute on function public.get_tenant_kyc() to authenticated;
