// Public endpoint: resolves a table's raw QR/NFC token into the tenant and
// table it belongs to, so the app can scope menu browsing before any order
// exists. Uses the service-role key to read qr_assets (locked down from
// anon/authenticated by RLS) — mirrors what the old Next.js SSR route did
// server-side. Never exposes the token hash or lets the token be enumerated:
// an unknown/revoked token gets one generic error.

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

  const { token } = await req.json().catch(() => ({ token: null }));
  if (!token || typeof token !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_token' }), { status: 400, headers: corsHeaders });
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: qr } = await admin
    .from('qr_assets')
    .select('tenant_id, table_id, status')
    .eq('public_token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle();

  if (!qr) {
    return new Response(JSON.stringify({ error: 'invalid_or_inactive_table_token' }), { status: 404, headers: corsHeaders });
  }

  const [{ data: tenant }, { data: table }, { data: reviews }] = await Promise.all([
    admin.from('tenants').select('id, name, logo_path, cover_image_path, brand_colors, settings, gst_percent, pay_online_enabled').eq('id', qr.tenant_id).single(),
    admin.from('restaurant_tables').select('id, label, capacity').eq('id', qr.table_id).single(),
    admin.from('reviews').select('rating').eq('tenant_id', qr.tenant_id),
  ]);

  const rating = reviews && reviews.length > 0
    ? { avg: reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length, count: reviews.length }
    : null;

  return new Response(JSON.stringify({ tenant, table, rating }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
