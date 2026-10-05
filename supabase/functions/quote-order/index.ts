// Public endpoint: live pricing preview for the checkout screen's bill
// breakdown (subtotal, discount, GST, total) as the cart or promo code
// changes — no order or Razorpay object is created here, just a read-only
// price via quote_public_order.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  const { data, error } = await admin.rpc('quote_public_order', {
    p_table_token_hash: tokenHash,
    p_items: body.items,
    p_offer_code: body.offerCode ?? null,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
