// Authenticated endpoint: the staff-facing "Online payments & KYC" screen
// calls this instead of the submit_tenant_kyc RPC directly, so that saving
// the restaurant's KYC details and kicking off Razorpay Route onboarding
// happen as one step from the restaurant's point of view.
//
// 1. Forwards the caller's own access token to submit_tenant_kyc() — reuses
//    every validation/permission/audit rule already enforced there, as that
//    user, not as an elevated service role.
// 2. On success, looks up the tenant's contact details + the just-saved KYC
//    row (unmasked — this runs server-side only) and calls Razorpay's
//    Account/Stakeholder/Product APIs to create a Linked Account.
// 3. Records whatever status Razorpay reports back immediately. This is
//    NOT the same as being activated — Razorpay's own review still has to
//    finish, which is reported later via the razorpay-webhook function.
//
// The KYC data is saved in step 1 regardless of whether steps 2-3 succeed,
// so a Razorpay-side failure never loses the restaurant's submission — it
// just leaves the account creation for an admin to retry/handle manually.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createRazorpayLinkedAccount, RazorpayError } from '../_shared/razorpay.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Razorpay's own account/product statuses collapse onto our smaller set —
// anything we don't recognise is treated as "still being reviewed" rather
// than silently left unset.
function mapRazorpayStatus(raw: string): 'under_review' | 'needs_clarification' | 'verified' | 'rejected' {
  if (raw === 'activated') return 'verified';
  if (raw === 'rejected') return 'rejected';
  if (raw === 'needs_clarification') return 'needs_clarification';
  return 'under_review';
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_authorization' }), { status: 401, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: corsHeaders });
  }

  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

  const { data: submitResult, error: submitError } = await asUser.rpc('submit_tenant_kyc', {
    p_legal_business_name: body.legalBusinessName,
    p_pan: body.pan,
    p_aadhar_number: body.aadharNumber,
    p_bank_account_holder_name: body.bankAccountHolderName,
    p_bank_account_number: body.bankAccountNumber,
    p_bank_ifsc: body.bankIfsc,
    p_business_type: body.businessType ?? 'individual',
    p_business_pan: body.businessPan ?? null,
    p_gstin: body.gstin ?? null,
  });

  if (submitError || !submitResult?.tenant_id) {
    return new Response(JSON.stringify({ error: submitError?.message ?? 'kyc_save_failed' }), { status: 400, headers: corsHeaders });
  }

  const tenantId: string = submitResult.tenant_id;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const [{ data: tenant }, { data: kyc }] = await Promise.all([
    admin.from('tenants').select('name, contact_email, contact_phone').eq('id', tenantId).maybeSingle(),
    admin.from('tenant_kyc').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  if (!tenant?.contact_email || !tenant?.contact_phone) {
    return new Response(
      JSON.stringify({ status: 'submitted', razorpay_error: 'missing_tenant_contact_details' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { accountId, status } = await createRazorpayLinkedAccount({
      legalBusinessName: kyc.legal_business_name,
      businessType: kyc.business_type,
      pan: kyc.pan,
      businessPan: kyc.business_pan,
      gstin: kyc.gstin,
      contactName: kyc.bank_account_holder_name,
      contactEmail: tenant.contact_email,
      contactPhone: tenant.contact_phone,
      bankAccountHolderName: kyc.bank_account_holder_name,
      bankAccountNumber: kyc.bank_account_number,
      bankIfsc: kyc.bank_ifsc,
    });

    const mappedStatus = mapRazorpayStatus(status);
    await admin.rpc('internal_set_tenant_kyc_razorpay_status', {
      p_tenant_id: tenantId,
      p_razorpay_account_id: accountId,
      p_status: mappedStatus,
    });

    return new Response(
      JSON.stringify({ status: mappedStatus, razorpay_account_id: accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    // The KYC record is already saved — a Razorpay-side failure here just
    // means an admin has to follow up (admin_review_tenant_kyc is still
    // there as a manual fallback), never a lost submission.
    const detail = e instanceof RazorpayError ? e.detail : e instanceof Error ? e.message : 'unknown_error';
    return new Response(
      JSON.stringify({ status: 'submitted', razorpay_error: detail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
