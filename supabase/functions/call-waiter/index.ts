// Public endpoint: a guest on the order-tracking screen taps "Call waiter".
// Hashes the token server-side (never trusted from the client) and inserts
// a real-time notification staff already see on their Notifications screen.

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
  const { error } = await admin.rpc('notify_waiter_call', { p_table_token_hash: tokenHash });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
