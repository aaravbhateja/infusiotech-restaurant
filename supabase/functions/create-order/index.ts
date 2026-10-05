// Public endpoint: places a customer order from a table's raw QR token.
// create_public_order() is a SECURITY DEFINER RPC explicitly revoked from
// anon/authenticated, so it can only be invoked with the service-role key,
// never straight from the app. This function forwards to it, and — when the
// customer paid online — verifies the Razorpay payment signature first so a
// forged "I paid" claim can never mark an order paid.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

// Razorpay knows whether this was actually a UPI, card, netbanking or
// wallet payment — we don't, until we ask. Best-effort: if this call fails
// for any reason, the payment still goes through, just without a method
// breakdown on the cashier's ledger.
async function fetchRazorpayMethod(paymentId: string): Promise<string | null> {
  try {
    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.method === 'string' ? data.method : null;
  } catch {
    return null;
  }
}

// Route only creates the actual transfer once the payment is captured, so
// its id isn't known at order-creation time — it has to be looked up after
// the fact. Best-effort, same reasoning as fetchRazorpayMethod: a payment
// that already succeeded should never be stranded just because this lookup
// fails, it just won't have a transfer id on the ledger yet.
async function fetchRazorpayTransferId(paymentId: string): Promise<string | null> {
  try {
    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/transfers`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data?.items) ? data.items[0] : null;
    return typeof first?.id === 'string' ? first.id : null;
  } catch {
    return null;
  }
}

async function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(razorpayKeySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${orderId}|${paymentId}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: corsHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body?.token || !Array.isArray(body?.items) || body.items.length === 0) {
    return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: corsHeaders });
  }

  let payment: { provider: string; reference: string; method: string | null; transfer_id: string | null } | null = null;
  if (body.razorpayPaymentId || body.razorpayOrderId || body.razorpaySignature) {
    if (!body.razorpayPaymentId || !body.razorpayOrderId || !body.razorpaySignature) {
      return new Response(JSON.stringify({ error: 'incomplete_payment_proof' }), { status: 400, headers: corsHeaders });
    }
    const valid = await verifyRazorpaySignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'payment_verification_failed' }), { status: 400, headers: corsHeaders });
    }
    const [method, transferId] = await Promise.all([
      fetchRazorpayMethod(body.razorpayPaymentId),
      fetchRazorpayTransferId(body.razorpayPaymentId),
    ]);
    payment = { provider: 'razorpay', reference: body.razorpayPaymentId, method, transfer_id: transferId };
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.token));
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const params = {
    p_table_token_hash: tokenHash,
    p_items: body.items,
    p_customer: body.customer ?? null,
    p_offer_code: body.offerCode ?? null,
    p_special_instructions: body.specialInstructions ?? null,
    p_payment: payment,
  };

  let { data, error } = await admin.rpc('create_public_order', params);

  // The money is already captured by this point for an online payment — if
  // the offer became invalid between pricing and confirmation (someone else
  // just hit its usage limit, say), retry without it rather than strand a
  // paid customer with no order at all. The discount is lost, not the sale.
  if (error && payment && params.p_offer_code) {
    const retry = await admin.rpc('create_public_order', { ...params, p_offer_code: null });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
