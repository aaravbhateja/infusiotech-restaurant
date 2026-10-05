-- On a hosted Supabase project, pgcrypto installs into the `extensions`
-- schema, not `public` (unlike a bare local Postgres, where 0001's
-- unqualified `create extension pgcrypto` lands in `public`). gen_random_uuid()
-- never notices because it's built into Postgres core since v13, but
-- digest() is pgcrypto-only — so submit_tenant_kyc(), whose search_path was
-- just `public`, failed with "function digest(text, unknown) does not
-- exist" the moment anyone tried to submit KYC. Widening the search_path to
-- include `extensions` makes digest() resolve on both layouts.
create or replace function public.submit_tenant_kyc(
  p_legal_business_name text,
  p_pan text,
  p_aadhar_number text,
  p_bank_account_holder_name text,
  p_bank_account_number text,
  p_bank_ifsc text
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

  insert into public.tenant_kyc (
    tenant_id, legal_business_name, pan, aadhar_last4, aadhar_hash,
    bank_account_holder_name, bank_account_number, bank_ifsc, status, submitted_at
  ) values (
    v_tenant_id, trim(p_legal_business_name), v_pan, right(v_aadhar, 4), encode(digest(v_aadhar, 'sha256'), 'hex'),
    trim(p_bank_account_holder_name), v_account, v_ifsc, 'submitted', now()
  )
  on conflict (tenant_id) do update set
    legal_business_name = excluded.legal_business_name,
    pan = excluded.pan,
    aadhar_last4 = excluded.aadhar_last4,
    aadhar_hash = excluded.aadhar_hash,
    bank_account_holder_name = excluded.bank_account_holder_name,
    bank_account_number = excluded.bank_account_number,
    bank_ifsc = excluded.bank_ifsc,
    status = 'submitted',
    rejection_reason = null,
    razorpay_linked_account_id = null,
    submitted_at = now(),
    verified_at = null,
    verified_by = null,
    updated_at = now()
  returning id into v_kyc_id;

  -- A resubmission (e.g. after a rejection, or to correct bank details)
  -- always needs a fresh admin review before money can flow again.
  update public.tenants set pay_online_enabled = false where id = v_tenant_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id)
  values (v_tenant_id, auth.uid(), 'kyc.submitted', 'tenant_kyc', v_kyc_id);

  return jsonb_build_object('status', 'submitted');
end;
$$;

revoke execute on function public.submit_tenant_kyc(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_tenant_kyc(text, text, text, text, text, text) to authenticated;
