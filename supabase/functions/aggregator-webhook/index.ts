// Inbound address for aggregator partners (Dyno) to post Zomato / Swiggy
// events to, one private URL per restaurant:
//
//   POST /functions/v1/aggregator-webhook?c=<connection id>
//   header  X-BlinkRest-Token: <that connection's inbound token>   (or  ?t=<token>)
//
// Every accepted request is stored untouched in aggregator_inbox so nothing
// is ever lost. Turning a partner's order payload into a BlinkRest order is
// done by the provider adapter below. Dyno's payload format is not wired in
// yet, so for now events are only stored and marked 'awaiting adapter'.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceRoleKey);

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Adapter: one per provider. Returns how the event was handled.
// TODO(dyno): map Dyno's order payload to POST api_create_order(source, external_id, items, ...)
// using the restaurant's item mapping, once the Dyno API documentation is available.
async function handleEvent(_connection: { id: string; tenant_id: string; provider: string }, _body: unknown): Promise<{ result: string }> {
  return { result: 'awaiting adapter' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get('c') ?? '';
  const token = req.headers.get('X-BlinkRest-Token') ?? url.searchParams.get('t') ?? '';
  if (!UUID.test(id) || !token) return json({ error: 'unauthorized' }, 401);

  const { data: conn } = await admin
    .from('aggregator_connections')
    .select('id, tenant_id, provider, inbound_secret, status')
    .eq('id', id)
    .maybeSingle();
  // Same answer for "no such connection" and "wrong token" so ids cannot be probed.
  if (!conn || !safeEqual(conn.inbound_secret, token)) return json({ error: 'unauthorized' }, 401);
  if (!['setting_up', 'active'].includes(conn.status)) return json({ error: 'integration_not_active' }, 403);

  const raw = (await req.text()).slice(0, 200_000);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // keep the raw text; the adapter decides what to do with it
  }

  const { data: row } = await admin
    .from('aggregator_inbox')
    .insert({ tenant_id: conn.tenant_id, connection_id: conn.id, body, raw_body: body ? null : raw })
    .select('id')
    .single();

  let result = 'awaiting adapter';
  try {
    if (conn.status === 'active') result = (await handleEvent(conn, body)).result;
  } catch (e) {
    result = `error: ${e instanceof Error ? e.message : 'failed'}`;
  }
  if (row) await admin.from('aggregator_inbox').update({ processed_at: new Date().toISOString(), result }).eq('id', row.id);

  return json({ ok: true });
});
