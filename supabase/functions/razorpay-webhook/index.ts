// Public endpoint (Razorpay calls this directly, no user session involved)
// that Razorpay's own Route onboarding posts to whenever a Linked Account's
// review status changes. This is what actually turns "pay online" on for a
// restaurant automatically — submit-tenant-kyc only ever records whatever
// status Razorpay reports back *immediately* on account creation (almost
// always "created"/"under_review"); the real activation decision happens on
// Razorpay's side afterwards and arrives here, sometimes minutes, sometimes
// days later.
//
// Configure this URL (https://<project>.functions.supabase.co/razorpay-webhook)
// in the Razorpay Dashboard under Account & Settings → Webhooks, subscribed
// to the account.* events, and set RAZORPAY_WEBHOOK_SECRET in this project's
// edge function secrets to the signing secret Razorpay gives you there.
//
// Every request is HMAC-verified against the raw body before anything in it
// is trusted — this is the only "auth" a public webhook has, so skipping it
// would let anyone flip any restaurant's payments on by POSTing a forged
// "activated" event.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')!;

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

function mapEvent(event: string): 'under_review' | 'needs_clarification' | 'verified' | 'rejected' | null {
  switch (event) {
    case 'account.activated':
      return 'verified';
    case 'account.rejected':
      return 'rejected';
    case 'account.needs_clarification':
      return 'needs_clarification';
    case 'account.under_review':
    case 'account.activated_kyc_pending':
      return 'under_review';
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 400, headers: corsHeaders });
  }

  const payload = JSON.parse(rawBody);
  const mappedStatus = mapEvent(payload.event);
  const accountId = payload.payload?.account?.entity?.id;

  // Acknowledge events we don't act on (payments, other account sub-events,
  // …) so Razorpay doesn't keep retrying something we were never going to
  // handle — only account status events do anything here.
  if (!mappedStatus || !accountId) {
    return new Response(JSON.stringify({ ignored: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const rejectionReason = mappedStatus === 'rejected' ? payload.payload?.account?.entity?.notes?.rejection_reason ?? null : null;

  const { error } = await admin.rpc('internal_set_tenant_kyc_razorpay_status_by_account', {
    p_razorpay_account_id: accountId,
    p_status: mappedStatus,
    p_rejection_reason: rejectionReason,
  });

  if (error) {
    // Let Razorpay retry rather than silently losing a status change — this
    // only fires for an account id we don't recognise, which is either a
    // delivery for a different Razorpay account entirely, or a submission
    // whose row was deleted; either way worth surfacing via a retry/log.
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
