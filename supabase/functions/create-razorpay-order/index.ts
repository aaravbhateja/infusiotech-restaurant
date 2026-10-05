// Public endpoint: prices a cart server-side (via quote_public_order, the
// read-only twin of create_public_order) and opens a matching Razorpay
// order for that amount. No restaurant order row exists yet — one is only
// ever created by create-order, after payment is verified.
//
// Online payment is not available to every restaurant by default — it only
// turns on once the tenant has completed KYC (PAN, Aadhar, bank details),
// a platform admin has verified it, and a Razorpay Linked Account exists to
// settle into. When that's in place, the order is opened with a Razorpay
// Route `transfers` entry so 97% of the payment settles straight to the
// restaurant's linked account; the remaining 3% stays in our platform
// account as commission.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

const RESTAURANT_SHARE = 0.97;

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

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.token));
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: quote, error: quoteError } = await admin.rpc('quote_public_order', {
    p_table_token_hash: tokenHash,
    p_items: body.items,
    p_offer_code: body.offerCode ?? null,
  });

  if (quoteError || !quote) {
    return new Response(JSON.stringify({ error: quoteError?.message ?? 'could_not_price_order' }), { status: 400, headers: corsHeaders });
  }

  const [{ data: tenant }, { data: kyc }] = await Promise.all([
    admin.from('tenants').select('pay_online_enabled').eq('id', quote.tenant_id).maybeSingle(),
    admin.from('tenant_kyc').select('status, razorpay_linked_account_id').eq('tenant_id', quote.tenant_id).maybeSingle(),
  ]);

  const linkedAccountId = kyc?.status === 'verified' ? kyc.razorpay_linked_account_id : null;
  if (!tenant?.pay_online_enabled || !linkedAccountId) {
    return new Response(JSON.stringify({ error: 'online_payment_not_enabled' }), { status: 400, headers: corsHeaders });
  }

  const restaurantShareMinor = Math.round(quote.total_minor * RESTAURANT_SHARE);

  const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
  const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: quote.total_minor,
      currency: quote.currency,
      receipt: `qr_${Date.now()}`,
      transfers: [
        {
          account: linkedAccountId,
          amount: restaurantShareMinor,
          currency: quote.currency,
          on_hold: false,
          notes: { purpose: 'restaurant_payout' },
        },
      ],
    }),
  });

  if (!rpRes.ok) {
    const detail = await rpRes.text();
    return new Response(JSON.stringify({ error: 'razorpay_order_failed', detail }), { status: 502, headers: corsHeaders });
  }

  const rpOrder = await rpRes.json();

  return new Response(
    JSON.stringify({
      razorpayOrderId: rpOrder.id,
      amountMinor: quote.total_minor,
      subtotalMinor: quote.subtotal_minor,
      discountMinor: quote.discount_minor,
      gstMinor: quote.gst_minor,
      currency: quote.currency,
      keyId: razorpayKeyId,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
