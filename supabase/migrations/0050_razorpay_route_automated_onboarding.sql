-- Automates Razorpay Route onboarding: submitting KYC now also creates a
-- Razorpay Linked Account (+ Stakeholder + Route product request) via the
-- submit-tenant-kyc edge function, and a new razorpay-webhook edge function
-- listens for Razorpay's own account.activated / needs_clarification /
-- rejected events to update status automatically — no admin has to paste in
-- a linked account id for the happy path anymore. admin_review_tenant_kyc
-- stays as a manual override/fallback for anything that needs a human.

alter table public.tenant_kyc drop constraint tenant_kyc_status_check;
alter table public.tenant_kyc add constraint tenant_kyc_status_check
  check (status in ('pending', 'submitted', 'under_review', 'needs_clarification', 'verified', 'rejected'));

alter table public.tenant_kyc add column business_type text not null default 'individual'
  check (business_type in ('individual', 'proprietorship', 'partnership', 'llp', 'private_limited'));
alter table public.tenant_kyc add column business_pan text;
alter table public.tenant_kyc add column gstin text;

-- submit_tenant_kyc now also captures business type / business PAN / GSTIN,
-- and returns tenant_id so the edge function calling it knows which tenant
-- to create a Razorpay account for without a second round trip. The three
-- new trailing params make this a distinct overload from the old 6-arg
-- version (Postgres identifies functions by name + argument types), so the
-- old one is dropped explicitly rather than left as dead, callable code.
drop function if exists public.submit_tenant_kyc(text, text, text, text, text, text);

create function public.submit_tenant_kyc(
  p_legal_business_name text,
  p_pan text,
  p_aadhar_number text,
  p_bank_account_holder_name text,
  p_bank_account_number text,
  p_bank_ifsc text,
  p_business_type text default 'individual',
  p_business_pan text default null,
  p_gstin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tenant_id uuid;
  v_pan text := upper(trim(p_pan));
  v_aadhar text := regexp_replace(coalesce(p_aadhar_number, ''), '\D', '', 'g');
  v_ifsc text := upper(trim(p_bank_ifsc));
  v_account text := regexp_replace(coalesce(p_bank_account_number, ''), '\s', '', 'g');
  v_business_type text := lower(trim(coalesce(p_business_type, 'individual')));
  v_business_pan text := nullif(upper(trim(coalesce(p_business_pan, ''))), '');
  v_gstin text := nullif(upper(trim(coalesce(p_gstin, ''))), '');
  v_kyc_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if not public.has_permission('payments.kyc.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if length(trim(coalesce(p_legal_business_name, ''))) = 0 then
    raise exception 'legal_business_name_required' using errcode = 'P0001';
  end if;

  if v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'invalid_pan' using errcode = 'P0001';
  end if;

  if length(v_aadhar) <> 12 then
    raise exception 'invalid_aadhar' using errcode = 'P0001';
  end if;

  if length(trim(coalesce(p_bank_account_holder_name, ''))) = 0 then
    raise exception 'bank_account_holder_name_required' using errcode = 'P0001';
  end if;

  if length(v_account) < 6 then
    raise exception 'invalid_bank_account_number' using errcode = 'P0001';
  end if;

  if v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
    raise exception 'invalid_ifsc' using errcode = 'P0001';
  end if;

  if v_business_type not in ('individual', 'proprietorship', 'partnership', 'llp', 'private_limited') then
    raise exception 'invalid_business_type' using errcode = 'P0001';
  end if;

  if v_business_type <> 'individual' and (v_business_pan is null or v_business_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$') then
    raise exception 'invalid_business_pan' using errcode = 'P0001';
  end if;

  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    raise exception 'invalid_gstin' using errcode = 'P0001';
  end if;

  insert into public.tenant_kyc (
    tenant_id, legal_business_name, pan, aadhar_last4, aadhar_hash,
    bank_account_holder_name, bank_account_number, bank_ifsc, status, submitted_at,
    business_type, business_pan, gstin
  ) values (
    v_tenant_id, trim(p_legal_business_name), v_pan, right(v_aadhar, 4), encode(digest(v_aadhar, 'sha256'), 'hex'),
    trim(p_bank_account_holder_name), v_account, v_ifsc, 'submitted', now(),
    v_business_type, v_business_pan, v_gstin
  )
  on conflict (tenant_id) do update set
    legal_business_name = excluded.legal_business_name,
    pan = excluded.pan,
    aadhar_last4 = excluded.aadhar_last4,
    aadhar_hash = excluded.aadhar_hash,
    bank_account_holder_name = excluded.bank_account_holder_name,
    bank_account_number = excluded.bank_account_number,
    bank_ifsc = excluded.bank_ifsc,
    business_type = excluded.business_type,
    business_pan = excluded.business_pan,
    gstin = excluded.gstin,
    status = 'submitted',
    rejection_reason = null,
    razorpay_linked_account_id = null,
    submitted_at = now(),
    verified_at = null,
    verified_by = null,
    updated_at = now()
  returning id into v_kyc_id;

  -- A resubmission (e.g. after a rejection, or to correct bank details)
  -- always needs a fresh Razorpay review before money can flow again.
  update public.tenants set pay_online_enabled = false where id = v_tenant_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_tenant_id, auth.uid(), 'kyc.submitted', 'tenant_kyc', v_kyc_id);

  return jsonb_build_object('status', 'submitted', 'tenant_id', v_tenant_id, 'kyc_id', v_kyc_id);
end;
$$;

revoke execute on function public.submit_tenant_kyc(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_tenant_kyc(text, text, text, text, text, text, text, text, text) to authenticated;

-- get_tenant_kyc surfaces the new fields too, for the restaurant's own
-- settings screen.
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
    'business_type', coalesce(k.business_type, 'individual'),
    'business_pan', k.business_pan,
    'gstin', k.gstin,
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

-- ── Internal: edge functions only (service role) ────────────────────────
-- Called by submit-tenant-kyc right after it creates the Razorpay Linked
-- Account, and by razorpay-webhook whenever Razorpay reports a status
-- change on that account. Never exposed to anon/authenticated — a
-- restaurant marking its own KYC "verified" would defeat the entire point.
create or replace function public.internal_set_tenant_kyc_razorpay_status(
  p_tenant_id uuid,
  p_razorpay_account_id text,
  p_status text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('under_review', 'needs_clarification', 'verified', 'rejected') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;

  update public.tenant_kyc
  set razorpay_linked_account_id = coalesce(p_razorpay_account_id, razorpay_linked_account_id),
      status = p_status,
      rejection_reason = case when p_status = 'rejected' then p_rejection_reason else null end,
      verified_at = case when p_status = 'verified' then now() else null end,
      verified_by = null, -- automated, not a human admin
      updated_at = now()
  where tenant_id = p_tenant_id;

  if not found then
    raise exception 'kyc_not_found' using errcode = 'P0001';
  end if;

  update public.tenants set pay_online_enabled = (p_status = 'verified') where id = p_tenant_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (p_tenant_id, null, 'kyc.razorpay_status:' || p_status, 'tenant_kyc', p_tenant_id);
end;
$$;

revoke execute on function public.internal_set_tenant_kyc_razorpay_status(uuid, text, text, text) from public, anon, authenticated;

-- Same update, looked up by Razorpay account id instead of tenant id —
-- that's all the webhook payload gives us.
create or replace function public.internal_set_tenant_kyc_razorpay_status_by_account(
  p_razorpay_account_id text,
  p_status text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.tenant_kyc where razorpay_linked_account_id = p_razorpay_account_id;

  if v_tenant_id is null then
    raise exception 'kyc_not_found_for_account' using errcode = 'P0001';
  end if;

  perform public.internal_set_tenant_kyc_razorpay_status(v_tenant_id, p_razorpay_account_id, p_status, p_rejection_reason);
end;
$$;

revoke execute on function public.internal_set_tenant_kyc_razorpay_status_by_account(text, text, text) from public, anon, authenticated;

-- admin_list_pending_kyc now also shows the Razorpay account id + business
-- type, so an admin reviewing a stuck/failed automated submission can see
-- what's already there before manually intervening.
drop function if exists public.admin_list_pending_kyc();

create function public.admin_list_pending_kyc()
returns table (
  tenant_id uuid,
  tenant_name text,
  status text,
  legal_business_name text,
  pan text,
  aadhar_last4 text,
  bank_account_holder_name text,
  bank_account_number text,
  bank_ifsc text,
  business_type text,
  business_pan text,
  gstin text,
  razorpay_linked_account_id text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select k.tenant_id, t.name, k.status, k.legal_business_name, k.pan, k.aadhar_last4,
         k.bank_account_holder_name, k.bank_account_number, k.bank_ifsc,
         k.business_type, k.business_pan, k.gstin, k.razorpay_linked_account_id, k.submitted_at
  from public.tenant_kyc k
  join public.tenants t on t.id = k.tenant_id
  where public.is_super_admin() and k.status in ('submitted', 'under_review', 'needs_clarification', 'verified', 'rejected')
  order by (k.status in ('submitted', 'needs_clarification')) desc, k.submitted_at desc nulls last;
$$;

revoke execute on function public.admin_list_pending_kyc() from public, anon;
grant execute on function public.admin_list_pending_kyc() to authenticated;
